/**
 * Call-specific dossier variants: a pure transform on the ordered works, never an edit of the base dossier.
 * 1. Order series by keyword overlap with the call (title, summary, criteria, disciplines).
 * 2. Keep the first `maxImages` works in that order.
 * 3. Explain what we did in plain Spanish (`notes`).
 */
import type { Call, DossierVariant, Profile, Work } from "@/contracts";

const STOP = new Set(
  "para con sobre entre desde hasta como este esta estos estas pero porque cuando donde durante segun sera seran tiene tienen puede pueden debe deben hacer hace todo toda todos todas cada otro otra otros otras muy mas menos solo tambien proyecto proyectos convocatoria convocatorias ayuda ayudas beca becas premio premios meses euros persona personas fisica calidad interes viabilidad dossier memoria serie series obra obras trabajo".split(
    " ",
  ),
);

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Crude Spanish/Galician stemming: 5-char prefixes of content words. Enough for "ilustración"~"ilustradora". */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(text).split(/[^a-z0-9ñ]+/)) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.slice(0, 5));
  }
  return out;
}

export function callText(call: Call): string {
  return [call.title.replace(/^\[FIXTURE\]/, ""), call.summary, call.disciplines.join(" "), call.region ?? "", ...call.criteria.map((c) => `${c.name} ${c.description}`), call.dossierRequirements?.notes ?? ""].join(" ");
}

export interface SeriesScore {
  series: string; // display title ("" for works without series)
  score: number;
  matched: string[]; // human words from the series text that matched
}

function seriesText(title: string, works: Work[], profile?: Profile): string {
  const own = works.map((w) => [w.sheet.title, w.sheet.technique, w.sheet.concept, w.sheet.series].filter(Boolean).join(" ")).join(" ");
  const idea = profile?.projectIdea && title && normalize(profile.projectIdea).includes(normalize(title)) ? profile.projectIdea : "";
  return `${title} ${own} ${idea}`;
}

export function scoreSeries(works: Work[], call: Call, profile?: Profile): SeriesScore[] {
  const target = keywords(callText(call));
  const groups = new Map<string, Work[]>();
  for (const w of works) {
    const k = w.sheet.series?.trim() ?? "";
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  return [...groups].map(([series, ws]) => {
    const text = seriesText(series, ws, profile);
    const matched: string[] = [];
    const seen = new Set<string>();
    for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
      const stem = normalize(word).slice(0, 5);
      if (word.length >= 4 && target.has(stem) && !seen.has(stem) && !STOP.has(normalize(word))) {
        seen.add(stem);
        matched.push(word.toLowerCase());
      }
    }
    return { series, score: matched.length, matched };
  });
}

export interface VariantPlan {
  workIds: string[];
  variant: DossierVariant;
  seriesOrder: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function planVariant(input: { works: Work[]; call: Call; profile?: Profile; imageBytes?: (w: Work) => number | undefined }): VariantPlan {
  const { works, call, profile } = input;
  const req = call.dossierRequirements;
  const scores = scoreSeries(works, call, profile);
  // Stable sort: highest overlap first; ties keep the user's own order.
  const ranked = scores.map((s, i) => ({ ...s, i })).sort((a, b) => b.score - a.score || a.i - b.i);
  const ordered = ranked.flatMap((r) => works.filter((w) => (w.sheet.series?.trim() ?? "") === r.series));
  const max = req?.maxImages;
  const kept = max !== undefined ? ordered.slice(0, Math.max(0, max)) : ordered;

  const notes: string[] = [];
  const limits: string[] = [];
  if (max !== undefined) limits.push(`máx. ${plural(max, "imagen", "imágenes")}`);
  if (req?.maxFileMb !== undefined) limits.push(`${String(req.maxFileMb).replace(".", ",")} MB`);
  if (limits.length) {
    const mb = req?.maxFileMb !== undefined;
    let sentence: string;
    if (max !== undefined && works.length > max) sentence = `hemos dejado ${kept.length} de tus ${works.length} obras${mb ? " y comprimido el PDF" : ""}`;
    else if (max !== undefined && works.length) sentence = `${works.length === 1 ? "tu obra entra" : `tus ${works.length} obras entran todas`}${mb ? " y el PDF va comprimido" : ""}`;
    else if (max !== undefined) sentence = `aún no has subido obras${mb ? "; el PDF irá comprimido" : ""}`;
    else sentence = "el PDF va comprimido";
    notes.push(`La convocatoria pide ${limits.join(" y ")}: ${sentence}.`);
  }
  const top = ranked[0];
  const named = ranked.filter((r) => r.series);
  if (top && top.series && top.score > 0) {
    const why = top.matched.slice(0, 3).join(", ");
    notes.push(
      named.length > 1
        ? `Abrimos con la serie «${top.series}», la más cercana a lo que pide la convocatoria (${why}).`
        : `Tu serie «${top.series}» conecta con lo que pide la convocatoria (${why}): va en primer lugar.`,
    );
  } else if (works.length > 1) {
    notes.push("Ninguna serie coincide claramente con el tema de la convocatoria: mantenemos tu orden.");
  }
  if (input.imageBytes && req?.maxFileMb !== undefined) {
    const total = kept.reduce((n, w) => n + (input.imageBytes!(w) ?? 0), 0) / (1024 * 1024);
    if (total > req.maxFileMb) notes.push(`Ojo: tus fotos suman ${total.toFixed(1).replace(".", ",")} MB. Si el PDF supera el límite, quita alguna obra o súbelas con menos resolución.`);
  }
  if (req?.format) notes.push(`Formato pedido: ${req.format}.`);
  if (req?.notes) notes.push(`Las bases añaden: ${req.notes}`);
  const docName = call.requiredDocuments.find((d) => /dossier/i.test(d));
  if (docName) notes.push(`En la solicitud se presenta como «${docName}».`);
  if (!req) notes.push("Las bases no fijan límites para el dossier: va completo, con lo más afín primero.");

  return {
    workIds: kept.map((w) => w.id),
    seriesOrder: ranked.map((r) => r.series),
    variant: { callId: call.id, notes, maxImages: max, maxFileMb: req?.maxFileMb },
  };
}
