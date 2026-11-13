/**
 * Call-adapted dossier (layer 2, CCR-7). Claude rewrites the user's base dossier for ONE call: the structure the
 * bases prescribe (or criteria by weight), the user's own phrases, gaps as "[PENDIENTE: …]". Eligibility and fit
 * are WP-06's deterministic rules and arrive as input; the model never re-decides them.
 * Prompt distilled from the live spike (fleet/spikes/voice/FINDINGS.md §9): 0 invented numbers in 9 variants.
 * The mock is deterministic and genuinely useful offline: sections ordered by criterion weight, filled from the
 * base section with the most keyword overlap, pending gaps as placeholders + questions.
 */
import { AdaptDossierResult, type AdaptDossierInput, type AiSlice, type Call, type CallCriterion, type DossierSection, type Profile } from "@/contracts";
import { structured } from "@/server/ai/llm";
import { keywords } from "./variant";

export const SECTION_TITLES: Record<string, string> = {
  statement: "Declaración artística",
  bio: "Biografía",
  series: "Series",
  works: "Obras",
  cv: "Trayectoria",
  contact: "Contacto",
  activity: "Actividad",
  team: "Equipo",
  projects: "Proyectos",
  figures: "Cifras",
  location: "Ubicación",
};

export function allowedFrom(kind: Profile["kind"]): string[] {
  const keys = kind === "creator" ? ["statement", "bio", "series", "works", "cv", "contact"] : ["activity", "team", "projects", "figures", "location", "contact"];
  return [...keys, "profile", "nuevo"];
}

function system(kind: Profile["kind"]): string {
  return `You adapt a Mecena user's dossier to ONE specific call (convocatoria) in Spain, so that the committee finds, in the order and words they score, the evidence for each criterion.
Input (JSON):
- CALL: real rules: criteria with ids and points, required documents, format limits, allowed expenses.
- FIT: eligibility and fit already decided by Mecena's deterministic rules, plus why the user fits and what is missing. Do NOT re-assess eligibility or give scores; use it to know where the gaps are.
- PROFILE: the user's structured facts.
- BASE_DOSSIER: the generic ${kind === "creator" ? "artistic dossier" : "company dossier"} already written from the user's own words, by section key.
- WORKS: technical sheets of the works selected for this call, in order.
- TRANSCRIPT: what the user actually said (verbatim).

What a good variant does:
1. Structure: if the call prescribes the structure of the memoria or dossier (e.g. "A) categoría, B) nombre… C) concepto…"), use exactly those headings in that order. Otherwise order sections by criterion weight, heaviest first. If the call publishes no criteria, order by what the summary says it values.
2. Emphasis: lead each section with the facts that score on its criterion; cut or shorten what scores nothing for this call (list it in "omitted" with the reason). Name the call's own concepts only when the user's facts genuinely support them (e.g. "cohesión territorial" when they talk about the rural world), never as empty buzzwords.
3. Voice: reuse the user's own phrases from TRANSCRIPT and BASE_DOSSIER, in first person as the dossier does. Spanish from Spain (tú, never voseo), sober, no superlatives, no art-speak or business jargon they did not use.
4. Truth: use only facts in PROFILE / BASE_DOSSIER / WORKS / TRANSCRIPT. Never invent numbers, dates, venues, budgets, partners, audiences, dissemination plans or ODS links. When the call scores something the user has not given (budget, calendar, dissemination plan, impact…), write a visible placeholder "[PENDIENTE: …]" saying exactly what is needed, and add a question for it.
5. criteria: the CALL criterion ids each section serves (use the ids exactly; [] if none). from: which of ${allowedFrom(kind).map((k) => `"${k}"`).join(", ")} it draws on ("nuevo" for call-specific blocks such as a budget skeleton).
6. questions: one per real gap, ordered by points at stake, max 5, Spanish (tú), short. criterionId = the criterion id it would raise, or "" if none.
7. formatChecks: one per format rule (dossierRequirements) or required document in CALL: "ok" (the dossier covers it), "riesgo" (may fail: say why) or "no_aplica" (not part of the dossier; the user provides it), with a short Spanish note.
8. strategy: 2-3 Spanish sentences for the user: what this version puts first and why, in terms of this call's criteria.
9. Body format: plain paragraphs separated by a blank line and "- " bullets only. No markdown headings, no bold. Length: what the committee needs, not more. A dense two pages beat ten soft ones.`;
}

