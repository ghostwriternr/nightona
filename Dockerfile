FROM node:22.17.0

# Install Claude Code and PM2 globally
RUN npm install -g @anthropic-ai/claude-code pm2

# Set up workspace directory
WORKDIR /workspace

# Clone and prepare the React TypeScript template
RUN git clone https://github.com/ghostwriternr/vite_react_shadcn_ts.git template

# Install dependencies in the template
WORKDIR /workspace/template
RUN npm install

# Create PM2 ecosystem configuration (use .cjs for CommonJS in ES module project)
RUN echo 'module.exports = {\
  apps: [{\
    name: "vite-dev-server",\
    script: "npm",\
    args: "run dev -- --host 0.0.0.0 --port 3000",\
    cwd: "/tmp/project",\
    instances: 1,\
    autorestart: true,\
    watch: false,\
    max_memory_restart: "1G",\
    env: {\
      NODE_ENV: "development"\
    }\
  }]\
};' > ecosystem.config.cjs

# Return to workspace directory
WORKDIR /workspace

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""

CMD ["claude", "--version"]
ENTRYPOINT ["sleep", "infinity"]
