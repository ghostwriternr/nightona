# Nightona

![Lovable at home meme](public/lovable-at-home-meme.jpg)

## What is this?

Nightona brings you the essential Lovable experience - the ability to vibe code React apps with AI while seeing live updates. It's a self-hosted development environment where you can:

1. **Chat with Claude Code CLI** - Tell Claude what you want to build using natural language
2. **See live changes** - Watch your React app update in real-time as Claude writes and modifies code
3. **Build complete apps** - Start from a template and create full React + TypeScript applications
4. **Iterate naturally** - Have multi-turn conversations to refine and enhance your application

## Quick Start

### 1. Setup

```bash
npm install

# Add your API keys to .dev.vars
echo "DAYTONA_API_KEY=your-daytona-key" > .dev.vars
echo "ANTHROPIC_API_KEY=your-anthropic-key" >> .dev.vars

# Create the Claude Code environment (one-time setup)
npm run create-snapshot

# Start the app
npm run dev
```

### 2. Build your first app

1. Open the app in your browser
2. Click "Initialize Project" to set up a React template
3. Start chatting! Try: *"Create a simple todo app with add and delete functionality"*
4. Watch Claude build your app in the live preview window

## Example Conversations

- *"Create a landing page for a coffee shop with a hero section and menu"*
- *"Add a dark mode toggle to the top right corner"*
- *"Make the todo items draggable to reorder them"*
- *"Add a search bar to filter the items"*
- *"Style this with a modern gradient background"*

## How it works

- **Persistent Development Environment**: Uses Daytona to create secure, long-lived sandbox environments
- **AI-Powered Coding**: Integrates Claude Code CLI for intelligent code generation and editing
- **Live Preview**: Runs a Vite dev server in the sandbox with real-time preview
- **Conversation Continuity**: Maintains context across multiple interactions
- **Modern Stack**: React + TypeScript + Tailwind CSS + shadcn/ui components

## Requirements

- **Daytona API Key** - Sign up at [daytona.io](https://daytona.io) for cloud development environments
- **Anthropic API Key** - Get one from [console.anthropic.com](https://console.anthropic.com) for Claude access
- **Node.js** - For running the development server

## Deployment

Deploy to Cloudflare Workers:

```bash
# Set production secrets
wrangler secret put DAYTONA_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Deploy
npm run deploy
```

## Project Structure

- `src/` - React frontend application
- `worker/` - Cloudflare Worker backend handling AI interactions
- `scripts/` - Setup scripts for creating the Claude Code environment

---

**Built with**: React, TypeScript, Cloudflare Workers, Daytona, and Claude Code CLI