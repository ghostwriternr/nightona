# Nightona

A React + TypeScript + Vite application that runs on Cloudflare Workers, integrating with Daytona for secure code execution in sandboxes.

## Features

- **Frontend**: React 19 with TypeScript and Vite for fast development
- **Backend**: Cloudflare Worker handling API requests
- **Code Execution**: Daytona SDK for running user code in secure sandboxes
- **UI Components**: Tailwind CSS with shadcn/ui components
- **Full-Stack Deployment**: Single deployment to Cloudflare's edge network

## Development

### Prerequisites

- Node.js and npm
- Cloudflare account and Wrangler CLI
- Daytona API key

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.dev.vars` file in the root directory with your API keys:
```
DAYTONA_API_KEY=your-actual-daytona-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

3. **Create the Claude Code snapshot** (required before starting the service):
```bash
npm run create-snapshot
```
This creates a pre-built Daytona snapshot with Claude Code installed, which is required for the `/api/run-code` endpoint to function.

4. Start the development server:
```bash
npm run dev
```

### Available Scripts

- `npm run dev` - Start development server (frontend + worker)
- `npm run build` - Build the application
- `npm run lint` - Run ESLint
- `npm run preview` - Preview built application locally
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate Cloudflare types
- `npm run create-snapshot` - Create Claude Code snapshot (required before first use)

## Deployment

### Environment Variables

For production deployment, set the API keys as secrets:

```bash
# Set the secrets for production
wrangler secret put DAYTONA_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Create the Claude Code snapshot in production
npm run create-snapshot

# Deploy the application
npm run deploy
```

### Architecture

- **Frontend**: React application served as static assets
- **Backend**: Cloudflare Worker handling `/api/*` endpoints
- **Integration**: Worker creates Daytona sandboxes to execute user code
- **Response**: Returns execution results back to the frontend

## Project Structure

```
├── src/                    # React frontend
├── worker/                 # Cloudflare Worker backend
├── public/                 # Static assets
├── wrangler.jsonc         # Cloudflare Workers configuration
└── .dev.vars              # Local environment variables (gitignored)
```
