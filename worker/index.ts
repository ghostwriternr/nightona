import { Daytona } from '@daytonaio/sdk';

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

        // Create the Sandbox instance
        const sandbox = await daytona.create({
          language: 'typescript',
        });

        // Run the code securely inside the Sandbox
        const response = await sandbox.process.codeRun(`console.log(${JSON.stringify(message)})`);

        // Clean up
        await sandbox.delete();

        return Response.json({ result: response.result });
      } catch (error) {
        return Response.json({
          error: "Failed to run code in sandbox",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }

		return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
