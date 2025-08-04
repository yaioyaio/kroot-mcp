# Multi-stage build for DevFlow Monitor MCP
# Stage 1: Build stage
FROM node:20.19.1-alpine AS builder

# Install Python and build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Stage 2: Production stage
FROM node:20.19.1-alpine

# Install only runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Create app user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy necessary configuration files
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/docs ./docs

# Create data directory for SQLite database
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose MCP server port (internal communication)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Default environment variables
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/devflow.db \
    MCP_SERVER_PORT=3000 \
    MCP_SERVER_HOST=0.0.0.0

# Start the MCP server
CMD ["node", "dist/server/index.js"]