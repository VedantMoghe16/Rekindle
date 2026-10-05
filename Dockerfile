# Rekindle / Vyapar AI for Cloud Run: Next.js app + Cognee memory bridge (Python) + Telegram poller in one container.
# Runs on seeded demo data (SQLite inside the container), so state resets when the instance restarts.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_LINK_MODE=copy
RUN uv python install 3.10

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=file:./dev.db DEMO_TODAY=2026-10-04 COGNEE_BASE_URL=http://127.0.0.1:8765 COGNEE_DATASET=vyapar

# Dependencies first so code-only changes rebuild fast.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY cognee/requirements.txt cognee/requirements.txt
RUN uv venv --python 3.10 cognee/.venv && uv pip install --python cognee/.venv/bin/python -r cognee/requirements.txt

COPY . .
# Fresh seeded demo data (no real customer data), then the production build.
RUN npx prisma generate && npx prisma db push --skip-generate && npx tsx scripts/reset-demo.ts && npm run build

EXPOSE 8080
CMD ["sh", "scripts/start-cloudrun.sh"]
