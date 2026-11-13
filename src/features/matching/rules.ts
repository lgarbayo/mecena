/**
 * Deterministic eligibility + fit score (fleet/DATA-PIPELINE.md §4). Code decides; Claude only explains.
 *
 * Phase A — hard filters: beneficiary kind, deadline/status, age, residence, legal form, max employees.
 *   A rule whose profile field is unknown never discards the call: it becomes "Confírmalo: …".
 * Phase B — score (only for eligible calls): 40 base + 0-25 discipline/sector & keywords
 *   + 0-15 documents already available + 0-10 amount + 0-10 deadline & territory = 0-100.
 */
import type { Call, MatchResult, Profile } from "@/contracts";
import { disciplineLabel, isDisciplineId } from "@/features/normalize";
import { daysUntil } from "./labels";

export interface MatchContext {
  now?: Date;
  hasDossier?: boolean; // the user already has a dossier in Mecena
  worksCount?: number; // photographed works with technical sheets
}

export interface ScoreBreakdown {
  base: number; // 40 when eligible
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

// ---------- text helpers ----------
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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


function profileAreas(p: Profile): string[] {
  return [p.city, p.province, p.region].filter((x): x is string => Boolean(x)).map(norm);
}

const LEGAL_FORM_ES: Record<string, string> = {
  autonomo: "autónomo",
  sl: "sociedad limitada",
  sa: "sociedad anónima",
  cooperativa: "cooperativa",
  asociacion: "asociación",
  otra: "otra forma jurídica",
};

// ---------- main ----------
export function evaluate(profile: Profile, call: Call, ctx: MatchContext = {}): RuleResult {
  const now = ctx.now ?? new Date();
  const why: string[] = [];
  const miss: string[] = [];
  let eligible = true;
  let excluded = false;
  const fail = (msg: string) => {
    eligible = false;
    miss.push(msg);
  };

  // Kind
  if (!call.beneficiaryKinds.includes(profile.kind)) {
    fail(profile.kind === "creator" ? "No está abierta a artistas a título individual" : "No está abierta a pymes ni autónomos");
  } else {
    why.push(profile.kind === "creator" ? "Está abierta a artistas y creadores" : "Está abierta a pymes y autónomos");
  }

  // Status / deadline
  const daysLeft = call.deadline ? daysUntil(call.deadline, now) : undefined;
  if (call.status === "closed" || (daysLeft !== undefined && daysLeft < 0)) {
    excluded = true;
    fail("El plazo ya está cerrado");
  } else if (call.status === "upcoming") {
    why.push(call.opensAt ? `Abre pronto (${call.opensAt}): tienes tiempo para prepararla` : "Abre pronto: tienes tiempo para prepararla");
  } else if (call.status === "recurring") {
    why.push("Se convoca cada año: puedes prepararla con calma");
  }

  // Age (we only know the birth year: at the deadline you are Y-b or Y-b-1)
  const { minAge, maxAge, residence, legalForms, maxEmployees } = call.eligibility;
  if (minAge !== undefined || maxAge !== undefined) {
    const range = [minAge ?? 0, maxAge ?? 200] as const;
    const rangeText =
      minAge !== undefined && maxAge !== undefined ? `entre ${minAge} y ${maxAge} años` : minAge !== undefined ? `al menos ${minAge} años` : `como máximo ${maxAge} años`;
    if (profile.birthYear === undefined) {
      miss.push(`Confírmalo: hay que tener ${rangeText}`);
    } else {
      const refYear = call.deadline ? Number(call.deadline.slice(0, 4)) : now.getUTCFullYear();
      const ages = [refYear - profile.birthYear - 1, refYear - profile.birthYear];
      const inRange = ages.filter((a) => a >= range[0] && a <= range[1]);
      if (inRange.length === 0) fail(`Piden tener ${rangeText} y tú tendrás ${ages[1]} al cierre`);
      else if (inRange.length === 1) miss.push(`Confírmalo: piden ${rangeText}; depende de tu fecha de cumpleaños`);
      else why.push(`Cumples la edad: piden ${rangeText}`);
    }
  }

  // Residence (empty = Spain-wide)
  if (residence.length) {
    const areas = profileAreas(profile);
    if (!areas.length) miss.push(`Confírmalo: piden residir en ${residence.join(" o ")}`);
    else {
      const hit = residence.find((r) => areas.includes(norm(r)));
      if (hit) why.push(`Vives en ${profile.city ?? profile.province ?? profile.region}: cumples el requisito de residencia (${hit})`);
      else fail(`Piden residir en ${residence.join(" o ")}`);
    }
  }

  // Business-only rules
  if (profile.kind === "business") {
    if (legalForms.length) {
      const allowed = legalForms.map(norm);
      if (!profile.legalForm) miss.push(`Confírmalo: forma jurídica admitida (${legalForms.map((l) => LEGAL_FORM_ES[l] ?? l).join(", ")})`);
      else if (allowed.includes(norm(profile.legalForm))) why.push(`Tu forma jurídica (${LEGAL_FORM_ES[profile.legalForm]}) está admitida`);
      else fail(`No admite tu forma jurídica (${LEGAL_FORM_ES[profile.legalForm]})`);
    }
    if (maxEmployees !== undefined) {
      if (profile.employees === undefined) miss.push(`Confírmalo: como máximo ${maxEmployees} personas en plantilla`);
      else if (profile.employees <= maxEmployees) why.push(`Cumples el tamaño: hasta ${maxEmployees} personas en plantilla`);
      else fail(`Piden como máximo ${maxEmployees} personas en plantilla y tienes ${profile.employees}`);
    }
  }

  // Other, not machine-checkable requirements → always "Confírmalo"
  for (const o of call.eligibility.other.slice(0, 2)) miss.push(`Confírmalo: ${o}`);

  const breakdown: ScoreBreakdown = { base: 0, affinity: 0, documents: 0, amount: 0, timing: 0 };
  if (eligible) {
    breakdown.base = 40;
    breakdown.affinity = affinity(profile, call, why);
    breakdown.documents = documents(profile, call, ctx, why, miss);
    breakdown.amount = amount(call);
    breakdown.timing = timing(profile, call, daysLeft, why, miss);
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

/** 0-25: discipline/sector overlap (0-15) + keyword overlap between profile narrative and call text (0-10). */
function affinity(p: Profile, c: Call, why: string[]): number {
  let pts = 0;
  const mine = p.kind === "creator" ? p.disciplines : [p.sector, p.cnae].filter((x): x is string => Boolean(x));
  const theirs = p.kind === "creator" ? c.disciplines : c.sectors;
  if (!theirs.length) {
    pts += 8; // open to any discipline/sector
  } else {
    const mineTok = tokens(mine.join(" "));
    const hits = theirs.filter((t) => overlap(tokens(t), mineTok).length > 0);
    if (hits.length) {
      pts += 15;
      const shown = hits.slice(0, 3).map((h) => (isDisciplineId(h) ? disciplineLabel(h).toLowerCase() : h));
      why.push(`Encaja con tu ${p.kind === "creator" ? "disciplina" : "sector"}: ${shown.join(", ")}`);
    }
  }
  const profileText = [p.statement, p.bio, p.projectIdea ?? "", ...p.fundingNeeds, ...p.achievements, ...mine].join(" ");
  const callText = [c.title, c.summary, ...c.criteria.flatMap((k) => [k.name, k.description]), ...c.allowedExpenses, ...c.disciplines, ...c.sectors].join(" ");
  const shared = overlap(tokens(profileText), tokens(callText));
  if (shared.length) pts += Math.min(10, shared.length * 3);
  return Math.min(25, pts);
}

const DOC_RULES: { test: RegExp; has: (p: Profile, ctx: MatchContext) => boolean; label: string }[] = [
  { test: /dossier|portfolio|porfolio|imagenes|fotografias|obras/, has: (_p, ctx) => Boolean(ctx.hasDossier) || (ctx.worksCount ?? 0) > 0, label: "dossier con tus obras" },
  { test: /\bcv\b|curriculum|trayectoria|biografia/, has: (p) => p.achievements.length + p.education.length > 0 || p.bio.length > 0, label: "currículum" },
  { test: /memoria|proyecto|sinopsis/, has: (p) => Boolean(p.projectIdea), label: "idea del proyecto para la memoria" },
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
function amount(c: Call): number {
  const max = c.amountEur.max ?? c.amountEur.min;
  if (max === undefined) return 4;
  if (max >= 3000) return 10;
  if (max >= 1000) return 8;
  return 6;
}

/** 0-10: deadline preparability (0-7) + same territory bonus (0-3). */
function timing(p: Profile, c: Call, daysLeft: number | undefined, why: string[], miss: string[]): number {
  let pts: number;
  if (c.status === "upcoming" || c.status === "recurring") pts = 5;
  else if (daysLeft === undefined) pts = 4;
  else if (daysLeft <= 3) {
    pts = 2;
    miss.push(daysLeft === 0 ? "Cierra hoy: hay que darse prisa" : `Cierra en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}: hay que darse prisa`);
  } else if (daysLeft <= 7) pts = 5;
  else if (daysLeft <= 60) pts = 7;
  else pts = 5;
  if (c.region && profileAreas(p).includes(norm(c.region))) {
    pts += 3;
    why.push(`Es de tu zona (${c.region})`);
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

