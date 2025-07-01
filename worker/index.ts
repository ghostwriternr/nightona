import { Daytona } from '@daytonaio/sdk';
import type { SDKMessage } from '@anthropic-ai/claude-code';

// In-memory storage for sandbox ID (in production, use a database)
let activeSandboxId: string | null = null;

async function getOrCreateSandbox(daytona: Daytona, CLAUDE_SNAPSHOT_NAME: string, env: { ANTHROPIC_API_KEY: string }) {
  // Try to reuse existing sandbox
  if (activeSandboxId) {
    try {
      console.log(`Attempting to find existing sandbox with ID: ${activeSandboxId}`);
      const sandbox = await daytona.findOne({ id: activeSandboxId });
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
        activeSandboxId = null;
      }
    } catch (error) {
      console.error('Failed to find or start existing sandbox:', error);
      console.log('Creating new sandbox...');
      activeSandboxId = null;
    }
  }

  // Create new sandbox if none exists or previous one failed
  const sandbox = await daytona.create({
    snapshot: CLAUDE_SNAPSHOT_NAME,
    envVars: { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
  });

  activeSandboxId = sandbox.id;
  return sandbox;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/initialize" && request.method === "POST") {
      try {
        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });

        // Use cached snapshot name
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Get or create persistent sandbox
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env);
        console.log(`Initialization using sandbox ID: ${sandbox.id}`);

        // Clone the React TypeScript template repository
        console.log('Cloning React TypeScript template...');
        await sandbox.git.clone(
          "https://github.com/ghostwriternr/vite_react_shadcn_ts.git",
          "project"
        );
        console.log('Template cloned successfully');

        // Don't delete the sandbox - keep it for future requests

        return Response.json({
          success: true,
          message: "Project initialized successfully with React + TypeScript template",
          sandboxId: sandbox.id
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

        // Check if we have an active sandbox
        if (!activeSandboxId) {
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
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env);
        console.log(`Run-code using sandbox ID: ${sandbox.id}`);

        // Run Claude Code CLI with the user's message as a coding task from within the project directory
        // Use --continue to maintain conversation continuity
        const claudeCommand = `cd project && claude -p ${JSON.stringify(message)} --continue --output-format json`;
        const response = await sandbox.process.executeCommand(claudeCommand);

        // Don't delete the sandbox - keep it for future requests

        // Return the raw Claude Code JSON response
        try {
          const claudeResult = JSON.parse(response.result) as SDKMessage;
          return Response.json(claudeResult);
        } catch {
          // If JSON parsing fails, return raw result as text
          return Response.json({
            result: response.result,
            warning: "Could not parse Claude Code JSON response"
          });
        }
      } catch (error) {
        console.error(error);

        // Check if it's a sandbox issue
        if (error instanceof Error && error.message.includes("sandbox")) {
          // Reset sandbox ID so next request creates a new one
          activeSandboxId = null;
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

    if (url.pathname === "/api/reset-session" && request.method === "POST") {
      try {
        if (!activeSandboxId) {
          return Response.json({
            error: "No active project found",
            details: "Please initialize the project first"
          }, { status: 400 });
        }

        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Get the existing sandbox
        const sandbox = await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env);

        // Clear the Claude session by changing to project directory and running reset command
        const resetCommand = `cd project && claude --new-session`;
        await sandbox.process.executeCommand(resetCommand);

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
