/**
 * Deterministic eligibility + fit score (fleet/DATA-PIPELINE.md §4), on the data standard
 * (fleet/DATA-STANDARD.md, src/features/normalize). Code decides; Claude only explains.
 *
 * Phase A, hard filters: evaluateEligibility on the canonical Profile/Call (beneficiary type, territory
 *   tree, deadline, age, CNAE sector, size) plus call status. "unknown" never discards: it becomes "Confírmalo: …".
 * Phase B, score (eligible calls only): base (40, or 20 when the call is for other disciplines)
 *   + 0-25 discipline/sector fit (disciplineFit / cnaeCheck) and keywords + 0-15 documents already available
 *   + 0-10 amount + 0-10 deadline & territory = 0-100.
 */
import type { Call, MatchResult, Profile } from "@/contracts";
import {
  cnaeCheck,
  disciplineFit,
  disciplineLabel,
  evaluateEligibility,
  isDisciplineId,
  normalizeCall,
  normalizeDiscipline,
  normalizeProfile,
  territoryCheck,
  territoryName,
  type CanonicalCall,
  type CanonicalProfile,
} from "@/features/normalize";
import { daysUntil } from "./labels";

export interface MatchContext {
  now?: Date;
  hasDossier?: boolean; // the user already has a dossier in Mecena
  worksCount?: number; // photographed works with technical sheets
}

export interface ScoreBreakdown {
  base: number; // 40 when eligible (20 when the call is for other disciplines)
  affinity: number; // 0-25
  documents: number; // 0-15
  amount: number; // 0-10
  timing: number; // 0-10 (deadline preparability + territory bonus)
}

export interface RuleResult {
  match: MatchResult;
  breakdown: ScoreBreakdown;
  excluded: boolean; // closed / past deadline: never shown in the feed
}

export { fitLabel, daysLeft, type FitLabel } from "./labels";

// ---------- text helpers (keyword overlap and document wording only; eligibility uses canonical ids) ----------
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const STOP = new Set(
  "para como sobre entre desde hasta donde quien cuando porque tambien pero sino este esta estos estas ese esa eso aquel sus suyo nuestra nuestro tiene tener hacer hace hacen mucho muchos todas todos cada otra otro otros otras ayudas ayuda convocatoria convocatorias proyecto proyectos premio premios beca becas persona personas actividad desarrollo".split(
    " ",
  ),
);
export function tokens(text: string): Set<string> {
  return new Set(
    norm(text)
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 5 && !STOP.has(w))
      // crude Spanish stemming so "acuarelas"/"acuarela", "ilustración"/"ilustrador" meet
      .map((w) => w.slice(0, 7)),
  );
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));

/** YYYY-MM-DD in Spain, the reference day for deadlines and ages. */
const madridDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

const discNames = (ids: readonly string[]) => ids.slice(0, 3).map((id) => (isDisciplineId(id) ? disciplineLabel(id).toLowerCase() : id));

type Fit = "exact" | "within" | "related" | "any" | "none" | "sector" | "sector-unknown";

/** How the profile's discipline (creators) or sector (businesses) meets the call. Soft signal, never a filter. */
function fitOf(raw: Profile, p: CanonicalProfile, c: CanonicalCall): { fit: Fit; matched: string[] } {
  if (p.kind === "business" && c.sectors.length) return { fit: cnaeCheck(p.cnae, c.sectors) === "pass" ? "sector" : "sector-unknown", matched: [] };
  // A business rarely lists disciplines; its sector text ("artesanía / cerámica") is read against the same taxonomy.
  const mine = p.disciplines.length || !raw.sector ? p.disciplines : normalizeDiscipline(raw.sector).ids;
  return disciplineFit(mine, c.disciplines);
}

