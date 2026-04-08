FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/
RUN mkdir -p /app/logs/ai && chown -R node:node /app/logs
USER node
EXPOSE 3001
CMD ["node", "src/server.js"]
