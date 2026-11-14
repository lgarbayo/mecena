/**
 * Deterministic eligibility + fit score (fleet/DATA-PIPELINE.md §4), on the data standard
 * (fleet/DATA-STANDARD.md, src/features/normalize). Code decides; Claude only explains.
 *
 * Phase A, hard filters: evaluateEligibility on the canonical Profile/Call (beneficiary type, territory
 *   tree, deadline, age, CNAE sector, size) plus call status. "unknown" never discards: it becomes "Confírmalo: …".
 * Phase B, score (eligible calls only). The score is personal: most of it depends on who the profile is, not on
 *   the call alone, so two different profiles get clearly different orders (the feed sorts by score first).
 *   base (25, or 10 when the call is for other disciplines)
 *   + 0-45 affinity: discipline/sector fit (0-25, disciplineFit / cnaeCheck) + the profile's own words found in the
 *     call (0-20: statement, project idea, funding needs, achievements, bio)
 *   + 0-12 documents already available + 0-8 amount + 0-10 deadline & territory = 0-100.
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
import { daysUntil, SCORE_MAX } from "./labels";

export interface MatchContext {
  now?: Date;
  hasDossier?: boolean; // the user already has a dossier in Mecena
  worksCount?: number; // photographed works with technical sheets
}

export interface ScoreBreakdown {
  base: number; // 25 when eligible (10 when the call is for other disciplines)
  affinity: number; // 0-45
  documents: number; // 0-12
  amount: number; // 0-8
  timing: number; // 0-10 (deadline preparability + territory bonus)
}

export interface RuleResult {
  match: MatchResult;
  breakdown: ScoreBreakdown;
  excluded: boolean; // closed / past deadline: never shown in the feed
}

export { fitLabel, daysLeft, SCORE_MAX, type FitLabel } from "./labels";

// ---------- text helpers (keyword overlap and document wording only; eligibility uses canonical ids) ----------
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const STOP = new Set(
  (
    "para como sobre entre desde hasta donde quien cuando porque tambien pero sino este esta estos estas ese esa eso aquel sus suyo nuestra nuestro tiene tener hacer hace hacen mucho muchos todas todos cada otra otro otros otras ayudas ayuda convocatoria convocatorias proyecto proyectos premio premios beca becas persona personas actividad desarrollo " +
    // generic call vocabulary: shared by almost every call, so it says nothing about this profile
    "artista artistas obras creacion creaciones exposicion exposiciones seleccion seleccionado seleccionada festival festivales trabajo trabajos trabajar jornada jornadas digital serie series tiempo general nacional publico publica espana edicion participar participantes concurso certamen"
  ).split(" "),
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

type Fit = "exact" | "within" | "related" | "any" | "general" | "none" | "sector" | "sector-unknown";

/** How the profile's discipline (creators) or sector (businesses) meets the call. Soft signal, never a filter. */
function fitOf(raw: Profile, p: CanonicalProfile, c: CanonicalCall, call: Call): { fit: Fit; matched: string[] } {
  if (p.kind === "business" && c.sectors.length) return { fit: cnaeCheck(p.cnae, c.sectors) === "pass" ? "sector" : "sector-unknown", matched: [] };
  // A business rarely lists disciplines; its sector text ("artesanía / cerámica") is read against the same taxonomy.
  const mine = p.disciplines.length || !raw.sector ? p.disciplines : normalizeDiscipline(raw.sector).ids;
  const fit = disciplineFit(mine, c.disciplines);
  // General aid for autónomos/pymes (no discipline, no sector list) is made for any business: a real fit for a pyme.
  if (fit.fit === "any" && p.kind === "business" && call.beneficiaryKinds.includes("business")) return { fit: "general", matched: [] };
  return fit;
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

  const fit = fitOf(profile, p, c, call);
  const breakdown: ScoreBreakdown = { base: 0, affinity: 0, documents: 0, amount: 0, timing: 0 };
  if (eligible) {
    breakdown.base = fit.fit === "none" ? 10 : 25;
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

/**
 * Points for discipline/sector fit (0-25), per fleet/DATA-STANDARD.md (`within` is a full fit). General business aid
 * fits any pyme well; a call open to any discipline is a decent fit for every creator, below one made for theirs.
 */
const FIT_POINTS: Record<Fit, number> = { exact: 25, within: 25, sector: 25, general: 18, any: 14, related: 10, "sector-unknown": 8, none: 0 };
/** Points per word of the profile's narrative that the call also uses, and their cap. */
const WORD_POINTS = 4;
const WORDS_MAX = 20;

/** 0-45: discipline/sector fit (0-25) + the profile's own words (statement, project, needs, achievements) found in the call (0-20). */
function affinity(raw: Profile, call: Call, p: CanonicalProfile, c: CanonicalCall, fit: { fit: Fit; matched: string[] }, why: string[], miss: string[]): number {
  let pts = FIT_POINTS[fit.fit];
  const biz = raw.kind === "business";
  if (fit.fit === "exact" || fit.fit === "within") why.push(`Encaja con tu ${biz ? "actividad" : "disciplina"}: ${discNames(fit.matched).join(", ")}`);
  else if (fit.fit === "related") miss.push(`Confírmalo: es para ${discNames(c.disciplines).join(", ")}; revisa si encaja ${biz ? "tu actividad" : "tu trabajo"}`);
  else if (fit.fit === "none" && c.disciplines.length) miss.push(`Es para ${biz ? "otras actividades" : "otras disciplinas"}: ${discNames(c.disciplines).join(", ")}`);
  else if (fit.fit === "sector") why.push("Tu actividad está entre los sectores de la convocatoria");

  pts += Math.min(WORDS_MAX, ownWords(raw, call).length * WORD_POINTS);
  return Math.min(SCORE_MAX.affinity, pts);
}

/**
 * The profile's own narrative words (statement, bio, project idea, funding needs, achievements) that the call text also
 * uses. Discipline labels and place names are left out: discipline fit and territory are scored on their own.
 */
export function ownWords(raw: Profile, call: Call): string[] {
  const profileText = [raw.statement, raw.bio, raw.projectIdea ?? "", ...raw.fundingNeeds, ...raw.achievements].join(" ");
  const callText = [call.title, call.summary, ...call.criteria.flatMap((k) => [k.name, k.description]), ...call.allowedExpenses].join(" ");
  const places = tokens([raw.city, raw.province, raw.region].filter(Boolean).join(" "));
  return overlap(tokens(profileText), tokens(callText)).filter((w) => !places.has(w));
}

const DOC_RULES: { test: RegExp; has: (p: Profile, ctx: MatchContext, doc?: string) => boolean; label: string; businessLabel?: string }[] = [
  // A pyme builds no dossier in Mecena: only its photos (products, workshop, premises) count, and the wording follows.
  {
    test: /dossier|portfolio|porfolio|imagenes|fotografias|obras/,
    has: (p, ctx) => (p.kind === "creator" && Boolean(ctx.hasDossier)) || (ctx.worksCount ?? 0) > 0,
    label: "dossier con tus obras",
    businessLabel: "fotos de tus productos o tu actividad",
  },
  { test: /\bcv\b|curriculum|trayectoria|biografia/, has: (p) => p.achievements.length + p.education.length > 0 || p.bio.length > 0, label: "currículum" },
  {
    test: /memoria|proyecto|sinopsis/,
    // For a pyme, knowing what it wants to finance is the seed of the memoria (not of a technical project or budget).
    has: (p, _ctx, doc) => Boolean(p.projectIdea) || (p.kind === "business" && p.fundingNeeds.length > 0 && /memoria/.test(doc ?? "")),
    label: "idea del proyecto para la memoria",
    businessLabel: "la idea de lo que queréis financiar, para la memoria",
  },
  // a self-declaration is just signed (checked before the certificate rule, which shares its wording)
  { test: /declaracion responsable|declaracion jurada/, has: () => false, label: "declaración responsable firmada" },
  { test: /hacienda|seguridad social|al corriente|certificad/, has: () => false, label: "certificado de estar al corriente con Hacienda y la Seguridad Social" },
];

/** 0-12: share of recognisable required documents the user already has. */
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
    const label = (p.kind === "business" && rule.businessLabel) || rule.label;
    if (rule.has(p, ctx, d)) {
      have++;
      why.push(`Ya tienes ${label}`);
    } else {
      miss.push(`Te falta: ${label}`);
    }
  }
  return known ? Math.round((SCORE_MAX.documents * have) / known) : 6;
}

