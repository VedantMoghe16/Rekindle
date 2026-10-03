"""Vyapar AI memory with the Cognee SDK.

  python vyapar_memory.py ingest      # add data/cognee/*.txt to the "vyapar" dataset and cognify it into a graph
  python vyapar_memory.py ask "..."   # graph-completion answer over vendors, buyers and conversations
  python vyapar_memory.py demo        # run the demo questions and write data/cognee/answers.md

Run with the venv: cognee/.venv/bin/python cognee/vyapar_memory.py demo
"""
import asyncio
import sys
from datetime import datetime

from settings import DATASET, ROOT, apply_storage, configure

configure()
import cognee  # noqa: E402  (must come after configure())
from cognee import SearchType  # noqa: E402

apply_storage(cognee)

DEMO_QUESTIONS = [
    "Which packaging suppliers near Andheri can deliver 500 pastry boxes within two days and give a free sample?",
    "Which supplier had a grease-leak complaint, and from which buyer?",
    "What do bakeries in Andheri usually object to, and what worked to overcome it?",
    "Which buyers are worth re-contacting now, and why?",
    "Which cloud kitchens care about credit terms?",
]


async def ingest() -> None:
    files = sorted((ROOT / "data" / "cognee").glob("*.txt"))
    if not files:
        sys.exit("No documents. Run: npx tsx scripts/build-cognee-dataset.ts")
    try:
        await cognee.forget(dataset=DATASET)  # re-ingest from scratch so the graph matches the files
    except Exception:
        pass  # first run: nothing to forget
    await cognee.add([f.read_text() for f in files], dataset_name=DATASET)
    print(f"added {len(files)} documents to '{DATASET}'; building the graph (cognify)…")
    await cognee.cognify(datasets=[DATASET])
    print("graph ready")


async def ask(question: str) -> list[str]:
    results = await cognee.search(query_text=question, query_type=SearchType.GRAPH_COMPLETION, datasets=[DATASET])
    out: list[str] = []
    for r in results:
        value = getattr(r, "search_result", r)
        if isinstance(value, dict):
            value = value.get("search_result", value)
        out.extend(value if isinstance(value, list) else [value])
    return [str(x) for x in out]


async def demo() -> None:
    lines = [f"# Vyapar AI × Cognee: demo answers\n\nGenerated {datetime.now():%Y-%m-%d %H:%M} from data/cognee (demo data), dataset '{DATASET}', GRAPH_COMPLETION.\n"]
    for q in DEMO_QUESTIONS:
        answer = "\n".join(await ask(q))
        print(f"\nQ: {q}\nA: {answer}")
        lines.append(f"## {q}\n\n{answer}\n")
    (ROOT / "data" / "cognee" / "answers.md").write_text("\n".join(lines))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "ingest":
        asyncio.run(ingest())
    elif cmd == "ask":
        print("\n".join(asyncio.run(ask(" ".join(sys.argv[2:])))))
    else:
        asyncio.run(demo())
