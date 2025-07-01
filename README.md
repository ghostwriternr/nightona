# Nightona

A React + TypeScript + Vite application that runs on Cloudflare Workers, integrating with Daytona for secure code execution in persistent sandboxes with Claude Code AI assistance.

## Features

- **Frontend**: React 19 with TypeScript and Vite for fast development
- **Backend**: Cloudflare Worker handling API requests
- **AI Integration**: Claude Code CLI for intelligent coding assistance with conversation continuity
- **Live Preview**: Real-time preview of the React application being built, with changes visible instantly
- **Persistent Sandboxes**: Daytona SDK for running code in reusable, long-lived sandbox environments
- **Project Templates**: Automatic React + TypeScript + shadcn/ui template setup with dev server
- **Multi-turn Conversations**: Maintain context across multiple AI interactions
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

5. **Initialize your first project**: Once the app is running, click "Initialize Project" in the UI to set up a persistent sandbox with the React template.

### Available Scripts

- `npm run dev` - Start development server (frontend + worker)
- `npm run build` - Build the application
- `npm run lint` - Run ESLint
- `npm run preview` - Preview built application locally
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate Cloudflare types
- `npm run create-snapshot` - Create Claude Code snapshot (required before first use)

## Usage

### First Time Setup
1. After starting the development server, navigate to the application in your browser
2. Click "Initialize Project" to create a persistent sandbox with a React + TypeScript template
3. Start chatting with Claude Code to build your application

### AI Assistance Features
- **Persistent Context**: Conversations with Claude Code maintain context across multiple messages
- **Project Awareness**: Claude Code operates within your initialized React project directory
- **Live Preview**: See your React application running in real-time as Claude makes changes
- **Session Management**: Use "Reset Session" to start fresh conversations when needed
- **Automatic Template**: Projects are initialized with a pre-configured React + TypeScript + shadcn/ui template
- **Development Server**: Automatic Vite dev server startup with live preview integration

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
- **Persistent Sandboxes**: Daytona sandboxes remain active for extended development sessions
- **AI Integration**: Claude Code CLI runs within project directory with conversation continuity
- **Template Management**: Automatic React + TypeScript template cloning and setup

### API Endpoints

- **`/api/initialize`** - Creates persistent sandbox, clones React template, installs dependencies, and starts dev server with live preview
- **`/api/run-code`** - Executes Claude Code commands with conversation continuity in project context
- **`/api/status`** - Returns sandbox state, initialization status, dev server URL, and message history
- **`/api/reset-session`** - Clears Claude Code conversation history while preserving project state and live preview

## Project Structure

```
├── src/                    # React frontend
├── worker/                 # Cloudflare Worker backend
├── public/                 # Static assets
├── wrangler.jsonc         # Cloudflare Workers configuration
└── .dev.vars              # Local environment variables (gitignored)
```
