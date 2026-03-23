FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
