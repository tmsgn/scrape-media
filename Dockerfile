FROM ghcr.io/puppeteer/puppeteer:22-jammy

# Create app directory
WORKDIR /app

# Environment
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=8080

# Enable corepack and pnpm
RUN corepack enable

# Install dependencies first (better layer caching)
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@latest --activate \
 && pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

EXPOSE 8080
CMD ["node", "dist/index.js"]