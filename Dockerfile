FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.mjs network-settings.mjs seed-project.json ./
COPY public ./public
COPY docs ./docs
RUN mkdir -p /data && chown -R node:node /app /data

USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8926 DATA_DIR=/data
EXPOSE 8926
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -fsS http://127.0.0.1:8926/api/health || exit 1
CMD ["node", "server.mjs"]
