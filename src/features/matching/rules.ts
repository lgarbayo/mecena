/**
 * Deterministic eligibility + fit score (fleet/DATA-PIPELINE.md §4), on the data standard
 * (fleet/DATA-STANDARD.md, src/features/normalize). Code decides; Claude only explains.
 *
 * Phase A, hard filters: evaluateEligibility on the canonical Profile/Call (beneficiary type, territory
 *   tree, deadline, age, CNAE sector, size) plus call status. "unknown" never discards: it becomes "Confírmalo: …".
 * Phase B, score (eligible calls only). The score is personal: most of it depends on who the profile is, not on
 *   the call alone, so two different profiles get clearly different orders (the feed sorts by score first).
 *   base (25, or 10 when the call is for other disciplines; minus 8 when a residence rule can't be confirmed and the
 *     call is from another comunidad, or the profile lives abroad: see doubtfulResidence)
 *   + 0-43 affinity: discipline/sector fit (0-25, disciplineFit / cnaeCheck) + the profile's own words found in the
 *     call (0-18: statement, project idea, funding needs, achievements, bio) + what the profile is looking for that the
 *     call offers (0-6: residency, production, exhibition, publication, training, touring for creators; investment,
 *     digitalisation, hiring… for businesses)
 *   + 0-10 documents already available
 *   + 0-10 amount (real cash ranks up; no cash prize = 0; an entry fee costs 4)
 *   + 0-12 deadline (0-6: open now > upcoming > recurring) & proximity (0-6: same province, or same comunidad)
 *   = 0-100.
 * whyYouFit is ordered by how specific a reason is to this profile (discipline, own words, documents, zone, money)
 * before the generic eligibility passes (beneficiary type, open to all Spain): the card shows the first two.
 */
import type { Call, MatchResult, Profile } from "@/contracts";
import {
  cnaeCheck,
  disciplineFit,
  disciplineLabel,
  evaluateEligibility,
  formatCents,
  isDisciplineId,
  isWithin,
  ABROAD,
  ccaaOf,
  normalizeCall,
  normalizeDiscipline,
  normalizeProfile,
  normalizeTerritory,
  parseAgeRange,
  parseMinEmployees,
  territoryAncestors,
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
  affinity: number; // 0-43
  documents: number; // 0-10
  amount: number; // 0-10
  timing: number; // 0-12 (can you apply now + proximity)
}

