# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.json nest-cli.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
# Release jobs run from the same immutable artifact as application services.
# Keep only their audited entrypoints and baseline guard SQL in that artifact;
# Compose files and local development assets are intentionally not copied.
COPY docker/scripts ./docker/scripts
COPY docker/sql ./docker/sql
COPY database/scripts ./database/scripts
COPY database/security ./database/security
ARG PACKAGE_FILTER
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${PACKAGE_FILTER}" run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable && groupadd --system ops && useradd --system --gid ops ops
COPY --from=build --chown=ops:ops /workspace /workspace
ARG PACKAGE_FILTER
ENV PACKAGE_FILTER=${PACKAGE_FILTER}
USER ops
CMD ["sh", "-c", "pnpm --filter \"${PACKAGE_FILTER}\" run start:prod"]
