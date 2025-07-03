# Design Document: Cross-Runtime Stream Compatibility for Daytona SDK

**Author**: Principal Engineer  
**Date**: January 3, 2025  
**Status**: Proposal  
**Impact**: High - Enables Cloudflare Workers, Deno, and Browser Support

## Executive Summary

The Daytona TypeScript SDK currently fails in non-Node.js JavaScript runtimes due to its dependency on Node.js-specific stream APIs. This limitation prevents adoption in modern edge computing environments like Cloudflare Workers, which represent a significant and growing market segment. This document proposes a comprehensive solution to make the SDK runtime-agnostic while maintaining full backward compatibility.

## Problem Statement

### Current State
The SDK's `getSessionCommandLogs()` method with streaming callbacks fails with `TypeError: stream.on is not a function` in Cloudflare Workers. This error occurs because the SDK assumes Node.js stream APIs (`stream.on()`, `stream.once()`, `stream.off()`) which don't exist in Web Streams API environments.

### Business Impact
- **Market Limitation**: Cannot support Cloudflare Workers (500K+ developers)
- **Adoption Barrier**: Modern serverless platforms prefer edge-compatible SDKs
- **Competitive Disadvantage**: Competitors like OpenAI SDK work seamlessly across all runtimes
- **Developer Experience**: Poor DX when SDK fails silently in non-Node environments

### Technical Scope
The issue affects:
- `/libs/sdk-typescript/src/utils/Stream.ts` - Core streaming logic
- `/libs/sdk-typescript/src/Process.ts` - API methods using streaming
- Any future features requiring real-time data streaming

## Root Cause Analysis

### Primary Issue
The `processStreamingResponse()` function directly uses Node.js EventEmitter patterns without abstraction:

```typescript
// Current implementation - Node.js specific
stream.off('data', onData);      // Line 38
stream.once('data', onData);     // Line 40
stream.on('end', () => {});      // Line 45
stream.on('error', (err) => {}); // Line 53
```

### Architectural Assumptions
1. **Axios Behavior**: Assumes `responseType: 'stream'` always returns Node.js streams
2. **Buffer Availability**: Assumes Node.js `Buffer` class exists
3. **Event Emitter Pattern**: Relies on `.on()`, `.once()`, `.off()` methods
4. **Synchronous Stream Destruction**: Uses `stream.destroy()` which may not exist

### Environment Differences
| Feature | Node.js | Cloudflare Workers | Browsers |
|---------|---------|-------------------|----------|
| Stream Type | Node.js Stream | ReadableStream | ReadableStream |
| Event Model | EventEmitter | Async Iterator | Async Iterator |
| Buffer Class | ✅ Available | ❌ Not Available | ❌ Not Available |
| responseType: 'stream' | Returns Node Stream | Returns Response | Not Applicable |

## Proposed Solution

### Design Principles
1. **Web Standards First**: Use Web Streams API as the primary interface
2. **Progressive Enhancement**: Add Node.js compatibility as an enhancement
3. **Zero Breaking Changes**: Maintain 100% backward compatibility
4. **Runtime Agnostic**: No assumptions about the JavaScript environment
5. **Type Safety**: Leverage TypeScript for compile-time guarantees

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   User API Layer                     │
│         getSessionCommandLogs(id, callback)          │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Stream Abstraction Layer                │
│                UniversalStream                       │
│         ┌─────────────┴─────────────┐               │
│         │                           │               │
│  WebStreamAdapter          NodeStreamAdapter        │
└─────────┴───────────────────────────┴───────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 Runtime Layer                        │
│   ReadableStream  │  Node.js Stream  │  Polyfills   │
└─────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Universal Stream Interface
```typescript
interface UniversalStream {
  // Core async iteration support
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
  
  // Cleanup
  cancel(): Promise<void>;
  
  // Optional: For optimization
  readonly readable: boolean;
  readonly highWaterMark?: number;
}
```

