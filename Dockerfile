# Build local monorepo image
# docker build --no-cache -t  flowise .

# Run image
# docker run -d -p 3000:3000 flowise

FROM node:20-alpine
RUN apk add --update libc6-compat python3 make g++
# needed for pdfjs-dist
RUN apk add --no-cache build-base cairo-dev pango-dev

# Install Chromium
RUN apk add --no-cache chromium

# Install curl for container-level health checks
# Fixes: https://github.com/FlowiseAI/Flowise/issues/4126
RUN apk add --no-cache curl

#install PNPM globaly
RUN npm install -g pnpm

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_OPTIONS=--max-old-space-size=8192

# DEBUG mode should be controlled at runtime, not hardcoded
# To enable debug mode, run with: docker run -e DEBUG=true -p 3000:3000 flowise
# Or in docker-compose: environment: - DEBUG=${DEBUG:-false}

WORKDIR /usr/src

# Copy app source
COPY . .

RUN pnpm install

RUN pnpm build

# Create non-root user for security
# Running as non-root prevents privilege escalation if container is compromised
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src

USER nodejs

EXPOSE 3000

CMD [ "pnpm", "start" ]
