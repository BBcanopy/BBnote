FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace web

FROM nginx:1.27-bookworm AS runner
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
