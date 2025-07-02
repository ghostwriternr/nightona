import { Server } from 'partyserver';
import { Daytona } from '@daytonaio/sdk';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
}

export interface SandboxState {
  sandboxId: string | null;
  isInitialized: boolean;
  devServerUrl: string | null;
  createdAt: number;
  lastAccessedAt: number;
  messages: Message[];
}

export class SandboxManager extends Server {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // WebSocket connection handling
  onConnect(connection: any) {
    console.log('Claude streaming WebSocket connected:', connection.id);
  }

  onMessage(connection: any, message: string) {
    console.log('Received WebSocket message:', message);
    try {
      const data = JSON.parse(message);
      if (data.type === 'claude_request') {
        this.handleClaudeRequest(connection, data.message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      connection.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  onClose(connection: any) {
    console.log('Claude streaming WebSocket disconnected:', connection.id);
  }

  onError(connection: any, error: any) {
    console.error('WebSocket error for connection', connection.id, ':', error);
  }

  private async handleClaudeRequest(connection: any, message: string) {
    try {
      // Get current state to access sandbox
      const sandboxState = await this.getSandboxState();
      
      if (!sandboxState.isInitialized || !sandboxState.sandboxId) {
        connection.send(JSON.stringify({
          type: 'error',
          message: 'No active sandbox found. Please initialize the project first.'
        }));
        return;
      }

      // Store the user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content: message,
        sender: 'user',
        timestamp: Date.now()
      };
      await this.addMessage(userMessage);

      // Send acknowledgment that we received the message
      connection.send(JSON.stringify({
        type: 'user_message_received',
        content: message
      }));

      // Initialize Daytona client and get sandbox
      if (!this.env.DAYTONA_API_KEY) {
        throw new Error('DAYTONA_API_KEY not found in environment');
      }

      const daytona = new Daytona({ apiKey: this.env.DAYTONA_API_KEY });
      const sandbox = await daytona.findOne({ id: sandboxState.sandboxId });

      // Create a unique session for this Claude command
      const sessionId = `claude-session-${Date.now()}`;
      await sandbox.process.createSession(sessionId);

      // Run Claude Code CLI with streaming JSON output
      const messageBase64 = btoa(message);
      
      // Check if this is the first message (no conversation history)
      const isFirstMessage = sandboxState.messages.filter(m => m.sender === 'user').length <= 1;
      const continueFlag = isFirstMessage ? '' : '--continue';
      
      const claudeCommand = `su claude -c "cd /tmp/project && echo '${messageBase64}' | base64 -d | claude --dangerously-skip-permissions ${continueFlag} --output-format stream-json --verbose"`;

      // Execute the command asynchronously so we can stream logs
      const command = await sandbox.process.executeSessionCommand(sessionId, {
        command: claudeCommand,
        async: true,
      });

      let buffer = '';
      let assistantContent = '';

      console.log('Starting Daytona log streaming...');

      // Stream logs from Claude command execution
      const logStreamingPromise = sandbox.process.getSessionCommandLogs(sessionId, command.cmdId!, (chunk) => {
        try {
          // Clean chunk of null bytes and add to buffer
          const cleanChunk = chunk.replace(/\0/g, '');
          buffer += cleanChunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              // Try to parse as JSON first (Claude streaming format)
              const claudeMessage = JSON.parse(line);

              // Send each message as WebSocket message
              connection.send(JSON.stringify({
                type: 'claude_streaming',
                data: claudeMessage
              }));

              // Store assistant messages
              if (claudeMessage.type === 'assistant' && claudeMessage.message?.content) {
                for (const block of claudeMessage.message.content) {
                  if (block.type === 'text' && block.text) {
                    assistantContent += block.text;
                  }
                }
              }
            } catch {
              // If not JSON, treat as raw text output
              const textMessage = {
                type: 'claude_text',
                content: line
              };
              connection.send(JSON.stringify(textMessage));
              assistantContent += line + '\n';
            }
          }
        } catch (error) {
          console.error('Error processing log chunk:', error);
        }
      });

      // Handle timeout for log streaming
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Claude command timed out after 30 seconds'));
        }, 30000);
      });

      try {
        await Promise.race([logStreamingPromise, timeoutPromise]);
        console.log('Daytona log streaming completed');
      } catch (timeoutError) {
        console.error('Timeout or error in log streaming:', timeoutError);
        
        // Send timeout error to frontend
        connection.send(JSON.stringify({
          type: 'error',
          message: `Claude command timed out or failed: ${timeoutError instanceof Error ? timeoutError.message : 'Unknown error'}`
        }));
      }

      // Store the complete assistant response
      if (assistantContent.trim()) {
        const aiMessage: Message = {
          id: (Date.now() + Math.random()).toString(),
          content: assistantContent.trim(),
          sender: 'assistant',
          timestamp: Date.now()
        };
        await this.addMessage(aiMessage);
      }

      // Send completion signal
      connection.send(JSON.stringify({
        type: 'claude_complete',
        content: assistantContent.trim() || 'Claude task completed'
      }));

    } catch (error) {
      console.error('Error handling Claude request:', error);
      connection.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  async getSandboxState(): Promise<SandboxState> {
    const state = await this.ctx.storage.get<SandboxState>('sandboxState');

    if (!state) {
      return {
        sandboxId: null,
        isInitialized: false,
        devServerUrl: null,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        messages: []
      };
    }

    // Update last accessed time
    state.lastAccessedAt = Date.now();
    await this.ctx.storage.put('sandboxState', state);

    return state;
  }

  async setSandboxState(sandboxId: string): Promise<void> {
    const now = Date.now();
    const existingState = await this.getSandboxState();
    const state: SandboxState = {
      sandboxId,
      isInitialized: true,
      devServerUrl: existingState.devServerUrl || null,
      createdAt: existingState.createdAt || now,
      lastAccessedAt: now,
      messages: existingState.messages || []
    };

    await this.ctx.storage.put('sandboxState', state);
  }

  async resetSandboxState(): Promise<void> {
    await this.ctx.storage.put('sandboxState', {
      sandboxId: null,
      isInitialized: false,
      devServerUrl: null,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messages: []
    });
  }

  async setDevServerUrl(url: string): Promise<void> {
    const state = await this.getSandboxState();
    state.devServerUrl = url;
    state.lastAccessedAt = Date.now();
    await this.ctx.storage.put('sandboxState', state);
  }

  async addMessage(message: Message): Promise<void> {
    const state = await this.getSandboxState();
    state.messages.push(message);
    state.lastAccessedAt = Date.now();
    await this.ctx.storage.put('sandboxState', state);
  }

  async clearMessages(): Promise<void> {
    const state = await this.getSandboxState();
    state.messages = [];
    state.lastAccessedAt = Date.now();
    await this.ctx.storage.put('sandboxState', state);
  }

  // Handle HTTP requests - keep existing functionality for non-WebSocket requests
  async onRequest(_request: Request): Promise<Response> {
    // This method is required but we use direct method calls instead of HTTP requests
    return new Response('SandboxManager Durable Object with WebSocket support is running', { status: 200 });
  }
}