FROM oven/bun:1.1-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Production stage
FROM oven/bun:1.1-alpine AS production

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

COPY --from=base /app/dist ./dist

EXPOSE 3000

CMD ["bun", "run", "dist/main.js"]