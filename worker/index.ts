import { Daytona } from '@daytonaio/sdk';
import type { SDKMessage } from '@anthropic-ai/claude-code';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/run-code" && request.method === "POST") {
      try {
        const { message } = await request.json() as { message: string };

        if (!message) {
          return Response.json({ error: "Message is required" }, { status: 400 });
        }

        // Initialize the Daytona client with API key from environment
        const daytona = new Daytona({ apiKey: env.DAYTONA_API_KEY });

        // Use cached snapshot name or create one if it doesn't exist
        const CLAUDE_SNAPSHOT_NAME = "claude-code-env:1.0.0";

        // Create sandbox with existing snapshot
        const sandbox = await daytona.create({
          snapshot: CLAUDE_SNAPSHOT_NAME,
          envVars: { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
        });

        // Run Claude Code CLI with the user's message as a coding task
        const claudeCommand = `claude -p ${JSON.stringify(message)} --output-format json`;
        const response = await sandbox.process.codeRun(claudeCommand);

        // Clean up
        await sandbox.delete();

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

		return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
