# bbnote

`bbnote` is yet another notebook app.

## Run the project

1. You should have an OIDC client ready. 

Use `https://<hostname>/auth/callback` as the redirect URI.

For local run, you can use `http://localhost:8080`.

2. Run docker compose 

```bash
# Create .env file and modify as you wish
wget https://raw.githubusercontent.com/BBcanopy/bbnote/refs/heads/main/.env.example -O .env 

# Download the all-in-one docker compose file
wget https://raw.githubusercontent.com/BBcanopy/bbnote/refs/heads/main/docker-compose.all-in-one.yml -O docker-compose.yml

# Create data folder
mkdir data

docker compose up -d
```

The app is available at `http://localhost:8080` by default.
