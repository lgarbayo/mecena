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
  // stretch
  justification: "/justificacion",
  schools: "/escuelas",
} as const;

export const API = {
  profile: "/api/profile", // GET active profile; PATCH patch
  profileMode: "/api/profile/mode", // POST { kind } switch creator/business demo profile
  onboardingTurn: "/api/onboarding/turn",
  works: "/api/works", // GET ?profileId, POST create
  work: (id: string) => `/api/works/${encodeURIComponent(id)}`,
  workImage: (id: string) => `/api/works/${encodeURIComponent(id)}/image`,
  dossier: "/api/dossier", // GET ?profileId&callId
  dossierPdf: "/api/dossier/pdf", // GET ?profileId&callId -> application/pdf
  calls: "/api/calls", // GET ?profileId&q
  call: (id: string) => `/api/calls/${encodeURIComponent(id)}`,
  applications: "/api/applications", // POST { callId, profileId?, appUserId }
  application: (id: string) => `/api/applications/${encodeURIComponent(id)}`,
  jury: "/api/jury", // POST { applicationId }
  juryImprove: "/api/jury/improve", // POST { applicationId, scoreId }
  entitlements: "/api/entitlements", // GET ?appUserId, POST sync
  agent: "/api/agent", // POST { message, history }
  demoReset: "/api/demo/reset", // POST
} as const;
