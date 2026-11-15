FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install all dependencies (production + dev for build)
COPY package.json ./
RUN bun install

# Copy source code
COPY . .

# Build application
RUN bun run build

# Production stage with Node.js (not Bun) to avoid module resolution issues
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package.json and install production dependencies with legacy peer deps
COPY package.json ./
RUN npm install --production --legacy-peer-deps --ignore-scripts

# Copy built application and node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "dist/main.js"]