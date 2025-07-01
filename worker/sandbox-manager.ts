import { DurableObject } from 'cloudflare:workers';

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

  // Handle HTTP requests (required by Durable Object interface)
  async fetch(): Promise<Response> {
    // This method is required but we use direct method calls instead of HTTP requests
    return new Response('SandboxManager Durable Object is running', { status: 200 });
  }
}