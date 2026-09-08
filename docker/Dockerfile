# Build the wiki, then serve it as static files.
#
# The result is a plain nginx container with no Node in it: everything this app
# does at runtime happens in the reader's browser, and the extracted data is
# committed, so there is nothing for a server to compute.
#
#   docker build -t approximately-up-wiki .
#   docker run --rm -p 8080:8080 approximately-up-wiki
#
# The build context is the repo root, which is also the Angular workspace.
# .dockerignore is what keeps it small -- tools/ holds the Python pipeline and
# the IL2CPP dump it derives, and none of that belongs in the daemon.

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:prod

# Compress once at build time instead of on every cache miss. nginx's runtime
# gzip defaults to level 1; this is level 9, and costs nothing at request time.
# Images are left alone -- WebP and PNG are already compressed.
#
# `gzip -9 -c "$1" > "$1.gz"` rather than `gzip -k`: busybox has carried -k
# only recently, and redirecting is unambiguous on both.
RUN find /app/dist/wiki/browser -type f \
        \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' \
           -o -name '*.html' -o -name '*.xml' \) \
        -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

# -------------------------------------------------------------- runtime stage
# nginx-unprivileged: the stock nginx image starts its master process as root.
# Nothing here needs it -- the container serves files it cannot write.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Replaces the default server block rather than adding to it, so there is no
# second site quietly listening on :80.
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build --chown=nginx:nginx /app/dist/wiki/browser /usr/share/nginx/html

EXPOSE 8080

# Distinct from a TCP check: nginx accepting a connection does not prove the
# build output actually landed in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
