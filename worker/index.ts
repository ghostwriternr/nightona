import { Daytona } from '@daytonaio/sdk';
import type { SDKMessage } from '@anthropic-ai/claude-code';
import { SandboxManager, type SandboxState, type Message } from './sandbox-manager';

// Export the Durable Object class
export { SandboxManager };

async function getOrCreateSandbox(
  daytona: Daytona,
  CLAUDE_SNAPSHOT_NAME: string,
  env: Env,
  sandboxState: SandboxState
) {
  // Try to reuse existing sandbox
  if (sandboxState.sandboxId) {
    try {
      console.log(`Attempting to find existing sandbox with ID: ${sandboxState.sandboxId}`);
      const sandbox = await daytona.findOne({ id: sandboxState.sandboxId });
      console.log(`Found existing sandbox, current state: ${sandbox.state}`);

      // Handle different sandbox states (case-insensitive)
      const state = sandbox.state?.toUpperCase();
      if (state === 'STARTED') {
        console.log('Sandbox is already running');
        return sandbox;
      } else if (state === 'STOPPED') {
        console.log('Sandbox is stopped, starting it...');
        await sandbox.start();
        console.log('Sandbox started successfully');
        return sandbox;
      } else if (state === 'ARCHIVED') {
        console.log('Sandbox is archived, starting it (this may take longer)...');
        await sandbox.start();
        console.log('Archived sandbox started successfully');
        return sandbox;
      } else {
        console.log(`Sandbox is in unexpected state: ${sandbox.state}, creating new sandbox`);
        // Will create new sandbox below
      }
    } catch (error) {
      console.error('Failed to find or start existing sandbox:', error);
      console.log('Creating new sandbox...');
    }
  }

  // Create new sandbox if none exists or previous one failed
  const sandbox = await daytona.create({
    snapshot: CLAUDE_SNAPSHOT_NAME,
    envVars: { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    public: true  // Make preview links publicly accessible
  });

  // Update the Durable Object with the new sandbox ID
  const sandboxManager = await getSandboxManager(env);
  await sandboxManager.setSandboxState(sandbox.id);

  return sandbox;
}

async function getSandboxManager(env: Env) {
  const sandboxManagerId = env.SANDBOX_MANAGER.idFromName('nightona-sandbox-state');
  return env.SANDBOX_MANAGER.get(sandboxManagerId);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/initialize" && request.method === "POST") {
      try {
        // Get the current sandbox state from Durable Object
        const sandboxManager = await getSandboxManager(env);
        const sandboxState = await sandboxManager.getSandboxState();

        // Check if already initialized
        if (sandboxState.isInitialized && sandboxState.sandboxId) {
          return Response.json({
            success: true,
            message: "Project already initialized",
            sandboxId: sandboxState.sandboxId,
            alreadyInitialized: true
          });
        }

        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });

        // Use cached snapshot name
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Get or create persistent sandbox
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env, sandboxState);
        console.log(`Initialization using sandbox ID: ${sandbox.id}`);

        // Clone the React TypeScript template repository
        console.log('Cloning React TypeScript template...');
        await sandbox.git.clone(
          "https://github.com/ghostwriternr/vite_react_shadcn_ts.git",
          "project"
        );
        console.log('Template cloned successfully');

        // Install dependencies
        console.log('Installing dependencies...');
        await sandbox.process.executeCommand('cd project && npm install');
        console.log('Dependencies installed successfully');

        // Start the Vite dev server on port 3000 (in background using session)
        console.log('Starting Vite dev server...');

        // Create a session for long-running processes
        const devServerSessionId = 'dev-server-session';
        await sandbox.process.createSession(devServerSessionId);

        // Execute the dev server command asynchronously
        const devServerCommand = await sandbox.process.executeSessionCommand(
          devServerSessionId,
          {
            command: 'cd project && npm run dev -- --host 0.0.0.0 --port 3000',
            runAsync: true  // This runs the command in the background
          }
        );

        console.log(`Dev server started with command ID: ${devServerCommand.cmdId}`);

        // Wait a moment for the server to start
        console.log('Waiting for dev server to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Get the preview URL for the dev server
        console.log('Getting preview URL for dev server...');
        const previewInfo = await sandbox.getPreviewLink(3000);
        console.log(`Dev server available at: ${previewInfo.url}`);

        // Store the dev server URL in Durable Object
        await sandboxManager.setDevServerUrl(previewInfo.url);

        return Response.json({
          success: true,
          message: "Project initialized successfully with React + TypeScript template",
          sandboxId: sandbox.id,
          devServerUrl: previewInfo.url
        });
      } catch (error) {
        console.error(error);

        // Check if it's a snapshot not found error
        if (error instanceof Error && error.message.includes("snapshot")) {
          return Response.json({
            error: "Claude Code snapshot not found",
            details: "Run 'npm run create-snapshot' to create the required snapshot before starting the service",
            originalError: error.message
          }, { status: 500 });
        }

        return Response.json({
          error: "Failed to initialize project",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }

    if (url.pathname === "/api/run-code" && request.method === "POST") {
      try {
        const { message } = await request.json() as { message: string };

        if (!message) {
          return Response.json({ error: "Message is required" }, { status: 400 });
        }

        // Get the current sandbox state from Durable Object
        const sandboxManager = await getSandboxManager(env);
        const sandboxState = await sandboxManager.getSandboxState();

        // Check if we have an active sandbox
        if (!sandboxState.isInitialized || !sandboxState.sandboxId) {
          return Response.json({
            error: "No active project found",
            details: "Please initialize the project first"
          }, { status: 400 });
        }

        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });

        // Use cached snapshot name
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Get the existing sandbox
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env, sandboxState);
        console.log(`Run-code using sandbox ID: ${sandbox.id}`);

        // Store the user message
        const userMessage: Message = {
          id: Date.now().toString(),
          content: message,
          sender: 'user',
          timestamp: Date.now()
        };
        await sandboxManager.addMessage(userMessage);

        // Run Claude Code CLI with the user's message as a coding task from within the project directory
        // Use --continue to maintain conversation continuity
        const claudeCommand = `cd project && claude -p ${JSON.stringify(message)} --continue --output-format json`;
        const response = await sandbox.process.executeCommand(claudeCommand);

        // Store the AI response and return it
        let aiResponse: string;
        try {
          const claudeResult = JSON.parse(response.result) as SDKMessage;
          aiResponse = ('result' in claudeResult ? claudeResult.result : '') || response.result;

          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: aiResponse,
            sender: 'assistant',
            timestamp: Date.now()
          };
          await sandboxManager.addMessage(aiMessage);

          return Response.json(claudeResult);
        } catch {
          // If JSON parsing fails, return raw result as text
          aiResponse = response.result;

          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: aiResponse,
            sender: 'assistant',
            timestamp: Date.now()
          };
          await sandboxManager.addMessage(aiMessage);

          return Response.json({
            result: response.result,
            warning: "Could not parse Claude Code JSON response"
          });
        }
      } catch (error) {
        console.error(error);

        // Check if it's a sandbox issue
        if (error instanceof Error && error.message.includes("sandbox")) {
          // Reset the Durable Object state so next request creates a new sandbox
          const sandboxManager = await getSandboxManager(env);
          await sandboxManager.resetSandboxState();

          return Response.json({
            error: "Sandbox connection lost",
            details: "Please try again - a new sandbox will be created",
            originalError: error.message
          }, { status: 500 });
        }

        // Check if it's a snapshot not found error
        if (error instanceof Error && error.message.includes("snapshot")) {
          return Response.json({
            error: "Claude Code snapshot not found",
            details: "Run 'npm run create-snapshot' to create the required snapshot before starting the service",
            originalError: error.message
          }, { status: 500 });
        }

        return Response.json({
          error: "Failed to run code in sandbox",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      try {
        // Get the current sandbox state from Durable Object
        const sandboxManager = await getSandboxManager(env);
        const sandboxState = await sandboxManager.getSandboxState();

        return Response.json({
          isInitialized: sandboxState.isInitialized,
          sandboxId: sandboxState.sandboxId,
          devServerUrl: sandboxState.devServerUrl,
          lastAccessedAt: sandboxState.lastAccessedAt,
          messages: sandboxState.messages
        });
      } catch (error) {
        console.error(error);
        return Response.json({
          error: "Failed to get status",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }

    if (url.pathname === "/api/reset-session" && request.method === "POST") {
      try {
        // Get the current sandbox state from Durable Object
        const sandboxManager = await getSandboxManager(env);
        const sandboxState = await sandboxManager.getSandboxState();

        if (!sandboxState.isInitialized || !sandboxState.sandboxId) {
          return Response.json({
            error: "No active project found",
            details: "Please initialize the project first"
          }, { status: 400 });
        }

        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Get the existing sandbox
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env, sandboxState);

        // Clear the Claude session by changing to project directory and running reset command
        const resetCommand = `cd project && claude --new-session`;
        await sandbox.process.executeCommand(resetCommand);

        // Clear the message history
        await sandboxManager.clearMessages();

        return Response.json({
          success: true,
          message: "Conversation session reset successfully"
        });
      } catch (error) {
        console.error(error);
        return Response.json({
          error: "Failed to reset session",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }


		return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// Type definitions for the environment
interface Env {
  DAYTONA_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  SANDBOX_MANAGER: DurableObjectNamespace<SandboxManager>;
}
