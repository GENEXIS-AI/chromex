FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/native-host/package.json packages/native-host/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/extension/package.json packages/extension/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim

ARG CODEX_NPM_PACKAGE=@openai/codex@0.128.0

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18787 \
    CODEX_HOME=/data/codex-home \
    CODEX_SIDEPANEL_HOME=/data/codex-sidepanel \
    CHROMEX_WORKSPACE_ROOT=/data/workspace \
    CHROMEX_ASSET_DIR=/data/assets \
    CHROMEX_LOG_DIR=/data/logs \
    CHROMEX_VISION_TEMP_DIR=/data/vision-tmp \
    CHROMEX_COACH_TEMP_DIR=/data/coach-tmp

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && npm install -g "${CODEX_NPM_PACKAGE}" \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/bridge ./packages/bridge
COPY --from=build /app/packages/server ./packages/server

RUN mkdir -p "$CODEX_HOME" "$CODEX_SIDEPANEL_HOME" "$CHROMEX_WORKSPACE_ROOT" "$CHROMEX_ASSET_DIR" "$CHROMEX_LOG_DIR" "$CHROMEX_VISION_TEMP_DIR" "$CHROMEX_COACH_TEMP_DIR"

EXPOSE 18787

CMD ["npm", "run", "start", "--workspace", "@codex-sidepanel/server"]
