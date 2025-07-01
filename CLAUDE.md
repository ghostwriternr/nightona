# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript + Vite application designed to run on Cloudflare Workers. The project combines a frontend React application with a backend Cloudflare Worker, creating a full-stack application that deploys to Cloudflare's edge network.

## Architecture

### Frontend Structure
- **Framework**: React 19 with TypeScript and Vite for fast development
- **Build Tool**: Vite with SWC for React compilation
- **Entry Point**: `src/main.tsx` - standard React app entry point
- **Main Component**: `src/App.tsx` - contains the main application logic
- **Styling**: Tailwind CSS with shadcn/ui components - all UI should be built exclusively using these tools
- **Assets**: Static assets in `src/assets/` and `public/`

### Backend Structure
- **Worker Entry**: `worker/index.ts` - Cloudflare Worker handling API requests
- **API Pattern**: Worker handles requests to `/api/*` endpoints
- **Response Format**: Returns JSON responses for API calls

### Configuration Files
- **Wrangler**: `wrangler.jsonc` - Cloudflare Workers configuration
- **TypeScript**: Multiple tsconfig files for different parts:
  - `tsconfig.json` - Base configuration
  - `tsconfig.app.json` - Frontend application config
  - `tsconfig.node.json` - Node.js tooling config
  - `tsconfig.worker.json` - Worker-specific config
- **Vite**: `vite.config.ts` - Uses React SWC plugin and Cloudflare plugin
- **ESLint**: `eslint.config.js` - TypeScript ESLint with React hooks and refresh plugins

## Development Commands

```bash
# Start development server (frontend + worker)
npm run dev

# Build the application (TypeScript compilation + Vite build)
npm run build

# Run linting
npm run lint

# Preview built application locally
npm run preview

# Deploy to Cloudflare Workers
npm run deploy

# Generate Cloudflare types
npm run cf-typegen
```

## Development Workflow

1. **Local Development**: Use `npm run dev` to start both the frontend dev server and worker
2. **Frontend Changes**: Edit files in `src/` - changes hot reload automatically
3. **Backend Changes**: Edit `worker/index.ts` - worker restarts automatically
4. **API Integration**: Frontend makes requests to `/api/*` which are handled by the worker
5. **Build Process**: `npm run build` compiles TypeScript and builds frontend assets
6. **Deployment**: `npm run deploy` builds and deploys to Cloudflare Workers

## Key Architectural Patterns

- **Full-Stack Single Deployment**: Both frontend and backend deploy together as a single Cloudflare Worker
- **Asset Handling**: Static assets are served by the worker with SPA fallback configured
- **API Routing**: Worker uses URL pathname matching to handle API vs static asset requests
- **Type Safety**: Separate TypeScript configurations ensure proper typing for browser vs worker environments
- **Edge Computing**: Application runs on Cloudflare's global edge network for low latency

## UI Development Standards

**CRITICAL**: All UI components must be built using:
- **Tailwind CSS**: For all styling and layout
- **shadcn/ui**: For all UI components (buttons, forms, dialogs, etc.)
- **No custom CSS**: Avoid writing custom CSS files or CSS modules
- **Component Consistency**: Use shadcn/ui components exclusively for consistent design system

## Testing and Quality

- **Linting**: ESLint configured with TypeScript, React hooks, and React refresh rules
- **Type Checking**: TypeScript compilation is part of the build process
- **Hot Reload**: Vite provides fast HMR for frontend development
- **Worker Development**: Wrangler provides local worker development with hot reload

## Important Documentation References

### Context7 MCP - Universal Documentation Lookup
**CRITICAL**: This project has Context7 MCP installed, which provides powerful documentation lookup capabilities. Use it extensively for:
- **Any API or library questions** - Look up official documentation for React, TypeScript, Vite, Wrangler, etc.
- **Cloudflare platform services** - Get up-to-date docs for Workers, KV, D1, R2, Durable Objects, Agents, etc.
- **Framework-specific patterns** - Research best practices for React hooks, Vite configuration, ESLint rules
- **Error resolution** - Look up error messages and troubleshooting guides
- **Integration examples** - Find code examples and implementation patterns

**Always use Context7 MCP before:**
- Implementing new features or integrations
- Troubleshooting errors or unexpected behavior
- Making architectural decisions
- Writing configuration files
- Using unfamiliar APIs or services

### Daytona Integration
When working with Daytona sandboxes, development environments, or any Daytona-related functionality, always reference `@docs/daytona.txt` for:
- API configuration and authentication
- SDK usage patterns
- Sandbox management
- Environment setup

### Cloudflare Workers Best Practices
For all Cloudflare Workers development, always consult these key documentation files:
- `@docs/cloudflare-prompt.txt` - Contains comprehensive guidelines for Workers code generation, best practices, and architectural patterns
- `@docs/cloudflare-docs.txt` - Official Cloudflare developer documentation covering all platform services

These files contain essential information about:
- TypeScript best practices for Workers
- Proper integration with Cloudflare services (KV, D1, R2, Durable Objects, etc.)
- Security guidelines and error handling
- WebSocket implementation using Hibernation API
- Agent development patterns
- Configuration requirements for wrangler.jsonc