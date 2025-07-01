import { DurableObject } from 'cloudflare:workers';

export interface SandboxState {
  sandboxId: string | null;
  isInitialized: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

export class SandboxManager extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async getSandboxState(): Promise<SandboxState> {
    const state = await this.ctx.storage.get<SandboxState>('sandboxState');

    if (!state) {
      return {
        sandboxId: null,
        isInitialized: false,
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
      };
    }

    // Update last accessed time
    state.lastAccessedAt = Date.now();
    await this.ctx.storage.put('sandboxState', state);

    return state;
  }

  async setSandboxState(sandboxId: string): Promise<void> {
    const now = Date.now();
    const state: SandboxState = {
      sandboxId,
      isInitialized: true,
      createdAt: now,
      lastAccessedAt: now
    };

    await this.ctx.storage.put('sandboxState', state);
  }

  async resetSandboxState(): Promise<void> {
    await this.ctx.storage.put('sandboxState', {
      sandboxId: null,
      isInitialized: false,
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    });
  }

  // Handle HTTP requests (required by Durable Object interface)
  async fetch(): Promise<Response> {
    // This method is required but we use direct method calls instead of HTTP requests
    return new Response('SandboxManager Durable Object is running', { status: 200 });
  }
}