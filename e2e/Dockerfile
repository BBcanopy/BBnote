FROM mcr.microsoft.com/playwright:v1.62.0-jammy
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json tsconfig.base.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY android/package.json android/package.json
RUN npm ci
COPY . .
CMD ["npm", "run", "test:e2e"]
