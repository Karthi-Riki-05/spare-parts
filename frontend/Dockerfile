FROM node:20-alpine AS builder
WORKDIR /app

# Copy the shared folder first
COPY shared ./shared

WORKDIR /app/frontend

# Copy package files from the root context
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

ENV NEXT_TELEMETRY_DISABLED=1

# Now TypeScript will correctly find ../shared/types/index.ts
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Update the paths to copy from the new builder structure
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]