function brief({ profile, call, sections, works, transcript, match }: AdaptDossierInput) {
  return {
    CALL: {
      title: call.title,
      organizer: call.organizer,
      type: call.type,
      amount: call.amountText,
      deadline: call.deadlineText,
      summary: call.summary,
      eligibility: call.eligibility,
      requiredDocuments: call.requiredDocuments,
      dossierRequirements: call.dossierRequirements ?? null,
      criteria: call.criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, maxPoints: c.maxPoints })),
      criteriaSource: call.criteriaSource,
      allowedExpenses: call.allowedExpenses,
    },
    FIT: { eligible: match.eligible, score: match.score, whyYouFit: match.whyYouFit, whatYouMiss: match.whatYouMiss },
    PROFILE: {
      kind: profile.kind,
      name: profile.displayName,
      place: [profile.city, profile.province, profile.region].filter(Boolean).join(", "),
      birthYear: profile.birthYear,
      disciplines: profile.disciplines,
      sector: profile.sector,
      legalForm: profile.legalForm,
      cnae: profile.cnae,
      employees: profile.employees,
      foundedYear: profile.foundedYear,
      annualRevenueEur: profile.annualRevenueEur,
      statement: profile.statement,
      bio: profile.bio,
      achievements: profile.achievements,
      education: profile.education,
      projectIdea: profile.projectIdea,
      fundingNeeds: profile.fundingNeeds,
      languages: profile.languages,
    },
    BASE_DOSSIER: Object.fromEntries(sections.filter((s) => s.body.trim()).map((s) => [s.key, { title: s.title, body: s.body }])),
    WORKS: works.map((w) => w.sheet),
    TRANSCRIPT: transcript.slice(-80).map((t) => t.text),
  };
}

// ---------------------------------------------------------------- deterministic mock

interface Source {
  key: string;
  body: string;
  kw: Set<string>;
}

function sources(profile: Profile, sections: DossierSection[]): Source[] {
  const out: Source[] = sections.filter((s) => s.body.trim()).map((s) => ({ key: s.key, body: s.body.trim(), kw: keywords(s.body) }));
  const has = (k: string) => out.some((s) => s.key === k);
  const add = (key: string, body: string | undefined) => {
    if (body?.trim()) out.push({ key, body: body.trim(), kw: keywords(body) });
  };
  if (profile.kind === "creator") {
    if (!has("statement")) add("statement", profile.statement);
    if (!has("bio")) add("bio", profile.bio);
  } else if (!has("activity")) add("activity", [profile.statement, profile.bio].filter(Boolean).join("\n\n"));
  add("profile", [profile.projectIdea, profile.fundingNeeds.length ? `Necesito financiación para: ${profile.fundingNeeds.join(", ")}.` : ""].filter(Boolean).join("\n\n"));
  if (!has("cv") && !has("projects") && profile.achievements.length) add(profile.kind === "creator" ? "cv" : "projects", profile.achievements.map((a) => `- ${a}`).join("\n"));
  return out;
}

const firstParas = (body: string, n = 2) => body.split(/\n\s*\n/).slice(0, n).join("\n\n");

/** What a criterion needs that a dossier rarely has: these get a placeholder unless the user said something. */
const NEEDS: { re: RegExp; ask: string; question: string }[] = [
  { re: /presupuest|econ[oó]mic|coste|gasto|financ/i, ask: "presupuesto desglosado por partidas", question: "¿Cuánto cuesta tu proyecto y en qué partidas (materiales, producción, viajes, honorarios)?" },
  { re: /difusi[oó]n|comunicaci[oó]n|p[uú]blico|audiencia|divulg/i, ask: "plan de difusión (dónde y cómo se mostrará)", question: "¿Dónde y cómo vas a mostrar o difundir el resultado?" },
  { re: /calendario|cronograma|plazo de ejecuci|viabilidad|planificaci/i, ask: "calendario de ejecución por meses", question: "¿En cuántos meses lo harías y qué harías en cada fase?" },
  { re: /impacto|social|territori|igualdad|g[eé]nero|sostenib|ods/i, ask: "impacto social o territorial concreto", question: "¿A quién llega tu proyecto y qué cambia en tu entorno?" },
  { re: /empleo|contrataci|puestos de trabajo/i, ask: "empleo que crea o mantiene", question: "¿Cuántas personas trabajan o trabajarán en el proyecto?" },
];

