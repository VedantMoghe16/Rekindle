"""Minimal HTTP bridge so the Next.js app can use the Cognee SDK.

Exposes the subset of Cognee's /api/v1 surface that src/lib/providers/cognee.ts already calls:
  POST /api/v1/add      multipart: data=<files>, datasetName
  POST /api/v1/cognify  {"datasets": [...], "run_in_background": bool}
  POST /api/v1/search   {"query": "...", "search_type": "GRAPH_COMPLETION", "datasets": [...], "top_k": 10}
  GET  /health

Run: cognee/.venv/bin/python cognee/server.py   (listens on 127.0.0.1:8765)
Then set COGNEE_BASE_URL=http://127.0.0.1:8765 in the app's .env.
"""
import asyncio
from typing import List, Optional

from settings import DATASET, apply_storage, configure

configure()
import cognee  # noqa: E402
import uvicorn  # noqa: E402
from cognee import SearchType  # noqa: E402
from fastapi import FastAPI, File, Form, UploadFile  # noqa: E402
from pydantic import BaseModel  # noqa: E402

apply_storage(cognee)
app = FastAPI(title="Vyapar Cognee bridge")


@app.get("/health")
async def health():
    return {"ok": True, "dataset": DATASET}


@app.post("/api/v1/add")
async def add(data: List[UploadFile] = File(...), datasetName: Optional[str] = Form(None)):
    texts = [(await f.read()).decode("utf-8", errors="ignore") for f in data]
    await cognee.add(texts, dataset_name=datasetName or DATASET)
    return {"added": len(texts)}


class CognifyBody(BaseModel):
    datasets: Optional[List[str]] = None
    run_in_background: bool = True


@app.post("/api/v1/cognify")
async def cognify(body: CognifyBody):
    datasets = body.datasets or [DATASET]
    if body.run_in_background:
        asyncio.create_task(cognee.cognify(datasets=datasets))
        return {"status": "started", "datasets": datasets}
    await cognee.cognify(datasets=datasets)
    return {"status": "completed", "datasets": datasets}


class SearchBody(BaseModel):
    query: str
    search_type: str = "GRAPH_COMPLETION"
    datasets: Optional[List[str]] = None
    top_k: int = 10


@app.post("/api/v1/search")
async def search(body: SearchBody):
    query_type = getattr(SearchType, body.search_type, SearchType.GRAPH_COMPLETION)
    results = await cognee.search(query_text=body.query, query_type=query_type, datasets=body.datasets or [DATASET], top_k=body.top_k)
    flat = []
    for r in results:
        value = getattr(r, "search_result", r)
        if isinstance(value, dict):
            value = value.get("search_result", value)
        flat.extend(value if isinstance(value, list) else [value])
    return [str(x) for x in flat]


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
