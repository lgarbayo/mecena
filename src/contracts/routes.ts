/** UI routes (Spanish slugs) and API paths. Use these constants instead of string literals. */
export const ROUTES = {
  home: "/",
  onboarding: "/onboarding",
  works: "/obras",
  dossier: "/dossier",
  calls: "/convocatorias",
  call: (id: string) => `/convocatorias/${encodeURIComponent(id)}`,
  application: (callId: string) => `/solicitud/${encodeURIComponent(callId)}`,
  jury: (applicationId: string) => `/tribunal/${encodeURIComponent(applicationId)}`,
  pricing: "/pro",
  trust: "/confianza",
  demo: "/demo",
  login: "/entrar", // sign in / create account (?next=<path>)
  justification: (applicationId: string) => `/justificacion/${encodeURIComponent(applicationId)}`, // IDEA #7: invoices, deviations, final memoria
  panel: "/panel", // B2B panel for schools/associations (IDEA #8): members who accepted, their matched open calls
  account: "/cuenta", // account: "Conectar con Claude" (personal MCP tokens)
} as const;

/**
 * Pages anyone can open without an account (src/proxy.ts lets them through): the opening data screen (pitch beat 1)
 * and the trust promise. They read no user data on the server; signed in, they show the personal bits too.
 */
export const PUBLIC_PAGES: readonly string[] = [ROUTES.home, ROUTES.trust];

const NEXT_BASE = "http://mecena.invalid";

/**
 * A same-site path to go back to after signing in; anything else (absolute URLs, //host, /entrar itself) is "/".
 * Browsers drop tab/CR/LF inside URLs and read "\\" as "/", so "/\t/evil.com" or "/\\evil.com" would turn into
 * "//evil.com" (another host): any control character or backslash is refused outright, and what is left must
 * still resolve to this origin. Returns the parsed (normalised) path, never the raw input.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, NEXT_BASE);
  } catch {
    return "/";
  }
  if (url.origin !== NEXT_BASE) return "/";
  const path = url.pathname + url.search + url.hash;
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  if (url.pathname === ROUTES.login || url.pathname.startsWith(`${ROUTES.login}/`)) return "/";
  return path;
}

/** The sign-in page, coming back to `next` afterwards. */
export const loginUrl = (next?: string) => {
  const n = safeNext(next);
  return n === "/" ? ROUTES.login : `${ROUTES.login}?next=${encodeURIComponent(n)}`;
};

export const API = {
  // Auth: the only API paths that work without a session.
  authSignup: "/api/auth/signup", // POST { email, password, code? } -> MeResponse + session cookie
  authLogin: "/api/auth/login", // POST { email, password } -> MeResponse + session cookie
  authLogout: "/api/auth/logout", // POST -> clears the session
  authMe: "/api/auth/me", // GET -> MeResponse or 401; DELETE { confirm: true } -> deletes the account and all its data
  authConfig: "/api/auth/config", // GET -> { signupCodeRequired, signupCodeAccepted }
  // Everything below needs a session and only ever sees the signed-in user's data.
  profile: "/api/profile", // GET active profile; PATCH patch
  profileMode: "/api/profile/mode", // POST { kind } switch to (or create) the user's creator/business profile
  onboardingTurn: "/api/onboarding/turn",
  onboardingImport: "/api/onboarding/import", // POST { fileDataUrl? | text? } -> profile + dossier from the user's own dossier
  works: "/api/works", // GET ?profileId, POST create
  work: (id: string) => `/api/works/${encodeURIComponent(id)}`,
  workImage: (id: string) => `/api/works/${encodeURIComponent(id)}/image`,
  dossier: "/api/dossier", // GET ?profileId&callId
  dossierPdf: "/api/dossier/pdf", // GET ?profileId&callId -> application/pdf (&info=1 -> JSON size report)
  dossierImages: "/api/dossier/images", // GET ?profileId&callId -> ZIP of the original photos
  calls: "/api/calls", // GET ?profileId&q
  call: (id: string) => `/api/calls/${encodeURIComponent(id)}`,
  callsResearch: "/api/calls/research", // Pro deep research: GET ?profileId state + results, POST { profileId? } start
  applications: "/api/applications", // POST { callId, profileId? }
  application: (id: string) => `/api/applications/${encodeURIComponent(id)}`,
  jury: "/api/jury", // POST { applicationId, force? } (Accept: application/x-ndjson streams one event per judge)
  juryImprove: "/api/jury/improve", // POST { applicationId, scoreId, fixes?, facts?, stage? }
  juryUndo: "/api/jury/undo", // POST { applicationId } -> restores the draft from before "Aplicar mejoras"
  justification: "/api/justification", // GET ?applicationId -> JustificationResponse
  justificationInvoices: "/api/justification/invoices", // POST { applicationId, imageDataUrl, hint? } photo of an invoice -> JustificationResponse
  justificationInvoice: (id: string) => `/api/justification/invoices/${encodeURIComponent(id)}`, // PATCH fields / line, DELETE
  justificationInvoiceImage: (id: string) => `/api/justification/invoices/${encodeURIComponent(id)}/image`,
  justificationMemoria: "/api/justification/memoria", // POST { applicationId, notes? } draft it; PATCH { applicationId, sections } save the user's edits
  entitlements: "/api/entitlements", // GET the user's entitlement, POST sync after a purchase
  agent: "/api/agent", // POST { message, history }
  demoReset: "/api/demo/reset", // POST { scenario }: resets the signed-in user's own data only (and loads a scenario)
  demoSettings: "/api/demo/settings", // GET status + scenario checks; POST { deterministicJury?, aiMock? } (own account)
  mcp: "/api/mcp", // remote MCP server (Streamable HTTP). Auth: Authorization: Bearer <personal token>, no cookie
  mcpTokens: "/api/mcp-tokens", // GET the user's tokens; POST { label? } -> the new token, shown once
  mcpToken: (id: string) => `/api/mcp-tokens/${encodeURIComponent(id)}`, // DELETE: revoke
  panel: "/api/panel", // GET the signed-in user's panel (own org, or the demo one); POST { name, kind } creates the org
  panelInvitations: "/api/panel/invitations", // GET invitations addressed to the signed-in user's email; POST { email } invites (org owner)
  panelMembership: (id: string) => `/api/panel/memberships/${encodeURIComponent(id)}`, // PATCH { profileId? } accept; DELETE decline / leave / remove
  health: "/api/health", // GET -> { ok: true }, public (Fly health check)
} as const;
