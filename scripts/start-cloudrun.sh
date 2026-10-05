#!/bin/sh
# Cloud Run entrypoint: Cognee memory bridge on 127.0.0.1:8765, the Telegram poller, then the app on $PORT.
cd /app
(
  # The memory graph is built from the demo documents in data/cognee on first start (needs Gemini).
  if [ ! -d cognee/.data ] && [ -n "$GEMINI_API_KEY" ]; then
    cognee/.venv/bin/python cognee/vyapar_memory.py ingest || echo "! Cognee ingest failed; memory search starts empty"
  fi
  exec cognee/.venv/bin/python cognee/server.py
) &
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ "${TELEGRAM_POLL:-1}" = "1" ]; then
  (while true; do node_modules/.bin/tsx scripts/telegram-poll.ts; echo "telegram poller exited; restarting in 10s"; sleep 10; done) &
fi
exec node_modules/.bin/next start -p "${PORT:-8080}" -H 0.0.0.0
