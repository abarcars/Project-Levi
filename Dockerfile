FROM node:20-alpine

WORKDIR /app

# Copy server files only (lightweight image)
COPY server/ ./server/
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev --no-audit --no-fund || true

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (r) => {if(r.statusCode!==200)throw new Error()})" || exit 1

# Run server
ENV NODE_ENV=production
CMD ["node", "server/cojanet-sync-server.js"]