#### 2. Runtime Detection
```typescript
export const RuntimeEnvironment = {
  isNode(): boolean {
    return typeof process !== 'undefined' && 
           process.versions?.node !== undefined &&
           typeof require === 'function';
  },
  
  isCloudflareWorkers(): boolean {
    return typeof EdgeRuntime !== 'undefined' ||
           (typeof global !== 'undefined' && (global as any).WebSocketPair);
  },
  
  isDeno(): boolean {
    return typeof (globalThis as any).Deno !== 'undefined';
  },
  
  isBrowser(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.document !== 'undefined';
  },
  
  hasWebStreams(): boolean {
    return typeof globalThis.ReadableStream === 'function' &&
           typeof globalThis.WritableStream === 'function';
  }
};
```

#### 3. Stream Factory
```typescript
export function createUniversalStream(
  source: unknown,
  options?: { encoding?: 'utf8' | 'binary' }
): UniversalStream {
  // Web Streams API (preferred)
  if (source instanceof ReadableStream) {
    return new WebStreamAdapter(source, options);
  }
  
  // Axios response with body
  if (source && typeof source === 'object' && 'body' in source) {
    if (source.body instanceof ReadableStream) {
      return new WebStreamAdapter(source.body, options);
    }
  }
  
  // Node.js streams (legacy)
  if (RuntimeEnvironment.isNode() && isNodeStream(source)) {
    return new NodeStreamAdapter(source as any, options);
  }
  
  // Async iterable
  if (isAsyncIterable(source)) {
    return new AsyncIterableAdapter(source, options);
  }
  
  throw new DaytonaError(
    `Unsupported stream type. Expected ReadableStream, Node.js Stream, or AsyncIterable. ` +
    `Got: ${source?.constructor?.name || typeof source}`,
    'UNSUPPORTED_STREAM_TYPE'
  );
}
```

#### 4. Refactored processStreamingResponse
```typescript
export async function processStreamingResponse(
  getStream: () => Promise<unknown>,
  onChunk: (chunk: string) => void,
  shouldTerminate: () => Promise<boolean>,
  options: StreamProcessingOptions = {}
): Promise<void> {
  const {
    chunkTimeout = 2000,
    requireConsecutiveTermination = true,
    encoding = 'utf8',
    signal,
  } = options;
  
  const response = await getStream();
  const stream = createUniversalStream(response, { encoding });
  
  let exitCheckStreak = 0;
  const decoder = new TextDecoder(encoding);
  
  try {
    for await (const chunk of stream) {
      // Check abort signal
      if (signal?.aborted) {
        throw new DaytonaError('Stream processing aborted', 'STREAM_ABORTED');
      }
      
      if (chunk.length > 0) {
        onChunk(decoder.decode(chunk, { stream: true }));
        exitCheckStreak = 0;
      } else {
        // Handle empty chunks with termination logic
        const shouldEnd = await withTimeout(shouldTerminate(), chunkTimeout);
        if (shouldEnd) {
          exitCheckStreak += 1;
          if (!requireConsecutiveTermination || exitCheckStreak > 1) {
            break;
          }
        } else {
          exitCheckStreak = 0;
        }
      }
    }
    
    // Flush any remaining bytes
    const remaining = decoder.decode();
    if (remaining) {
      onChunk(remaining);
    }
  } finally {
    await stream.cancel();
  }
}
```

### Implementation Details

#### Web Streams Adapter
```typescript
class WebStreamAdapter implements UniversalStream {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder?: TextDecoder;
  
  constructor(
    private stream: ReadableStream<Uint8Array>,
    private options?: { encoding?: string }
  ) {
    if (options?.encoding === 'utf8') {
      this.decoder = new TextDecoder('utf-8');
    }
  }
  
  async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    this.reader = this.stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      this.reader.releaseLock();
      this.reader = null;
    }
  }
  
  async cancel(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
      this.reader = null;
    } else {
      // If no reader, cancel the stream directly
      await this.stream.cancel();
    }
  }
  
  get readable(): boolean {
    return !this.stream.locked;
  }
}
```

