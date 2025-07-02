import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { routePartykitRequest } from 'partyserver';
import { SandboxManager, type SandboxState } from './sandbox-manager';

// Export the Durable Object class
export { SandboxManager };

async function ensureDevServerRunning(sandbox: Sandbox) {
  console.log('Ensuring dev server is running with PM2...');

  try {
    // Check if PM2 process exists and is running
    const statusCheck = await sandbox.process.executeCommand('pm2 describe vite-dev-server');

    if (statusCheck.exitCode === 0) {
      // Process exists, check if it's actually online
      const listResult = await sandbox.process.executeCommand('pm2 jlist');
      const processes = JSON.parse(listResult.result);
      const viteProcess = processes.find((p: { name: string; pm2_env?: { status: string } }) => p.name === 'vite-dev-server');

      if (viteProcess?.pm2_env?.status === 'online') {
        console.log('Dev server is already running with PM2');
        return;
      } else {
        console.log(`Dev server process exists but status is: ${viteProcess?.pm2_env?.status}, restarting...`);
        await sandbox.process.executeCommand('pm2 restart vite-dev-server');
        console.log('Dev server restarted with PM2');
        return;
      }
    }
  } catch {
    console.log('PM2 process check failed, will start new process');
  }

  // Process doesn't exist, start it
  console.log('Starting new dev server process with PM2...');
  await sandbox.process.executeCommand('cd /tmp/project && pm2 start ecosystem.config.cjs');
  console.log('Dev server started with PM2');

  // Wait a moment for the server to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('Dev server should be running now');
}

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
        // Even if sandbox is started, check if dev server is actually running
        try {
          console.log('Checking if dev server is responsive...');
          const previewInfo = await sandbox.getPreviewLink(3000);
          const healthCheck = await fetch(previewInfo.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (healthCheck.ok) {
            console.log('Dev server is responsive');
            return sandbox;
          } else {
            console.log(`Dev server not responsive (status: ${healthCheck.status}), ensuring it's running...`);
            await ensureDevServerRunning(sandbox);
            return sandbox;
          }
        } catch {
          console.log('Dev server health check failed, ensuring it\'s running...');
          await ensureDevServerRunning(sandbox);
          return sandbox;
        }
      } else if (state === 'STOPPED') {
        console.log('Sandbox is stopped, starting it...');
        await sandbox.start();
        console.log('Sandbox started successfully, ensuring dev server is running...');
        await ensureDevServerRunning(sandbox);

        // Get new preview URL after restart and update Durable Object
        console.log('Getting fresh preview URL after sandbox restart...');
        const previewInfo = await sandbox.getPreviewLink(3000);
        console.log(`New dev server URL: ${previewInfo.url}`);
        const sandboxManager = await getSandboxManager(env);
        await sandboxManager.setDevServerUrl(previewInfo.url);
        console.log('Dev server URL updated in storage');

        return sandbox;
      } else if (state === 'ARCHIVED') {
        console.log('Sandbox is archived, starting it (this may take longer)...');
        await sandbox.start();
        console.log('Archived sandbox started successfully, ensuring dev server is running...');
        await ensureDevServerRunning(sandbox);

        // Get new preview URL after restart and update Durable Object
        console.log('Getting fresh preview URL after sandbox restart...');
        const previewInfo = await sandbox.getPreviewLink(3000);
        console.log(`New dev server URL: ${previewInfo.url}`);
        const sandboxManager = await getSandboxManager(env);
        await sandboxManager.setDevServerUrl(previewInfo.url);
        console.log('Dev server URL updated in storage');

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
    user: 'claude',  // Use 'claude' user instead of root
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

        // Check if claude user exists and create if needed
        console.log('Setting up claude user...');
        await sandbox.process.executeCommand('id claude || useradd -m -s /bin/bash claude');
        console.log('Claude user created');

        // Copy pre-built template from image to project directory
        console.log('Setting up project from pre-built template...');
        await sandbox.process.executeCommand('cp -r /workspace/template /tmp/project');
        console.log('Project template copied successfully');

        // Set ownership of the project directory to claude user
        console.log('Setting project directory ownership...');
        await sandbox.process.executeCommand('chown -R claude:claude /tmp/project');
        console.log('Project directory ownership set to claude user');

        // Start the Vite dev server with PM2
        console.log('Starting Vite dev server with PM2...');
        await sandbox.process.executeCommand('cd /tmp/project && pm2 start ecosystem.config.cjs');
        await sandbox.process.executeCommand('pm2 save'); // Save PM2 process list
        console.log('Dev server started with PM2');

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


    if (url.pathname === "/api/status" && request.method === "GET") {
      try {
        // Get the current sandbox state from Durable Object
        const sandboxManager = await getSandboxManager(env);
        const sandboxState = await sandboxManager.getSandboxState();

        // If we have a sandbox, check its health and recover if needed
        if (sandboxState.isInitialized && sandboxState.sandboxId) {
          try {
            const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });
            const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

            // This will check sandbox state and restart dev server if needed
            await getOrCreateSandbox(daytona, CLAUDE_SNAPSHOT_NAME, env, sandboxState);

            // Get updated state after potential recovery
            const updatedState = await sandboxManager.getSandboxState();

            return Response.json({
              isInitialized: updatedState.isInitialized,
              sandboxId: updatedState.sandboxId,
              devServerUrl: updatedState.devServerUrl,
              lastAccessedAt: updatedState.lastAccessedAt,
              messages: updatedState.messages
            });
          } catch (error) {
            console.error('Health check failed:', error);
            // Return cached state if health check fails
            return Response.json({
              isInitialized: sandboxState.isInitialized,
              sandboxId: sandboxState.sandboxId,
              devServerUrl: sandboxState.devServerUrl,
              lastAccessedAt: sandboxState.lastAccessedAt,
              messages: sandboxState.messages,
              healthCheckFailed: true
            });
          }
        }

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

    // Try partyserver routing for WebSocket connections
    const partyResponse = await routePartykitRequest(request, env);
    if (partyResponse) {
      return partyResponse;
    }

		return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// Type definitions for the environment
interface Env extends Record<string, unknown> {
  DAYTONA_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  SANDBOX_MANAGER: DurableObjectNamespace<SandboxManager>;
}