/** 0-8: concrete money is more useful than visibility-only calls. */
function amount(c: CanonicalCall): number {
  const cents = c.amount.maxCents ?? c.amount.minCents;
  if (cents === undefined) return 3;
  if (cents >= 300_000) return 8;
  if (cents >= 100_000) return 6;
  return 5;
}

/**
 * 0-10: can you apply now (0-7) + local call bonus (0-3) when the profile is inside a non-state-wide territory.
 * An open call always beats an upcoming one, and that one a recurring call whose current edition has closed: with
 * the same fit, what you can apply for now ranks first (closing in a few days is urgent, not a penalty).
 */
function timing(p: CanonicalProfile, c: CanonicalCall, call: Call, daysLeft: number | undefined, why: string[], miss: string[]): number {
  let pts: number;
  if (call.status === "recurring") pts = 2;
  else if (call.status === "upcoming") pts = 4;
  else if (daysLeft === undefined) pts = 5;
  else if (daysLeft <= 3) {
    pts = 6;
    miss.push(daysLeft === 0 ? "Cierra hoy: hay que darse prisa" : `Cierra en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}: hay que darse prisa`);
  } else if (daysLeft <= 60) pts = 7;
  else pts = 6;
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
    return { item, done: rule ? rule.has(p, ctx, norm(item)) : false };
  });
}

