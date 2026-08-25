# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
# --base-href rewrites <base href>; the auth code reads it back at runtime, so redirect URIs
# follow automatically.
RUN yarn ng build --configuration production --base-href /ui/

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/stampyx-ui/browser /usr/share/nginx/html/ui
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 --start-period=5s \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
