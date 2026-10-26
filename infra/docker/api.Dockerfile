# API + worker image. Build from the repository root: docker build -f infra/docker/api.Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @collex/api... --filter @collex/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @collex/shared build && pnpm --filter @collex/api build

FROM node:22-alpine
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
# Writable directory for the local encrypted storage driver (mounted as a volume in compose).
RUN mkdir -p storage && chown app:app storage
USER app
EXPOSE 4000
# Migrations are applied by a separate release step (see docs/operations.md), not on every container start.
CMD ["node", "dist/src/main.js"]
