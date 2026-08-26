// Thin proxy to the Sleeper REST API. The board page polls this every few
// seconds for live picks; going through our own origin avoids CORS
// headaches and lets us force no-store so polling always sees fresh data
// (a plain client-side fetch to api.sleeper.app works today, but proxying
// keeps the client fetch same-origin and the caching behavior explicit).
const BASE = "https://api.sleeper.app/v1";

export async function GET(request, { params }) {
  const { path } = await params;
  const url = `${BASE}/${path.join("/")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return Response.json({ error: `Sleeper API ${path.join("/")} failed: ${res.status}` }, { status: res.status });
  }
  const data = await res.json();
  return Response.json(data);
}
