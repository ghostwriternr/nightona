// Message interface for our application
export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp?: number;
}

// Sandbox state interface
export interface SandboxState {
  sandboxId: string | null;
  isInitialized: boolean;
  devServerUrl: string | null;
  createdAt: number;
  lastAccessedAt: number;
  messages: Message[];
}

// WebSocket message types for real-time communication
export interface WebSocketMessage {
  type: string;
  content?: string;
  message?: string;
  data?: unknown;
}

// Claude request message sent over WebSocket
export interface ClaudeRequest {
  type: 'claude_request';
  message: string;
}