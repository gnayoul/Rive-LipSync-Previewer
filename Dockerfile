FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs index.html ./
COPY vendor ./vendor

ENV PORT=3921
EXPOSE 3921

CMD ["node", "server.mjs"]
