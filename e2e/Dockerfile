FROM node:26-bookworm-slim
WORKDIR /app
ENV CI=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
RUN npm ci --workspaces=false
RUN npx playwright install --with-deps chromium
COPY . .
CMD ["npm", "run", "test:e2e"]