export interface RuleResult {
  match: MatchResult;
  breakdown: ScoreBreakdown;
  excluded: boolean; // closed / past deadline: never shown in the feed
  fit: Fit; // discipline/sector fit: "none" = the call is made for other disciplines/sectors
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

export type Fit = "exact" | "within" | "related" | "any" | "general" | "none" | "sector" | "sector-unknown";

/** How the profile's discipline (creators) or sector (businesses) meets the call. */
export function fitOf(raw: Profile, p: CanonicalProfile, c: CanonicalCall, call?: Call): { fit: Fit; matched: string[] } {
  if (p.kind === "business" && c.sectors.length) return { fit: cnaeCheck(p.cnae, c.sectors) === "pass" ? "sector" : "sector-unknown", matched: [] };
  // A business rarely lists disciplines; its sector text ("artesanía / cerámica") is read against the same taxonomy.
  const mine = p.disciplines.length || !raw.sector ? p.disciplines : normalizeDiscipline(raw.sector).ids;
  const fit = disciplineFit(mine, c.disciplines);
  // General aid for autónomos/pymes (no discipline, no sector list) is made for any business: a real fit for a pyme.
  if (fit.fit === "any" && p.kind === "business" && (!call || call.beneficiaryKinds.includes("business"))) return { fit: "general", matched: [] };
  return fit;
}

// ---------- unconfirmed requirements ----------
/**
 * The score measures fit (discipline, own words, zone, money), not that the bases are met: a requirement the engine
 * cannot check against the profile ("Confírmalo") is still open. So a call that carries many of them never reads as a
 * sure thing: 3 or more cap it at "medio" and 5 or more at "bajo" (fitLabel: alto >= 70, medio >= 55).
 */
const CONFIRM_CAPS: readonly (readonly [number, number])[] = [
  [5, 54],
  [3, 69],
];
/** Takes the excess out of the "requisitos" then the "afinidad" part, so the parts still add up to the score. */
function capByUnconfirmed(b: ScoreBreakdown, unconfirmed: number) {
  const cap = CONFIRM_CAPS.find(([n]) => unconfirmed >= n)?.[1];
  if (cap === undefined) return;
  let excess = Object.values(b).reduce((s, x) => s + x, 0) - cap;
  for (const part of ["base", "affinity"] as const) {
    if (excess <= 0) break;
    const cut = Math.min(b[part], excess);
    b[part] -= cut;
    excess -= cut;
  }
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
  const checks = evaluateEligibility(p, c, { today }).checks;
  for (const k of checks) {
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

  // Other, not machine-checkable requirements → "Confírmalo". Age and staff-size sentences are left out when the
  // standard already checked them (its own line says pass, fail or confirm): never the same requirement twice.
  const ruled = new Set(checks.map((k) => k.rule));
  const others = call.eligibility.other.filter(
    (o) => !(ruled.has("age") && Object.keys(parseAgeRange(o)).length) && !(ruled.has("employees") && parseMinEmployees(o) !== undefined),
  );
  // Every one is listed: any of them can be the requirement that leaves this profile out.
  for (const o of others) miss.push(`Confírmalo: ${o}`);

  const fit = fitOf(profile, p, c, call);
  const breakdown: ScoreBreakdown = { base: 0, affinity: 0, documents: 0, amount: 0, timing: 0 };
  if (eligible) {
    breakdown.base = fit.fit === "none" ? 10 : 25;
    const territory = checks.find((k) => k.rule === "territory");
    if (territory?.result === "unknown" && doubtfulResidence(p, c)) breakdown.base = Math.max(0, breakdown.base - TERRITORY_DOUBT);
    breakdown.affinity = affinity(profile, call, p, c, fit, why, miss);
    breakdown.documents = documents(profile, call, ctx, why, miss);
    breakdown.amount = amount(c, call, why, miss);
    breakdown.timing = timing(p, c, call, call.deadline ? daysUntil(call.deadline, now) : undefined, why, miss);
  }
  if (eligible) capByUnconfirmed(breakdown, miss.filter((m) => m.startsWith("Confírmalo")).length);
  const score = Object.values(breakdown).reduce((s, x) => s + x, 0);

  return {
    match: {
      callId: call.id,
      profileId: profile.id,
      score: Math.max(0, Math.min(100, Math.round(score))),
      eligible,
      whyYouFit: bySpecificity(why),
      whatYouMiss: miss,
      generatedBy: "rules",
    },
    breakdown,
    excluded,
    fit: fit.fit,
  };
}

/**
 * Points for discipline/sector fit (0-25), per fleet/DATA-STANDARD.md (`within` is a full fit). General business aid
 * fits any pyme well; a call open to any discipline is a decent fit for every creator, below one made for theirs.
 */
const FIT_POINTS: Record<Fit, number> = { exact: 25, within: 25, sector: 25, general: 18, any: 14, related: 10, "sector-unknown": 8, none: 0 };
/** Points per word of the profile's narrative that the call also uses, and their cap. */
const WORD_POINTS = 4;
const WORDS_MAX = 18;

/**
 * How specific a "por qué encajas" reason is to this profile (lower = first). The card shows two: they must say
 * something about this person (discipline, own words, documents, zone, money), not what every eligible call shares.
 */
function whyRank(w: string): number {
  if (/^(Encaja con|Habla de lo tuyo|Tu actividad está entre)/.test(w)) return 0; // incl. "Encaja con lo que buscas"
  if (/^(Ya tienes|Es de tu|Vives en)/.test(w)) return 1;
  if (/^(Con dotación|Cumples|Abre pronto)/.test(w)) return 2;
  if (/^Se convoca cada año/.test(w)) return 3;
  return 4; // generic passes: beneficiary type, open to all Spain
}
/** Stable sort of the reasons by specificity, without duplicates. */
export function bySpecificity(why: string[]): string[] {
  return [...new Set(why)].map((w, i) => [whyRank(w), i, w] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , w]) => w);
}

