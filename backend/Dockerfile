FROM node:20-alpine
WORKDIR /app
# Build deps for better-sqlite3 native compilation (if prebuilt binary unavailable for musl).
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm ci --only=production \
 && apk del .build-deps
COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/
RUN mkdir -p /app/logs/ai /app/data && chown -R node:node /app/logs /app/data
USER node
EXPOSE 3001
CMD ["node", "src/server.js"]
