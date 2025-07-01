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

2. Create a `.dev.vars` file in the root directory with your Daytona API key:
```
DAYTONA_API_KEY=your-actual-daytona-api-key-here
```

3. Start the development server:
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

## Deployment

### Environment Variables

For production deployment, set the Daytona API key as a secret:

```bash
# Set the secret for production
wrangler secret put DAYTONA_API_KEY

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
