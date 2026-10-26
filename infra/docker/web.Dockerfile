# Web image. Build from the repository root: docker build -f infra/docker/web.Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @collex/web... --filter @collex/shared
COPY packages/shared packages/shared
COPY apps/web apps/web
# Rewrites (/api -> API) are resolved at build time, so the API address is a build argument.
ARG API_INTERNAL_URL=http://api:4000
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm --filter @collex/shared build && pnpm --filter @collex/web build

FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# Standalone output does not include static public assets (logo, icons).
COPY --from=build /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