#### Node Streams Adapter (Backward Compatibility)
```typescript
class NodeStreamAdapter implements UniversalStream {
  private destroyed = false;
  
  constructor(
    private stream: NodeJS.ReadableStream,
    private options?: { encoding?: string }
  ) {}
  
  async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    // Use Node.js native async iteration if available
    if (this.stream[Symbol.asyncIterator]) {
      for await (const chunk of this.stream) {
        yield this.toUint8Array(chunk);
      }
      return;
    }
    
    // Fallback for older Node.js versions
    const chunks: Uint8Array[] = [];
    let resolve: ((value: IteratorResult<Uint8Array>) => void) | null = null;
    let reject: ((error: Error) => void) | null = null;
    
    const onData = (chunk: any) => {
      const uint8Chunk = this.toUint8Array(chunk);
      if (resolve) {
        resolve({ done: false, value: uint8Chunk });
        resolve = null;
        reject = null;
      } else {
        chunks.push(uint8Chunk);
      }
    };
    
    const onEnd = () => {
      if (resolve) {
        resolve({ done: true, value: undefined });
      }
      cleanup();
    };
    
    const onError = (err: Error) => {
      if (reject) {
        reject(err);
      }
      cleanup();
    };
    
    const cleanup = () => {
      this.stream.off('data', onData);
      this.stream.off('end', onEnd);
      this.stream.off('error', onError);
    };
    
    this.stream.on('data', onData);
    this.stream.on('end', onEnd);
    this.stream.on('error', onError);
    
    try {
      while (!this.destroyed) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else {
          const result = await new Promise<IteratorResult<Uint8Array>>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          if (result.done) break;
          if (result.value) yield result.value;
        }
      }
    } finally {
      cleanup();
    }
  }
  
  private toUint8Array(chunk: any): Uint8Array {
    if (chunk instanceof Uint8Array) return chunk;
    if (typeof chunk === 'string') {
      return new TextEncoder().encode(chunk);
    }
    if (Buffer.isBuffer(chunk)) {
      return new Uint8Array(chunk);
    }
    throw new Error(`Unexpected chunk type: ${typeof chunk}`);
  }
  
  async cancel(): Promise<void> {
    this.destroyed = true;
    if ('destroy' in this.stream && typeof this.stream.destroy === 'function') {
      this.stream.destroy();
    }
  }
  
  get readable(): boolean {
    return !this.destroyed && this.stream.readable;
  }
}
```

## Migration Strategy

### Phase 1: Non-Breaking Internal Changes (Week 1-2)
1. Implement stream abstraction layer
2. Add runtime detection utilities
3. Create adapter implementations
4. Add comprehensive unit tests

### Phase 2: Integration (Week 3)
1. Refactor `processStreamingResponse` to use new abstractions
2. Update `Process.ts` to handle different response types
3. Integration testing across Node.js versions
4. Add Cloudflare Workers test suite

### Phase 3: Beta Release (Week 4)
1. Release as minor version with opt-in flag
2. Partner with key customers for testing
3. Document migration guide
4. Collect performance metrics

### Phase 4: General Availability (Week 6)
1. Enable by default in new minor version
2. Deprecation notices for direct stream access
3. Update all documentation
4. Announce broader runtime support

## Testing Strategy

### Unit Tests
```typescript
describe('UniversalStream', () => {
  it('should handle Web Streams in Cloudflare Workers', async () => {
    const data = new TextEncoder().encode('test data');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    
    const universal = createUniversalStream(stream);
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of universal) {
      chunks.push(chunk);
    }
    
    expect(chunks).toHaveLength(1);
    expect(new TextDecoder().decode(chunks[0])).toBe('test data');
  });
  
  // Test Node.js streams, error handling, cancellation, etc.
});
```

### Integration Tests
- **Node.js**: Test across versions 14, 16, 18, 20
- **Cloudflare Workers**: Use Miniflare for local testing
- **Deno**: Test with Deno runtime
- **Browsers**: Test with Playwright across Chrome, Firefox, Safari

### Performance Tests
- Benchmark streaming throughput across runtimes
- Memory usage profiling
- Latency measurements for first byte

## Performance Considerations

### Memory Efficiency
- Use `TransformStream` for backpressure handling
- Implement chunking for large payloads
- Clear references immediately after use

