# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile the Angular application into static assets.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# The API host is compiled into the bundle (Angular environments are static),
# so it is a build argument, never a runtime one. Override it from `.env`.
ARG API_BASE_URL=http://localhost:8080/api

# Dependencies first: this layer survives source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Materialize the production environment from the build argument.
RUN printf "export const environment = {\n  apiBaseUrl: '%s',\n  produccion: true,\n};\n" "$API_BASE_URL" > src/environments/environment.prod.ts

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: serve the static bundle over nginx.
# ---------------------------------------------------------------------------
FROM nginx:1.29-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/utn-rh/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
