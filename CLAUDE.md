# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript + Vite application designed to run on Cloudflare Workers. The project combines a frontend React application with a backend Cloudflare Worker, creating a full-stack application that deploys to Cloudflare's edge network. The application integrates with Daytona for persistent sandbox environments and Claude Code CLI for AI-assisted development with conversation continuity.

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
- **API Endpoints**:
  - `/api/initialize` - Creates persistent Daytona sandbox with React template, installs dependencies, and starts dev server
  - `/api/run-code` - Executes Claude Code commands with conversation continuity
  - `/api/status` - Returns sandbox state, dev server URL, and message history
  - `/api/reset-session` - Clears Claude conversation history
- **Sandbox Management**: Persistent Daytona sandboxes with automatic recovery
- **AI Integration**: Claude Code CLI runs within project directory context
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

# Create Claude Code snapshot (required for Daytona integration)
npm run create-snapshot
```

## Development Workflow

1. **Local Development**: The user always runs `npm run dev` independently - NEVER run this command yourself
2. **Frontend Changes**: Edit files in `src/` - changes hot reload automatically
3. **Backend Changes**: Edit `worker/index.ts` - worker restarts automatically
4. **API Integration**: Frontend makes requests to `/api/*` which are handled by the worker
5. **Build Process**: `npm run build` compiles TypeScript and builds frontend assets
6. **Deployment**: `npm run deploy` builds and deploys to Cloudflare Workers

**IMPORTANT**: The development server (`npm run dev`) is always running on the user's side. Never attempt to start it yourself. If you need to check something in the browser or see the current state, ask the user to check it for you.

**CRITICAL**: After making ANY changes to `wrangler.jsonc`, you MUST run `npm run cf-typegen` to regenerate TypeScript types. This includes adding/modifying bindings for Durable Objects, KV, D1, R2, or any other Cloudflare services. Failure to do this will cause TypeScript compilation errors.

## Key Architectural Patterns

- **Full-Stack Single Deployment**: Both frontend and backend deploy together as a single Cloudflare Worker
- **Persistent Sandbox Architecture**: Daytona sandboxes remain alive across requests for extended development sessions
- **AI-Driven Development**: Claude Code CLI integration with conversation continuity for intelligent coding assistance
- **Live Preview Integration**: Real-time preview of React applications via Daytona public preview URLs with automatic dev server management
- **Project Template System**: Automatic React + TypeScript + shadcn/ui template cloning and setup with dev server startup
- **Session-based Background Processes**: Uses Daytona sessions for long-running processes like dev servers
- **Asset Handling**: Static assets are served by the worker with SPA fallback configured
- **API Routing**: Worker uses URL pathname matching to handle API vs static asset requests
- **Type Safety**: Separate TypeScript configurations ensure proper typing for browser vs worker environments
- **Edge Computing**: Application runs on Cloudflare's global edge network for low latency

## Daytona Integration Details

### Sandbox Lifecycle
- **Initialization**: `/api/initialize` creates a persistent sandbox, clones `ghostwriternr/vite_react_shadcn_ts` template, installs dependencies, and starts dev server
- **Public Access**: Sandboxes are created with `public: true` for direct preview URL access without authentication
- **Live Preview**: Vite dev server runs on port 3000 with Daytona preview URLs providing real-time application preview
- **Session Management**: Background processes like dev servers use Daytona sessions with `runAsync: true` for non-blocking execution
- **Persistence**: Sandboxes are reused across multiple requests to maintain state and conversation context
- **Recovery**: Automatic sandbox recreation if connection is lost or sandbox becomes unavailable
- **Working Directory**: All Claude Code commands execute within the `project/` directory in the sandbox

### Claude Code Integration
- **Conversation Continuity**: Uses `claude --continue` flag to maintain multi-turn conversation context
- **Project Context**: All AI interactions happen within the cloned React project directory
- **Session Management**: `/api/reset-session` endpoint clears conversation history while preserving project files
- **Output Format**: Commands use `--output-format json` for structured API responses

### Sandbox Management Strategy
- **Durable Object Storage**: Uses Cloudflare Durable Objects for persistent state including sandbox IDs, dev server URLs, and message history
- **Live Preview URLs**: Stores Daytona preview URLs for direct iframe embedding in the UI
- **Smart Recovery**: Attempts to reuse existing sandboxes, creates new ones if needed
- **Resource Optimization**: Sandboxes can be stopped/started to manage resource consumption
- **Error Handling**: Comprehensive error handling with automatic failover to new sandboxes

## UI Development Standards

**CRITICAL**: All UI components must be built using:
- **Tailwind CSS**: For all styling and layout
- **shadcn/ui**: For all UI components (buttons, forms, dialogs, etc.)
- **No custom CSS**: Avoid writing custom CSS files or CSS modules
- **Component Consistency**: Use shadcn/ui components exclusively for consistent design system

### Color Usage Rules
**NEVER use hard-coded Tailwind colors** like `bg-red-500`, `text-blue-600`, `border-gray-300`, etc.

**ALWAYS use semantic color variables** defined in the CSS theme:
- `bg-background`, `text-foreground`
- `bg-primary`, `text-primary-foreground`
- `bg-secondary`, `text-secondary-foreground`
- `bg-muted`, `text-muted-foreground`
- `bg-accent`, `text-accent-foreground`
- `bg-card`, `text-card-foreground`
- `bg-popover`, `text-popover-foreground`
- `border-border`, `border-input`, `border-muted`
- `bg-destructive`, `text-destructive-foreground`

This ensures:
- Consistent theming across the application
- Easy theme modifications in the future
- Proper dark/light mode support
- Maintainable color system

## Testing and Quality

- **Linting**: ESLint configured with TypeScript, React hooks, and React refresh rules
- **Type Checking**: TypeScript compilation is part of the build process
- **Hot Reload**: Vite provides fast HMR for frontend development
- **Worker Development**: Wrangler provides local worker development with hot reload
- **Code Quality**: NO eslint-disable directives allowed - fix issues properly with correct TypeScript types and implementations

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