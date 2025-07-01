FROM node:22.17.0

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Set up workspace directory
WORKDIR /workspace

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""

CMD ["claude", "--version"]
ENTRYPOINT ["sleep", "infinity"]
