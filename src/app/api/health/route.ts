// GET -> 200 { ok: true }. Fly's health check (fly.toml [[http_service.checks]]): public (no session, no Basic auth in
// src/proxy.ts), cheap, and says nothing about users or configuration.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
