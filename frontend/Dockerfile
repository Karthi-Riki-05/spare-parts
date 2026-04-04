FROM node:20-alpine AS builder
WORKDIR /app
# Copy frontend package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci
# Copy frontend source and shared types into the build context
COPY frontend/ ./
COPY shared/ ./shared/
ENV BACKEND_URL=http://backend:3001
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