// ---------- main ----------
export function evaluate(profile: Profile, call: Call, ctx: MatchContext = {}): RuleResult {
  const now = ctx.now ?? new Date();
  const today = madridDay(now);
  const p = normalizeProfile(profile).value;
  const c = normalizeCall(call).value;
  const why: string[] = [];
  const miss: string[] = [];
  let eligible = true;
  let excluded = false;
  const fail = (msg: string) => {
    eligible = false;
    miss.push(msg);
  };

  // Status (the standard only knows dates)
  if (call.status === "closed") {
    excluded = true;
    fail("El plazo ya está cerrado");
  } else if (call.status === "upcoming") {
    why.push(call.opensAt ? `Abre pronto (${call.opensAt}): tienes tiempo para prepararla` : "Abre pronto: tienes tiempo para prepararla");
  } else if (call.status === "recurring") {
    why.push("Se convoca cada año: puedes prepararla con calma");
  }

  // Phase A on canonical data. Reasons come in Spanish from the standard.
  for (const k of evaluateEligibility(p, c, { today }).checks) {
    if (k.rule === "deadline") {
      if (k.result === "fail") {
        excluded = true;
        if (call.status !== "closed") fail("El plazo ya está cerrado");
      } else if (k.result === "unknown" && call.status === "open") miss.push(k.reason);
      continue; // an open deadline is shown as "quedan N días", not as a reason
    }
    if (k.result === "pass") why.push(k.reason);
    else if (k.result === "fail") fail(k.reason);
    else miss.push(k.reason);
  }

  // Other, not machine-checkable requirements → always "Confírmalo"
  for (const o of call.eligibility.other.slice(0, 2)) miss.push(`Confírmalo: ${o}`);

  const fit = fitOf(profile, p, c);
  const breakdown: ScoreBreakdown = { base: 0, affinity: 0, documents: 0, amount: 0, timing: 0 };
  if (eligible) {
    breakdown.base = fit.fit === "none" ? 20 : 40;
    breakdown.affinity = affinity(profile, call, p, c, fit, why, miss);
    breakdown.documents = documents(profile, call, ctx, why, miss);
    breakdown.amount = amount(c);
    breakdown.timing = timing(p, c, call, call.deadline ? daysUntil(call.deadline, now) : undefined, why, miss);
  }
  const score = Object.values(breakdown).reduce((s, x) => s + x, 0);

  return {
    match: {
      callId: call.id,
      profileId: profile.id,
      score: Math.max(0, Math.min(100, Math.round(score))),
      eligible,
      whyYouFit: why,
      whatYouMiss: miss,
      generatedBy: "rules",
    },
    breakdown,
    excluded,
  };
}

/** Points for discipline/sector fit (0-20), per fleet/DATA-STANDARD.md. */
const FIT_POINTS: Record<Fit, number> = { exact: 20, within: 20, sector: 20, any: 12, related: 10, "sector-unknown": 8, none: 0 };

/** 0-25: discipline/sector fit (0-20) + keyword overlap between the profile narrative and the call text (0-5). */
function affinity(raw: Profile, call: Call, p: CanonicalProfile, c: CanonicalCall, fit: { fit: Fit; matched: string[] }, why: string[], miss: string[]): number {
  let pts = FIT_POINTS[fit.fit];
  if (fit.fit === "exact" || fit.fit === "within") why.push(`Encaja con tu disciplina: ${discNames(fit.matched).join(", ")}`);
  else if (fit.fit === "related") miss.push(`Confírmalo: es para ${discNames(c.disciplines).join(", ")}; revisa si encaja tu trabajo`);
  else if (fit.fit === "none" && c.disciplines.length) miss.push(`Es para otras disciplinas: ${discNames(c.disciplines).join(", ")}`);
  else if (fit.fit === "sector") why.push("Tu actividad está entre los sectores de la convocatoria");

  const mine = raw.kind === "creator" ? p.disciplines.map((d) => disciplineLabel(d)) : [raw.sector ?? ""];
  const profileText = [raw.statement, raw.bio, raw.projectIdea ?? "", ...raw.fundingNeeds, ...raw.achievements, ...mine].join(" ");
  const callText = [call.title, call.summary, ...call.criteria.flatMap((k) => [k.name, k.description]), ...call.allowedExpenses].join(" ");
  const shared = overlap(tokens(profileText), tokens(callText));
  pts += Math.min(5, shared.length * 2);
  return Math.min(25, pts);
}

