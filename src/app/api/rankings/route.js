// Proxies the user's published Google Sheet (File > Share > Publish to web
// > CSV) so the client can fetch same-origin and we control caching. The
// sheet is the standing rankings source — see RANKINGS_SHEET_CSV_URL.
//
// Forced dynamic: without this, Next treats the route as statically
// pre-renderable (the inner fetch has a revalidate option) and can bake
// the response at build time — so changing RANKINGS_SHEET_CSV_URL without
// touching any code wouldn't take effect until something else forced a
// rebuild. This makes the route re-read the env var on every request.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.RANKINGS_SHEET_CSV_URL;
  if (!url) {
    return Response.json({ error: "RANKINGS_SHEET_CSV_URL is not configured" }, { status: 500 });
  }

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return Response.json({ error: `Google Sheets fetch failed: ${res.status}` }, { status: res.status });
  }

  const csv = await res.text();
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } });
}
