# Build the wiki, then serve it as static files.
#
# The result is a plain nginx container with no Node in it: everything this app
# does at runtime happens in the reader's browser, and the extracted data is
# committed, so there is nothing for a server to compute.
#
#   docker build -f docker/Dockerfile -t approximatelyup-unoffical-fan-wiki .
#   docker run --rm -p 8080:8080 approximatelyup-unoffical-fan-wiki
#
# The build context is the repo ROOT, not this directory: the build stage
# compiles the Angular workspace, which lives up there. So `-f` is required,
# every COPY path below is relative to the repo root rather than to this file,
# and .dockerignore stays at the root because BuildKit resolves it against the
# context.
#
# .dockerignore is what keeps the context small -- tools/ holds the Python
# pipeline and the IL2CPP dump it derives, and none of that belongs in the
# daemon.

# ---------------------------------------------------------------- build stage
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

# An allow-list, not `COPY . .` plus a .dockerignore deny-list. Three reasons,
# in order of how much they bite:
#
#  - Cache. docker/nginx.conf is in the context but is NOT a build input, so
#    `COPY . .` made every config edit re-run npm run build:prod and all 487
#    prerenders. Naming the inputs, that edit stops touching this stage.
#  - Drift. A deny-list has to enumerate files that do not exist yet, and this
#    one had already lost: .idea and .ruff_cache are gitignored local junk that
#    .dockerignore never learned about, and both were landing in this layer.
#  - Exposure. cache-to: type=gha,mode=max exports this stage's layers to the
#    Actions cache. Whatever sits at the repo root and is not explicitly denied
#    goes with them -- .npmrc is only `fund=false` today, but it is exactly the
#    file that grows an auth token later.
#
# The cost is that a new top-level build input needs a line here. That fails
# loudly, at build time; the deny-list failed silently, by shipping junk.
#
# .dockerignore still earns its place: it keeps tools/ and its ~45 MB dump from
# crossing to the daemon at all. Allow-list for what enters the image,
# deny-list for what crosses the wire.
COPY angular.json tsconfig.json tsconfig.app.json tsconfig.scripts.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY content/ ./content/
COPY scripts/ ./scripts/
COPY data/ ./data/

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
#
# 1.31 is the current mainline branch (odd minor), which is what nginx itself
# recommends running: fixes land here first, and the stable branch only gets
# the subset backported to it.
#
# The cost is that this pin has to move. A mainline branch stops getting
# patches the moment the next one opens, with no notice and no warning in the
# tag -- that is how the 1.27 pinned here before went fifteen months without a
# rebuild. When 1.33 appears, this line is stale the same day, so treat a
# mainline bump as part of keeping the image alive rather than an upgrade.
FROM nginxinc/nginx-unprivileged:1.31-alpine

# Replaces the default server block rather than adding to it, so there is no
# second site quietly listening on :80.
COPY --chown=nginx:nginx docker/nginx.conf /etc/nginx/conf.d/default.conf

# Deliberately NOT in conf.d/: the base image includes conf.d/*.conf at http
# level, so a snippet there would be loaded as a stray config as well as by the
# `include` in each location. This path is only ever reached explicitly.
COPY --chown=nginx:nginx docker/security-headers.conf /etc/nginx/security-headers.conf

COPY --from=build --chown=nginx:nginx /app/dist/wiki/browser /usr/share/nginx/html

EXPOSE 8080

# Distinct from a TCP check: nginx accepting a connection does not prove the
# build output actually landed in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
