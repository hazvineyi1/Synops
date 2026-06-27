FROM node:24-slim

# Install build tools needed for any native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install pnpm. Pinned to v9: pnpm 10 blocks dependency build scripts behind an
# approval gate (ERR_PNPM_IGNORED_BUILDS for esbuild/@clerk/shared), which fails
# the install in CI. pnpm 9 runs build scripts normally.
RUN npm install -g pnpm@9

WORKDIR /app

# Copy the whole monorepo
COPY . .

# Install all workspace dependencies (lockfile may lag behind package.json)
RUN pnpm install --no-frozen-lockfile

# Build the API server (esbuild bundle -> artifacts/api-server/dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# Build-time args for the frontend. Vite inlines VITE_* values at build time,
# so the Clerk publishable key must be present when "vite build" runs (not just
# at runtime). Railway passes matching service variables as Docker build args.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL

# Build the React frontend. vite.config.ts requires PORT and BASE_PATH to be set.
RUN PORT=8080 BASE_PATH=/ \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_CLERK_PROXY_URL=$VITE_CLERK_PROXY_URL \
    pnpm --filter @workspace/arete run build

# Railway provides PORT at runtime; the server reads process.env.PORT.
EXPOSE 8080

# Start the API server, which also serves the built frontend.
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