function mockAdapt({ profile, call, sections, works }: AdaptDossierInput): AdaptDossierResult {
  const src = sources(profile, sections);
  const used = new Set<string>();
  const out: AdaptDossierResult["sections"] = [];
  const questions: AdaptDossierResult["questions"] = [];

  if (call.criteria.length) {
    const ranked = [...call.criteria].sort((a, b) => b.maxPoints - a.maxPoints);
    for (const c of ranked) {
      const target = keywords(`${c.name} ${c.description}`);
      const scored = src.map((s) => ({ s, n: [...s.kw].filter((k) => target.has(k)).length })).sort((a, b) => b.n - a.n || Number(used.has(a.s.key)) - Number(used.has(b.s.key)));
      const best = scored[0]?.n ? scored[0].s : undefined;
      const need = NEEDS.find((n) => n.re.test(`${c.name} ${c.description}`));
      const parts: string[] = [];
      if (best) {
        parts.push(firstParas(best.body));
        used.add(best.key);
      }
      if (need && (!best || !need.re.test(best.body))) {
        parts.push(`[PENDIENTE: ${need.ask}. Este criterio vale ${pts(c)}.]`);
        questions.push({ criterionId: c.id, question: need.question });
      } else if (!best) {
        parts.push(`[PENDIENTE: cuéntanos qué aportas en «${c.name.toLowerCase()}». Vale ${pts(c)}.]`);
        questions.push({ criterionId: c.id, question: `¿Qué tienes que encaje con «${c.name.toLowerCase()}»?` });
      }
      out.push({ id: c.id, heading: c.name, body: parts.join("\n\n"), criteria: [c.id], from: best ? [best.key] : ["nuevo"] });
    }
  } else {
    for (const s of src) {
      out.push({ id: s.key, heading: SECTION_TITLES[s.key] ?? "Proyecto", body: s.body, criteria: [], from: [s.key] });
      used.add(s.key);
    }
  }

  const omitted = src
    .filter((s) => !used.has(s.key) && s.key !== "contact")
    .map((s) => ({ what: SECTION_TITLES[s.key] ?? "Idea de proyecto", why: "No puntúa en ningún criterio de esta convocatoria; sigue en tu dossier general." }));
  const top = [...call.criteria].sort((a, b) => b.maxPoints - a.maxPoints)[0];
  const strategy = top
    ? `Ordenamos tu dossier por lo que más puntúa en esta convocatoria: primero «${top.name}» (${pts(top)}). Lo que aún no nos has contado queda marcado como [PENDIENTE] para que lo completes; no inventamos nada.`
    : "Las bases no publican criterios de valoración: abrimos con lo que más se acerca a lo que piden y mantenemos tus textos. Lo que falta queda marcado como [PENDIENTE].";
  return { strategy, sections: out, omitted, questions: questions.slice(0, 5), formatChecks: formatChecks(call, works.length) };
}

const pts = (c: CallCriterion) => `${c.maxPoints} ${c.maxPoints === 1 ? "punto" : "puntos"}`;

/** Deterministic format checks from the call's rules (also used to complete the model's list). */
export function formatChecks(call: Call, worksCount: number): AdaptDossierResult["formatChecks"] {
  const req = call.dossierRequirements;
  const out: AdaptDossierResult["formatChecks"] = [];
  if (req?.maxImages !== undefined)
    out.push({ rule: `Máximo ${req.maxImages} imágenes`, status: "ok", note: worksCount ? `Van ${Math.min(worksCount, req.maxImages)}.` : "Aún no has subido obras." });
  if (req?.maxFileMb !== undefined) out.push({ rule: `Archivo de ${req.maxFileMb} MB como máximo`, status: "riesgo", note: "Compruébalo al descargar el PDF: depende del peso de tus fotos." });
  if (req?.format) out.push({ rule: `Formato: ${req.format}`, status: /pdf/i.test(req.format) ? "ok" : "riesgo", note: /pdf/i.test(req.format) ? "Mecena lo exporta en PDF." : "Revisa que el formato coincide." });
  for (const d of call.requiredDocuments) {
    const ours = /dossier|portfolio|porfolio|memoria|curr[ií]cul|\bcv\b|trayectoria|statement|declaraci[oó]n art/i.test(d);
    out.push({ rule: d, status: ours ? "ok" : "no_aplica", note: ours ? "Sale de este dossier; revísalo antes de presentarlo." : "No va en el dossier: lo aportas tú en la solicitud." });
  }
  return out;
}

export const dossierAi: AiSlice<"adaptDossier"> = {
  mock: {
    async adaptDossier(input) {
      return mockAdapt(input);
    },
  },
  real: {
    async adaptDossier(input) {
      return structured({
        tier: "fast",
        effort: "medium",
        system: system(input.profile.kind),
        schema: AdaptDossierResult,
        maxTokens: 8000,
        user: JSON.stringify(brief(input), null, 1),
      });
    },
  },
};

export const __test = { mockAdapt };
