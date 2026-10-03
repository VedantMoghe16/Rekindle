# Cognee in Vyapar AI

**What it adds:** one memory across vendors, buyers and conversations. Questions that need connections, not keyword matches, become answerable, for example:
- "Which suppliers near Andheri can deliver 500 pastry boxes in two days with a free sample?" (vendor → product → delivery → sample)
- "Which supplier had a grease-leak complaint, and from which buyer?" (vendor ↔ buyer ↔ complaint)
- "What do bakeries object to, and what worked?" (buyers → objections → counter-offer → outcome)

The app's **Ask** boxes (My Deals, merchant pages, buyer offers) call Cognee when `COGNEE_BASE_URL` is set. Without it they fall back to a labelled local search over the same documents.

## Dataset (demo data)
`npm run cognee:dataset` writes `data/cognee/*.txt`, plain-language documents built from the demo fixtures:
- 10 packaging vendors (offers, MOQ, delivery, samples, fulfilment notes)
- 31 buyer merchants (category, area, public signals)
- 9 past conversations (objections and outcomes)
- 1 market note

Every fact is fictional, as in the app.

## Setup (Cognee Python SDK 1.6, Gemini for both LLM and embeddings)
1. Put your key in the app's `.env`: `GEMINI_API_KEY=...`. Cognee reads it from there, and its own non-secret settings live in `cognee/.env`, created on the first run.
2. Install the SDK once: `uv venv cognee/.venv --python 3.10 && uv pip install --python cognee/.venv/bin/python cognee fastapi uvicorn python-multipart`
3. Build the graph: `npm run cognee:dataset && npm run cognee:ingest`. This calls `cognee.add(...)` and then `cognee.cognify(...)`.
4. See it work: `npm run cognee:demo`. It asks the questions above with `SearchType.GRAPH_COMPLETION` and writes `data/cognee/answers.md`.
5. Connect the app: `npm run cognee:server` (FastAPI bridge on 127.0.0.1:8765), then in `.env` set `COGNEE_BASE_URL=http://127.0.0.1:8765` and `COGNEE_DATASET=vyapar`. New pitches, replies, call outcomes and buyer needs are added to memory as they happen.

Files: `cognee/settings.py` (config), `cognee/vyapar_memory.py` (ingest/ask/demo), `cognee/server.py` (the `/api/v1/add`, `/cognify` and `/search` bridge used by `src/lib/providers/cognee.ts`).