const INTENT_GROUPS: [RegExp, RegExp, string][] = [
  [/\b(tienda online|web|comercio electronico|digitaliz\w*|software|app|ia|inteligencia artificial|ciberseguridad|crm|factura electronica)\b/, /\b(digital\w*|tienda online|software|ia|inteligencia artificial|ciberseguridad|web|innov\w*)\b/, "digitalización e innovación"],
  [/\b(innov\w*|patente|marca|diseno de producto|prototipo|i\+d|certificaci\w*)\b/, /\b(innov\w*|patentes?|marcas?|diseno|propuestas europeas)\b/, "innovación y diseño"],
  [/\b(horno|maquinaria|herramientas?|equipamiento|reforma|local|taller|mobiliario|invertir|inversion\w*|vehiculo|furgoneta)\b/, /\b(inversion\w*|equipamiento|reforma|modernizaci\w*|maquinaria)\b/, "inversión en el negocio"],
  [/\b(eficiencia energetica|energia|placas solares|solar|fotovoltaica|aerotermia|climatizacion|aislamiento|iluminacion)\b/, /\b(eficiencia energetica|renovables|solar|aerotermia|envolvente termica|iluminacion eficiente)\b/, "eficiencia energética"],
  [/\b(exportar|internacional\w*|ferias internacionales|vender fuera|europa|mercados exteriores)\b/, /\b(export\w*|internacional\w*|exterior)\b/, "internacionalización"],
  [/\b(consultoria|estrategia|finanzas|profesionaliz\w*|procesos|organizacion)\b/, /\b(consultoria|profesionalizacion|desarrollo estrategico)\b/, "consultoría y mejora de gestión"],
  [/\b(contratar|empleo|ayudante|emplead\w*|trabajador\w*|ampliar equipo|plantilla)\b/, /\b(empleo|contrat\w*|talento)\b/, "contratación y equipo"],
  [/\b(relevo|traspaso|jubilacion)\b/, /\b(relevo|traspaso|jubilacion)\b/, "relevo del negocio"],
  [/\b(darme de alta|darse de alta|empezar como autonom|emprender|iniciar actividad)\b/, /\b(darte de alta|inicio de actividad|empleo autonomo)\b/, "inicio de actividad como autónomo"],
];

/**
 * What a creator is looking for (funding needs, project idea) against what the call offers: [profile, call, label].
 * The call side reads its type and text; ordinal "edición" (XXX edición) is not publishing.
 */
const CREATOR_INTENTS: [RegExp, RegExp, string][] = [
  [/\b(residencia\w*|estancia\w*)\b/, /\b(residencia\w*|estancia\w*)\b/, "residencia"],
  [/\b(produc\w*|realizar|rodar|grabar|materiales|crear (?:una|mi|la|el) \w+)\b/, /\b(produc\w*|ayudas? a la creacion|creacion artistica|desarrollo de proyectos?)\b/, "producción"],
  [/\b(exponer|exposicion\w*|mostrar mi obra|galeria\w*|ensenar mi obra)\b/, /\b(exposicion\w*|expone\w*|muestra)\b/, "exponer tu obra"],
  [/\b(publicar|publicacion\w*|editar (?:un|una|mi)|fanzine|libro|poemario|novela)\b/, /\b(publicacion\w*|editorial|edicion del (?:libro|poemario|catalogo)|libro)\b/, "publicación"],
  [/\b(formacion|estudiar|estudios|master|curso|perfeccion\w*)\b/, /\b(formacion|estudios|perfeccion\w*|master)\b/, "formación"],
  [/\b(gira|giras|conciertos?|distribu\w*|festivales?|circulacion)\b/, /\b(gira|giras|circulacion|distribu\w*|programacion)\b/, "gira y distribución"],
];
const INTENT_POINTS = 4;
const INTENT_MAX = 6;

