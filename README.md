# bbnote

`bbnote` is yet another notebook app.

## Run with Docker Compose

1. Create a `.env` file from `.env.example` and adjust the OIDC settings as needed.

Keep `APP_BASE_URL` aligned with the public web URL. With the default split-stack compose file that means `http://localhost:${APP_HOST_PORT}`.

2. Start the default split deployment:

```bash
cp .env.example .env
docker compose up -d --build
```

This exposes the web app on `http://localhost:8080` by default and the server directly on `http://localhost:3000`.

3. Start the all-in-one deployment instead:

```bash
cp .env.example .env
docker compose -f docker-compose.all-in-one.yml up -d --build
```

Use `https://<hostname>/auth/callback` as the redirect URI for real OIDC setups. The checked-in example keeps `MOCK_OIDC_ENABLED=true` so local Docker smoke tests work out of the box.
