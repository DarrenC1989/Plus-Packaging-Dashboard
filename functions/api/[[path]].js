// ─────────────────────────────────────────────────────────────────────────────
// SAME-ORIGIN DATA PROXY — Cloudflare Pages Function
//
// Repo path:  functions/api/[[path]].js
//
// WHY THIS EXISTS
// The snapshot page sits behind Cloudflare Access. When it called the Worker
// directly on nav-data.darren-clayson.workers.dev, the browser first issued a
// CORS preflight (OPTIONS) — and browsers do NOT attach the Access service
// token headers to preflights. Access rejected them, the real request never
// followed, and every fetch died as a bare "Failed to fetch".
//
// Routing the calls through the page's own domain makes them same-origin.
// No preflight is issued at all, so there is nothing for Access to reject.
//
// Requests to  https://dashboards.pluspkg.com/api/<anything>
// are forwarded to  https://nav-data.darren-clayson.workers.dev/<anything>
//
// The snapshot page's ?k= token is preserved through the proxy, so the
// Worker's own SNAPSHOT_TOKEN check still applies exactly as before — this
// changes the route the request takes, not what is allowed through.
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_ORIGIN = "https://nav-data.darren-clayson.workers.dev";

// Only these prefixes may be proxied. Without this the Function would forward
// anything, turning the site into an open relay to the Worker.
const ALLOWED_PREFIXES = ["nav/", "data/", "crm/", "mail/"];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Strip the leading /api/ to get the Worker path
  const path = url.pathname.replace(/^\/api\//, "");

  if (!ALLOWED_PREFIXES.some(p => path.startsWith(p))) {
    return new Response(JSON.stringify({ error: "Not proxyable" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const target = `${WORKER_ORIGIN}/${path}${url.search}`;

  const upstream = await fetch(target, {
    method: request.method,
    headers: { Accept: request.headers.get("Accept") || "*/*" },
  });

  // Pass the body straight through, preserving content type so the xlsx
  // download still parses. No CORS headers needed — this is same-origin.
  const headers = new Headers();
  const ct = upstream.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