const DOC_RULES: { test: RegExp; has: (p: Profile, ctx: MatchContext) => boolean; label: string }[] = [
  { test: /dossier|portfolio|porfolio|imagenes|fotografias|obras/, has: (_p, ctx) => Boolean(ctx.hasDossier) || (ctx.worksCount ?? 0) > 0, label: "dossier con tus obras" },
  { test: /\bcv\b|curriculum|trayectoria|biografia/, has: (p) => p.achievements.length + p.education.length > 0 || p.bio.length > 0, label: "currículum" },
  { test: /memoria|proyecto|sinopsis/, has: (p) => Boolean(p.projectIdea), label: "idea del proyecto para la memoria" },
  // a self-declaration is just signed (checked before the certificate rule, which shares its wording)
  { test: /declaracion responsable|declaracion jurada/, has: () => false, label: "declaración responsable firmada" },
  { test: /hacienda|seguridad social|al corriente|certificad/, has: () => false, label: "certificado de estar al corriente con Hacienda y la Seguridad Social" },
];

/** 0-15: share of recognisable required documents the user already has. */
function documents(p: Profile, c: Call, ctx: MatchContext, why: string[], miss: string[]): number {
  let known = 0;
  let have = 0;
  const seen = new Set<string>();
  for (const doc of c.requiredDocuments) {
    const d = norm(doc);
    const rule = DOC_RULES.find((r) => r.test.test(d));
    if (!rule || seen.has(rule.label)) continue;
    seen.add(rule.label);
    known++;
    if (rule.has(p, ctx)) {
      have++;
      why.push(`Ya tienes ${rule.label}`);
    } else {
      miss.push(`Te falta: ${rule.label}`);
    }
  }
  return known ? Math.round((15 * have) / known) : 8;
}

/** 0-10: concrete money is more useful than visibility-only calls. */
function amount(c: CanonicalCall): number {
  const cents = c.amount.maxCents ?? c.amount.minCents;
  if (cents === undefined) return 4;
  if (cents >= 300_000) return 10;
  if (cents >= 100_000) return 8;
  return 6;
}

/** 0-10: deadline preparability (0-7) + local call bonus (0-3) when the profile is inside a non-state-wide territory. */
function timing(p: CanonicalProfile, c: CanonicalCall, call: Call, daysLeft: number | undefined, why: string[], miss: string[]): number {
  let pts: number;
  if (call.status === "upcoming" || call.status === "recurring") pts = 5;
  else if (daysLeft === undefined) pts = 4;
  else if (daysLeft <= 3) {
    pts = 2;
    miss.push(daysLeft === 0 ? "Cierra hoy: hay que darse prisa" : `Cierra en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}: hay que darse prisa`);
  } else if (daysLeft <= 7) pts = 5;
  else if (daysLeft <= 60) pts = 7;
  else pts = 5;
  const local = c.territories.filter((t) => t !== "ES" && t !== "WORLD");
  if (local.length && territoryCheck(p.territory, local) === "pass") {
    pts += 3;
    why.push(`Es de tu zona (${local.map(territoryName).join(", ")})`);
  }
  return Math.min(10, pts);
}

/** Required documents as a checklist, ticking what the user already has in Mecena (same rules as the score). */
export function checklistFor(p: Profile, c: Call, ctx: MatchContext = {}): { item: string; done: boolean }[] {
  return c.requiredDocuments.map((item) => {
    const rule = DOC_RULES.find((r) => r.test.test(norm(item)));
    return { item, done: rule ? rule.has(p, ctx) : false };
  });
}

