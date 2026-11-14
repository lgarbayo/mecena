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
  // stretch
  justification: "/justificacion",
  schools: "/escuelas",
} as const;

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
  authMe: "/api/auth/me", // GET -> MeResponse or 401
  authConfig: "/api/auth/config", // GET -> { signupCodeRequired }
  // Everything below needs a session and only ever sees the signed-in user's data.
  profile: "/api/profile", // GET active profile; PATCH patch
  profileMode: "/api/profile/mode", // POST { kind } switch to (or create) the user's creator/business profile
  onboardingTurn: "/api/onboarding/turn",
  onboardingImport: "/api/onboarding/import", // POST { fileDataUrl? | text? } -> profile + dossier from the user's own dossier
  works: "/api/works", // GET ?profileId, POST create
  work: (id: string) => `/api/works/${encodeURIComponent(id)}`,
  workImage: (id: string) => `/api/works/${encodeURIComponent(id)}/image`,
  dossier: "/api/dossier", // GET ?profileId&callId
  dossierPdf: "/api/dossier/pdf", // GET ?profileId&callId -> application/pdf
  calls: "/api/calls", // GET ?profileId&q
  call: (id: string) => `/api/calls/${encodeURIComponent(id)}`,
  callsResearch: "/api/calls/research", // Pro deep research: GET ?profileId state + results, POST { profileId? } start
  applications: "/api/applications", // POST { callId, profileId? }
  application: (id: string) => `/api/applications/${encodeURIComponent(id)}`,
  jury: "/api/jury", // POST { applicationId }
  juryImprove: "/api/jury/improve", // POST { applicationId, scoreId }
  entitlements: "/api/entitlements", // GET the user's entitlement, POST sync after a purchase
  agent: "/api/agent", // POST { message, history }
  demoReset: "/api/demo/reset", // POST: resets the signed-in user's own data only
} as const;