/** 0-45: discipline/sector fit (0-25) + the profile's own words (statement, project, needs, achievements) found in the call (0-20). */
function affinity(raw: Profile, call: Call, p: CanonicalProfile, c: CanonicalCall, fit: { fit: Fit; matched: string[] }, why: string[], miss: string[]): number {
  let pts = FIT_POINTS[fit.fit];
  const biz = raw.kind === "business";
  if (fit.fit === "exact" || fit.fit === "within") why.push(`Encaja con tu ${biz ? "actividad" : "disciplina"}: ${discNames(fit.matched).join(", ")}`);
  else if (fit.fit === "related") miss.push(`Confírmalo: es para ${discNames(c.disciplines).join(", ")}; revisa si encaja ${biz ? "tu actividad" : "tu trabajo"}`);
  else if (fit.fit === "none" && c.disciplines.length) miss.push(`Es para ${biz ? "otras actividades" : "otras disciplinas"}: ${discNames(c.disciplines).join(", ")}`);
  else if (fit.fit === "sector") why.push("Tu actividad está entre los sectores de la convocatoria");

  const words = ownWords(raw, call);
  pts += Math.min(WORDS_MAX, words.length * WORD_POINTS);
  if (words.length) why.push(`Habla de lo tuyo: ${displayWords(raw, words).slice(0, 3).join(", ")}`);

  if (!biz) {
    const wants = norm([raw.projectIdea ?? "", ...raw.fundingNeeds].join(" "));
    const offers = norm([call.type, call.title, call.summary, ...call.allowedExpenses].join(" "));
    const matched = CREATOR_INTENTS.filter(([pRe, cRe]) => pRe.test(wants) && cRe.test(offers)).map(([, , label]) => label);
    if (matched.length) {
      pts += Math.min(INTENT_MAX, matched.length * INTENT_POINTS);
      why.push(`Encaja con lo que buscas: ${matched.slice(0, 2).join(", ")}`);
    }
  }

  if (biz) {
    const profileText = [raw.statement, raw.bio, raw.projectIdea ?? "", ...raw.fundingNeeds, ...raw.achievements, raw.sector ?? ""].join(" ");
    const callText = [call.title, call.summary, ...call.criteria.flatMap((k) => [k.name, k.description]), ...call.allowedExpenses].join(" ");
    const pNorm = norm(profileText);
    const cNorm = norm(`${callText} ${call.eligibility.other.join(" ")}`);
    if (/\b(relevo|traspaso)\b/.test(norm(call.title)) && !/\b(relevo|traspaso|jubilacion)\b/.test(pNorm)) {
      pts = Math.max(2, pts - 8);
    }
    if (/\b(darte de alta|demandante de empleo|en paro)\b/.test(cNorm) && !/\b(alta|emprender|empezar|nuevo)\b/.test(pNorm)) {
      if (raw.foundedYear !== undefined && raw.foundedYear < new Date().getFullYear()) pts = Math.max(2, pts - 7);
      else pts = Math.max(4, pts - 4);
    }
    const intentSource = norm([raw.projectIdea ?? "", ...raw.fundingNeeds, raw.sector ?? ""].join(" ").trim() || profileText);
    if (/\b(icex|exportacion|internacionalizacion)\b/.test(norm(call.title)) && !/\b(export\w*|internacional\w*|exterior|europa|ferias internacionales)\b/.test(intentSource)) {
      pts = Math.max(4, pts - 6);
    }
    const matchedIntents: string[] = [];
    for (const [pRe, cRe, label] of INTENT_GROUPS) {
      if (pRe.test(intentSource) && cRe.test(cNorm)) matchedIntents.push(label);
    }
    if (matchedIntents.length) {
      pts += Math.min(INTENT_MAX, matchedIntents.length * INTENT_POINTS);
      why.push(`Encaja con lo que queréis financiar (${matchedIntents.slice(0, 2).join(", ")})`);
    }
  }
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

/** The profile's own spelling of the matched word stems ("acuarelas", "rederas"), for the reason line. */
function displayWords(raw: Profile, stems: string[]): string[] {
  const text = [raw.projectIdea ?? "", raw.statement, ...raw.fundingNeeds, raw.bio, ...raw.achievements].join(" ");
  const out: string[] = [];
  for (const stem of stems) {
    const word = text.split(/[^\p{L}\p{N}]+/u).find((w) => w.length >= 5 && norm(w).slice(0, 7) === stem);
    out.push((word ?? stem).toLowerCase());
  }
  return [...new Set(out)];
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
  return known ? Math.round((SCORE_MAX.documents * have) / known) : Math.round(SCORE_MAX.documents / 2);
}

const NO_CASH = /sin dotaci|sin premio en metalico|no (?:hay|tiene|conlleva) (?:premio|dotacion|cuantia)|sin cuantia|premio honorifico|sin contraprestacion economica/;
const ENTRY_FEE = /cuota de (?:inscripcion|participacion)|tasa de (?:inscripcion|participacion)|derechos? de inscripcion|precio de inscripcion|\d+(?:[.,]\d+)? ?(?:€|euros?) (?:de|por) (?:inscripcion|participacion|obra presentada)/;

/**
 * 0-10: money you can actually get. A real cash prize or grant ranks up; visibility-only calls (exhibition, no cash
 * prize) score 0, and an entry fee costs 4: for an artist, paying to apply is a cost, not an opportunity.
 */
function amount(c: CanonicalCall, call: Call, why: string[], miss: string[]): number {
  const cents = c.amount.maxCents ?? c.amount.minCents;
  const text = norm(`${call.amountText} ${call.summary} ${call.eligibility.other.join(" ")}`);
  let pts: number;
  if (cents === 0 || (cents === undefined && NO_CASH.test(text))) {
    pts = 0;
    miss.push("Sin premio en metálico");
  } else if (cents === undefined) pts = c.amount.totalCents && c.amount.totalCents >= 10_000_000 ? 6 : 3;
  else if (cents >= 300_000) pts = 10;
  else if (cents >= 100_000) pts = 8;
  else pts = 6;
  if (cents !== undefined && cents >= 100_000) why.push(`Con dotación económica: ${c.amount.minCents !== undefined && c.amount.minCents !== cents ? "hasta " : ""}${formatCents(cents)}`);
  if (ENTRY_FEE.test(text)) {
    pts = Math.max(0, pts - 4);
    miss.push("Cobra cuota de inscripción");
  }
  return Math.min(SCORE_MAX.amount, pts);
}

/** The province (or municipality) and comunidad the call belongs to: residence territories first, else the organiser's region. */
function callHome(c: CanonicalCall): string[] {
  const local = c.territories.filter((t) => t !== "ES" && t !== "WORLD");
  if (local.length) return local;
  if (!c.region) return [];
  const t = normalizeTerritory(c.region, { prefer: "broadest" }).id;
  return t ? [t] : [];
}

/**
 * 0-12: can you apply now (0-6) + proximity (0-6). An open call always beats an upcoming one, and that one a recurring
 * call whose edition has closed. Proximity: the call is from your province (6) or your comunidad (4), whether it
 * requires living there or a town organises it for everyone; local calls have less competition and are the
 * beachhead's (Galicia) real offer.
 */
function timing(p: CanonicalProfile, c: CanonicalCall, call: Call, daysLeft: number | undefined, why: string[], miss: string[]): number {
  let pts: number;
  if (call.status === "recurring") pts = 0;
  else if (call.status === "upcoming") pts = 3;
  else if (daysLeft === undefined) pts = 4;
  else if (daysLeft <= 3) {
    pts = 5;
    miss.push(daysLeft === 0 ? "Cierra hoy: hay que darse prisa" : `Cierra en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}: hay que darse prisa`);
  } else if (daysLeft <= 60) pts = 6;
  else pts = 5;
  return Math.min(SCORE_MAX.timing, pts + proximity(p, c, why));
}

/** Points a call loses when it may require living somewhere and that can't be confirmed for this profile. */
const TERRITORY_DOUBT = 8;

/**
 * A residence rule that can't be confirmed only costs points when it likely leaves the profile out: the profile lives
 * abroad, or the call belongs to another comunidad. A call with no known area, or from the profile's own comunidad,
 * keeps its points (the "Confírmalo" line still asks to check the bases).
 */
function doubtfulResidence(p: CanonicalProfile, c: CanonicalCall): boolean {
  if (p.territory === ABROAD) return true;
  const home = callHome(c);
  if (!home.length) return false;
  if (!p.territory) return true;
  const mine = ccaaOf(p.territory);
  return !home.some((t) => isWithin(p.territory, t) || (mine !== undefined && ccaaOf(t) === mine));
}

const LEVEL_PROVINCE = /^ES\d{3}$/;
const LEVEL_CCAA = /^ES\d{2}$/;
function proximity(p: CanonicalProfile, c: CanonicalCall, why: string[]): number {
  if (!p.territory) return 0;
  const mine = new Set(territoryAncestors(p.territory));
  const home = callHome(c);
  // Most specific shared unit between the call's home and the profile: municipality/province > comunidad.
  let best: { pts: number; name: string } | null = null;
  for (const t of home) {
    for (const a of territoryAncestors(t)) {
      if (!mine.has(a)) continue;
      const pts = a.startsWith("mun:") || LEVEL_PROVINCE.test(a) ? 6 : LEVEL_CCAA.test(a) ? 4 : 0;
      if (pts && (!best || pts > best.pts)) best = { pts, name: territoryName(a) };
    }
  }
  if (!best) return 0;
  why.push(best.pts === 6 ? `Es de tu zona (${best.name})` : `Es de tu comunidad (${best.name})`);
  return best.pts;
}

/** Required documents as a checklist, ticking what the user already has in Mecena (same rules as the score). */
export function checklistFor(p: Profile, c: Call, ctx: MatchContext = {}): { item: string; done: boolean }[] {
  return c.requiredDocuments.map((item) => {
    const rule = DOC_RULES.find((r) => r.test.test(norm(item)));
    return { item, done: rule ? rule.has(p, ctx, norm(item)) : false };
  });
}

