FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs index.html ./

ENV PORT=3921
ENV KOKORO_URL=http://kokoro:3922
EXPOSE 3921

CMD ["node", "server.mjs"]
