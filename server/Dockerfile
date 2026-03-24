FROM node:25-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace server

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/package.json
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