### CPU Optimization
- Avoid unnecessary encoding/decoding
- Use native async iterators where available
- Minimize object allocations in hot paths

### Network Efficiency
- Support HTTP/2 multiplexing
- Enable compression where appropriate
- Implement retry logic with exponential backoff

## Security Considerations

### Input Validation
- Validate stream sources before processing
- Sanitize chunk data to prevent injection attacks
- Implement size limits to prevent DoS

### Error Handling
- Never expose internal errors to clients
- Log security events for monitoring
- Implement rate limiting for streaming endpoints

### Data Privacy
- Ensure streams are properly closed
- Clear sensitive data from memory
- Support encrypted transport

## Monitoring and Observability

### Metrics to Track
- Stream creation success/failure rates by runtime
- Average stream duration
- Data throughput (bytes/second)
- Error rates by error type
- Runtime distribution of SDK usage

### Logging Strategy
```typescript
logger.debug('Stream created', { 
  runtime: RuntimeEnvironment.detect(),
  streamType: stream.constructor.name,
  encoding: options.encoding 
});
```

## Rollback Plan

If issues arise:
1. Feature flag to disable universal streams
2. Fallback to legacy implementation for Node.js
3. Clear communication about supported runtimes
4. Hotfix process for critical issues

## Success Metrics

### Technical Metrics
- **Zero regression**: 100% backward compatibility
- **Runtime coverage**: Support for Node.js, Cloudflare Workers, Deno, Browsers
- **Performance**: No more than 5% overhead vs. direct implementation
- **Reliability**: 99.9% success rate for stream operations

### Business Metrics
- **Adoption**: 25% of users on Cloudflare Workers within 6 months
- **Developer Satisfaction**: NPS improvement of 10 points
- **Support Tickets**: 50% reduction in streaming-related issues
- **Market Reach**: Enable 3 new platform integrations

## Future Considerations

### WebAssembly Support
- Consider WASM modules for performance-critical paths
- Enable running in even more constrained environments

### Streaming Protocols
- Support for WebRTC data channels
- Server-Sent Events (SSE) compatibility
- WebSocket streaming adapter

### API Extensions
```typescript
// Future API possibilities
stream.pipe(transform).pipe(destination);
stream.tee(); // Split stream
stream.metrics(); // Performance data
```

## Dependencies and Risks

### Dependencies
- No new runtime dependencies
- Optional: `web-streams-polyfill` for older browsers
- Development: Additional testing frameworks

### Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | High | Comprehensive test suite, beta program |
| Performance regression | Medium | Benchmarking, optimization phase |
| Incomplete runtime support | Low | Clear documentation, graceful fallbacks |
| Increased bundle size | Low | Tree-shaking, conditional imports |

## Timeline

- **Week 1-2**: Implementation of core abstractions
- **Week 3**: Integration and testing
- **Week 4**: Beta release and feedback
- **Week 5**: Performance optimization and bug fixes
- **Week 6**: General availability

## Conclusion

This design enables Daytona SDK to work seamlessly across all JavaScript runtimes while maintaining backward compatibility. By embracing Web Standards and providing appropriate abstractions, we position the SDK for long-term success in the evolving JavaScript ecosystem.

The investment in cross-runtime compatibility will:
1. Expand our addressable market significantly
2. Improve developer experience
3. Reduce support burden
4. Position Daytona as a leader in edge-compatible development tools

## Appendix

### A. Reference Implementations
- [OpenAI SDK Streaming](https://github.com/openai/openai-node/blob/main/src/streaming.ts)
- [Web Streams Polyfill](https://github.com/MattiasBuelens/web-streams-polyfill)
- [Node.js Streams Documentation](https://nodejs.org/api/stream.html)

### B. Cloudflare Workers Limitations
- No Node.js APIs
- 128MB memory limit
- 30-second CPU time limit
- Web Streams API only

### C. Testing Resources
- [Miniflare](https://miniflare.dev/) - Cloudflare Workers simulator
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare Workers CLI
- [Vitest](https://vitest.dev/) - Fast unit testing with Workers support