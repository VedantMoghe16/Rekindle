/** Cognee HTTP client (self-hosted cognee/cognee:main or Cognee Cloud). */
const dataset = () => process.env.COGNEE_DATASET || "rekindle-pipeline";

export function isCogneeConfigured() {
  return Boolean(process.env.COGNEE_BASE_URL);
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  if (process.env.COGNEE_API_KEY) h["X-Api-Key"] = process.env.COGNEE_API_KEY;
  if (process.env.COGNEE_BEARER_TOKEN) h.authorization = `Bearer ${process.env.COGNEE_BEARER_TOKEN}`;
  return h;
}

async function post(path: string, body: BodyInit, json = true, timeoutMs = 60_000) {
  const response = await fetch(`${process.env.COGNEE_BASE_URL!.replace(/\/$/, "")}/api/v1${path}`, { method: "POST", headers: headers(json), body, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Cognee ${path} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json().catch(() => null);
}

export type CogneeDocument = { id: string; text: string };

/** Uploads documents as text files (multipart is accepted by every Cognee server version). */
export async function cogneeAdd(docs: CogneeDocument[]) {
  for (let i = 0; i < docs.length; i += 20) {
    const form = new FormData();
    for (const doc of docs.slice(i, i + 20)) form.append("data", new Blob([doc.text], { type: "text/plain" }), `${doc.id}.txt`);
    form.append("datasetName", dataset());
    await post("/add", form, false);
  }
}

export async function cogneeCognify() {
  return post("/cognify", JSON.stringify({ datasets: [dataset()], run_in_background: true }), true, 30_000);
}

export type CogneeSearchType = "GRAPH_COMPLETION" | "TEMPORAL" | "CHUNKS" | "RAG_COMPLETION";

export async function cogneeSearch(query: string, searchType: CogneeSearchType = "GRAPH_COMPLETION"): Promise<string[]> {
  const result = await post("/search", JSON.stringify({ query, search_type: searchType, datasets: [dataset()], top_k: 10 }), true, 60_000);
  const flatten = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if ("search_result" in record) return flatten(record.search_result);
      if (typeof record.text === "string") return [record.text];
      return [JSON.stringify(record)];
    }
    return [];
  };
  return flatten(result);
}
