/**
 * Dossier view model: a pure mapping from Profile + Dossier sections + Works to what the templates render.
 * Shared by the web page (React DOM), the progressive build (WP-01) and the PDF (@react-pdf/renderer).
 * No Node or browser APIs here, so it is safe to import from client components.
 */
import type { Call, CropSuggestion, Dossier, DossierSection, Profile, Work } from "@/contracts";
import { familyOf, vocabFor, type ArtFamily } from "./arts";

export type SectionState = "pending" | "filling" | "ready";

export interface WorkView {
  id: string;
  catNo: number;
  title: string;
  year: string;
  technique: string;
  size: string;
  concept: string;
  imageUrl: string;
  seriesId: string;
  // Every art (CCR-arts): read when the work carries them, empty otherwise.
  duration: string;
  credits: string;
  venue: string;
  links: string[];
  mediaKind: string;
  /** Light photo crop/straighten (vision suggestion or the artist's own); applied on the untouched original. */
  crop?: CropSuggestion;
  /** The artist confirmed the sheet. Unconfirmed works are marked on screen and left out of the PDF. */
  confirmed: boolean;
}

export interface SeriesView {
  id: string;
  title: string;
  years: string;
  description: string[];
  works: WorkView[];
}

export interface CvItem {
  year: string;
  text: string;
  place?: string;
}
export interface CvGroup {
  key: "education" | "soloShows" | "groupShows" | "awards" | "residencies" | "collections" | "other";
  title: string;
  items: CvItem[];
}

export interface FactRow {
  label: string;
  value: string;
  href?: string;
}

export interface VariantSectionView {
  id: string;
  heading: string;
  /** Paragraphs split into text and "[PENDIENTE: …]" gaps, so templates can highlight what the user must add. */
  paras: { text: string; pending: boolean }[][];
  criteria: string[]; // "Calidad artística · 40 ptos"
}

export interface VariantView {
  callId: string;
  callName: string;
  callRef?: string;
  notes: string[];
  strategy?: string;
  sections: VariantSectionView[]; // empty = order/limits only (no content adaptation)
  questions: { criterion?: string; question: string }[];
  formatChecks: { rule: string; status: "ok" | "riesgo" | "no_aplica"; note: string }[];
  omitted: { what: string; why: string }[];
  unsupportedNumbers: string[];
  generatedBy?: "rules" | "ai" | "mock";
}

export interface Person {
  name: string;
  role: string;
  bio: string;
}

export type CreatorSection = "cover" | "statement" | "bio" | "series" | "cv" | "contact";
export type BusinessSection = "cover" | "activity" | "team" | "projects" | "figures" | "contact";

export interface CreatorView {
  kind: "creator";
  family: ArtFamily;
  date: string;
  name: string;
  discipline: string;
  city: string;
  tagline: string;
  statement: string[];
  bio: string[];
  cover?: WorkView;
  series: SeriesView[];
  cv: CvGroup[];
  contact: FactRow[];
  states: Record<CreatorSection, SectionState>;
  variant?: VariantView;
}

export interface BusinessView {
  kind: "business";
  date: string;
  name: string;
  activityShort: string;
  city: string;
  tagline: string;
  activity: string[];
  plan: { idea: string; needs: string[] };
  team: { size?: number; people: Person[]; text: string[] };
  projects: { works: WorkView[]; milestones: string[]; text: string[] };
  facts: FactRow[];
  location: FactRow[];
  cover?: WorkView;
  contact: FactRow[];
  states: Record<BusinessSection, SectionState>;
  variant?: VariantView;
}

export type DossierView = CreatorView | BusinessView;

// ---------------------------------------------------------------- text helpers

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function formatMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = MONTHS[d.getUTCMonth()];
  return `${m[0].toUpperCase()}${m.slice(1)} ${d.getUTCFullYear()}`;
}

export const capitalize = (s: string) => (s ? s[0].toLocaleUpperCase("es-ES") + s.slice(1) : s);

/** "a", "b", "c" -> "A, b y c" */
export function joinEs(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length === 0) return "";
  const out = xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
  return capitalize(out);
}

/** Straight quotes around a phrase -> Spanish angle quotes: 'Redeiras' -> «Redeiras». */
export const typo = (s: string) => s.replace(/(^|[\s(])['"]([^'"\n]{1,80}?)['"](?=$|[\s.,;:!?)])/g, "$1«$2»");

/** markdown-lite body -> paragraphs (bullets are kept as their own lines without the dash). */
export function paragraphs(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\n\s*\n|\n(?=\s*[-•]\s)/)
    .map((p) => typo(p.replace(/^\s*[-•]\s+/, "").replace(/\s*\n\s*/g, " ").trim()))
    .filter(Boolean);
}

export function bullets(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-•]\s+/.test(l))
    .map((l) => l.replace(/^[-•]\s+/, "").trim())
    .filter(Boolean);
}

/** First sentence, if short enough to work as the cover line. */
export function firstSentence(text: string, max = 170): string {
  const t = text.trim();
  if (!t) return "";
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  const s = (m ? m[1] : t).trim();
  return s.length <= max ? s : "";
}

/** "56 x 76 cm" -> "56 × 76 cm" (typographic times sign, museum convention). */
export const formatSize = (s?: string) => (s ?? "").replace(/(\d)\s*[xX*]\s*(?=\d)/g, "$1 × ").trim();

export const eur = (n: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: true }).format(n).replace(/^(\d)(\d{3})$/, "$1.$2")} €`;

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "obra";

const sectionBody = (sections: DossierSection[], key: string) => {
  const s = sections.find((x) => x.key === key && x.status !== "empty");
  return s?.body?.trim() ? s.body : undefined;
};

// ---------------------------------------------------------------- works / series

/** Fields added by CCR-arts (feat/arts-works); read loosely so the dossier works before and after the merge. */
type ArtsWork = Work & { mediaKind?: string; links?: string[]; sheet: Work["sheet"] & { duration?: string; credits?: string; venue?: string } };

export function toWorkView(w: Work, catNo: number): WorkView {
  const a = w as ArtsWork;
  return {
    duration: a.sheet.duration?.trim() ?? "",
    credits: a.sheet.credits?.trim() ?? "",
    venue: a.sheet.venue?.trim() ?? "",
    links: (a.links ?? []).filter((l) => /^https?:\/\//.test(l)),
    mediaKind: a.mediaKind ?? "image",
    id: w.id,
    catNo,
    title: w.sheet.title?.trim() || "Sin título",
    year: w.sheet.year ? String(w.sheet.year) : "",
    technique: capitalize(w.sheet.technique?.trim() ?? ""),
    size: formatSize(w.sheet.dimensions),
    concept: w.sheet.concept?.trim() ?? "",
    imageUrl: w.imageUrl,
    seriesId: slug(w.sheet.series?.trim() || "sin-serie"),
    crop: w.crop,
    confirmed: w.confirmed !== false,
  };
}

function yearsOf(works: WorkView[]): string {
  const ys = works.map((w) => Number(w.year)).filter((n) => n > 0);
  if (!ys.length) return "";
  const a = Math.min(...ys);
  const b = Math.max(...ys);
  return a === b ? String(a) : `${a}–${b}`;
}

/**
 * Groups works by `sheet.series` in the given order (first appearance wins) and numbers them Cat. 1..n.
 * Series descriptions come from the "series" section (paragraphs that name the series) or from the
 * project idea when it names the series; with a single series the whole section text is used.
 */
export function groupSeries(works: Work[], ctx: { seriesBody?: string; projectIdea?: string; worksTitle?: string }): SeriesView[] {
  const fallback = ctx.worksTitle ?? "Obra";
  const groups = new Map<string, { title: string; works: Work[] }>();
  for (const w of works) {
    const title = w.sheet.series?.trim() || "";
    const id = slug(title || "sin-serie");
    if (!groups.has(id)) groups.set(id, { title, works: [] });
    groups.get(id)!.works.push(w);
  }
  const paras = paragraphs(ctx.seriesBody);
  let cat = 0;
  const out: SeriesView[] = [];
  const named = [...groups.values()].filter((g) => g.title).length;
  for (const [id, g] of groups) {
    const views = g.works.map((w) => toWorkView(w, ++cat));
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let description: string[] = [];
    if (g.title) {
      description = paras.filter((p) => norm(p).includes(norm(g.title)));
      if (!description.length && named === 1 && paras.length) description = paras;
      if (!description.length && ctx.projectIdea && norm(ctx.projectIdea).includes(norm(g.title))) description = [typo(ctx.projectIdea.trim())];
    } else if (groups.size === 1) {
      description = paras;
    }
    out.push({ id, title: g.title || (groups.size === 1 ? fallback : `Otras ${fallback.toLowerCase() === "obra" ? "obras" : fallback.toLowerCase()}`), years: yearsOf(views), description, works: views });
  }
  // No works yet: the series text alone, untitled (the rail already names the block; see planCreator).
  if (!out.length && paras.length) out.push({ id: "serie", title: "", years: "", description: paras, works: [] });
  return out;
}

// ---------------------------------------------------------------- CV

const CV_TITLES: Record<CvGroup["key"], string> = {
  education: "Formación",
  soloShows: "Exposiciones individuales",
  groupShows: "Exposiciones colectivas",
  awards: "Premios y becas",
  residencies: "Residencias",
  collections: "Obra en colecciones",
  other: "Otros méritos",
};
const CV_ORDER: CvGroup["key"][] = ["education", "soloShows", "groupShows", "awards", "residencies", "collections", "other"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function classifyAchievement(text: string): CvGroup["key"] {
  const t = norm(text);
  if (/residencia/.test(t)) return "residencies";
  if (/coleccion|fondos de|disco|album|\bep\b|single|discografia|publicad|editorial|libro|poemario|novela|cortometraje|largometraje|filmografia/.test(t)) return "collections";
  if (/concierto|gira|recital|actuacion|funcion|estreno|festival|proyeccion|seleccion oficial|lectura|presentacion/.test(t)) return /gira|festival|seleccion/.test(t) ? "groupShows" : "soloShows";
  if (/premio|beca|finalista|mencion|ganador|ayuda|seleccionad|accesit/.test(t)) return "awards";
  if (/(exposicion|muestra)[^,.]*colectiva|colectiva/.test(t)) return "groupShows";
  if (/exposicion|muestra|individual/.test(t)) return "soloShows";
  if (/grado|licenciatura|master|máster|doctorado|universidad|universidade|escuela|escola|ciclo|curso|taller de|bellas artes/.test(t)) return "education";
  return "other";
}

/** "Exposición colectiva en el Kiosko Alfonso (2024)" -> { year: "2024", text: "Kiosko Alfonso" } */
export function toCvItem(raw: string, group: CvGroup["key"]): CvItem {
  let text = raw.trim().replace(/\.$/, "");
  let year = "";
  const paren = /\s*\((\d{4})(?:[–-]\d{2,4})?\)\s*/.exec(text);
  if (paren) {
    year = paren[1];
    text = text.replace(paren[0], " ").trim();
  } else {
    const lead = /^((?:19|20)\d{2})\s*[:.\-–]\s*/.exec(text); // "2025: hicimos gira por Portugal"
    const m = lead ?? /(?:^|[\s,])((?:19|20)\d{2})(?=$|[\s,.;:])/.exec(text);
    if (lead) {
      year = lead[1];
      text = capitalize(text.slice(lead[0].length));
    } else if (m) {
      year = m[1];
      text = text.replace(new RegExp(`[,\\s]*(en\\s+)?${m[1]}\\b`), "").trim();
    }
  }
  if (group === "soloShows" || group === "groupShows") {
    const stripped = text.replace(/^(exposici[oó]n|muestra)(\s+(individual|colectiva))?(\s+en(\s+(el|la|los|las))?)?\s+/i, "");
    if (stripped && stripped !== text) text = capitalize(stripped);
  }
  let place: string | undefined;
  const comma = text.split(/,\s+/);
  if ((group === "education" || group === "awards") && comma.length > 1) {
    place = comma.slice(1).join(", ");
    text = comma[0];
  }
  return { year, text: text.replace(/\s{2,}/g, " ").replace(/[,\s]+$/, ""), place };
}

const CV_STOP = new Set("el la los las lo un una unos unas de del y e o u en a al con por para que mi mis su sus mas the".split(" "));

/** Content words of a CV line, folded: "Dos EPs publicados: el primero, Dolor…" -> dos, eps, publicados, primero, dolor… */
function cvTokens(raw: string): string[] {
  return norm(raw)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !CV_STOP.has(t));
}

/** Same word, allowing a plural or a short form ("ep"~"eps", "primer"~"primero"); numbers (years) must match exactly. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 2 && long.startsWith(short) && long.length - short.length <= 2;
}

/** True when every content word of `a` is in `b` (so `a` says nothing `b` does not already say). */
function containedIn(a: string[], b: string[]): boolean {
  return a.length > 0 && a.every((t) => b.some((u) => sameWord(t, u)));
}

/**
 * Drops CV lines already said by another line: the profile's achievements and the CV section often repeat the
 * same facts ("Primer EP: Dolor" and "Dos EPs publicados: el primero, Dolor, y el segundo, Amor"). The fuller line
 * stays, in the place of the first of them; lines that only share some words are kept.
 */
export function dedupeContained(lines: string[]): string[] {
  const toks = lines.map(cvTokens);
  const drop = new Set<number>();
  toks.forEach((a, i) => {
    toks.forEach((b, j) => {
      if (i === j || drop.has(i) || drop.has(j)) return;
      // Strictly fuller line wins; for two lines that contain each other, the first one stays.
      if (containedIn(a, b) && (!containedIn(b, a) ? true : j < i)) drop.add(i);
    });
  });
  return lines.filter((_, i) => !drop.has(i));
}

export function buildCv(profile: Profile, cvBody?: string, family: ArtFamily = "artes-visuales"): CvGroup[] {
  const titles = { ...CV_TITLES, ...vocabFor(family).cv };
  const groups = new Map<CvGroup["key"], CvItem[]>();
  const seen = new Set<string>();
  const add = (raw: string, forced?: CvGroup["key"]) => {
    const key = norm(raw).replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    const g = forced ?? classifyAchievement(raw);
    const list = groups.get(g) ?? [];
    list.push(toCvItem(raw, g));
    groups.set(g, list);
  };
  profile.education.forEach((e) => add(e, "education"));
  // Achievements and the CV section's bullets often say the same thing twice: keep each fact once.
  dedupeContained([...profile.achievements, ...bullets(cvBody)]).forEach((a) => add(a));
  return CV_ORDER.filter((k) => groups.get(k)?.length).map((k) => ({
    key: k,
    title: titles[k],
    items: [...groups.get(k)!].sort((a, b) => Number(b.year || 0) - Number(a.year || 0)),
  }));
}

// ---------------------------------------------------------------- contact

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_RE = /(https?:\/\/[^\s,;]+|(?:www\.)?[\w-]+\.(?:com|es|gal|org|net|art|eu|studio|io|cat|eus)(?:\/[^\s,;]*)?)/i;
const PHONE = /(\+?\d[\d\s]{7,}\d)/;

export function buildContact(profile: Profile, contactBody?: string): FactRow[] {
  const rows: FactRow[] = [];
  const has = (label: string) => rows.some((r) => r.label === label);
  const push = (r: FactRow) => {
    if (!rows.some((x) => x.value === r.value)) rows.push(r);
  };
  const consider = (raw: string) => {
    const s = raw.trim().replace(/^mailto:/, "");
    if (!s) return;
    const email = EMAIL.exec(s);
    if (email && !/^https?:/.test(s)) return push({ label: "Correo", value: email[0], href: `mailto:${email[0]}` });
    const ig = /instagram\.com\/([\w.]+)/i.exec(s) ?? /^@([\w.]+)$/.exec(s);
    if (ig) return push({ label: "Instagram", value: `@${ig[1]}`, href: `https://instagram.com/${ig[1]}` });
    const url = URL_RE.exec(s);
    if (url) {
      const href = url[1].startsWith("http") ? url[1] : `https://${url[1]}`;
      const value = url[1].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      const label = /behance|linkedin|vimeo|youtube|tiktok|facebook/.test(value) ? capitalize(value.split(".")[0]) : has("Web") ? "Enlace" : "Web";
      return push({ label, value, href });
    }
  };
  profile.links.forEach(consider);
  if (contactBody) {
    for (const line of contactBody.split(/\n|;|\s+·\s+/)) {
      for (const token of line.split(/\s+/)) if (EMAIL.test(token) || /instagram\.com|^@\w/.test(token) || URL_RE.test(token)) consider(token.replace(/[.,]$/, ""));
      const phone = PHONE.exec(line);
      if (phone && !has("Teléfono")) push({ label: "Teléfono", value: phone[1].trim(), href: `tel:${phone[1].replace(/\s/g, "")}` });
    }
  }
  const order = ["Correo", "Teléfono", "Web", "Instagram"];
  rows.sort((a, b) => (order.indexOf(a.label) + 1 || 9) - (order.indexOf(b.label) + 1 || 9));
  const place = [profile.city, profile.province && profile.province !== profile.city ? profile.province : undefined].filter(Boolean).join(", ");
  if (rows.length && place) rows.push({ label: profile.kind === "creator" ? "Estudio" : "Sede", value: place });
  return rows;
}

// ---------------------------------------------------------------- variant header

const PENDING = /(\[PENDIENTE:[^\]]*\])/;

/** "texto [PENDIENTE: x] más" -> [{text}, {text: "x", pending}, {text}] */
export function splitPending(para: string): { text: string; pending: boolean }[] {
  return para
    .split(PENDING)
    .filter(Boolean)
    .map((t) => (PENDING.test(t) ? { text: t.slice(1, -1).replace(/^PENDIENTE:\s*/, "").trim(), pending: true } : { text: t, pending: false }));
}

export function toVariantView(dossier: Dossier, call?: Call): VariantView | undefined {
  const v = dossier.variant;
  if (!v) return undefined;
  const crit = new Map((call?.criteria ?? []).map((c) => [c.id, c]));
  const label = (id: string) => {
    const c = crit.get(id);
    return c ? `${c.name} · ${c.maxPoints} ${c.maxPoints === 1 ? "pto" : "ptos"}` : undefined;
  };
  return {
    callId: v.callId,
    callName: call ? `${call.title.replace(/^\[FIXTURE\]\s*/, "")}, ${call.organizer}` : v.callId,
    callRef: call?.bdnsId ? `BDNS ${call.bdnsId}` : undefined,
    notes: v.notes,
    strategy: v.strategy,
    sections: (v.sections ?? []).map((s) => ({
      id: s.id,
      heading: s.heading,
      paras: paragraphs(s.body).map(splitPending),
      criteria: s.criteria.map(label).filter((x): x is string => !!x),
    })),
    questions: (v.questions ?? []).map((q) => ({ criterion: crit.get(q.criterionId)?.name, question: q.question })),
    formatChecks: v.formatChecks ?? [],
    omitted: v.omitted ?? [],
    unsupportedNumbers: v.unsupportedNumbers ?? [],
    generatedBy: v.generatedBy,
  };
}

/** True when the call variant rewrote the narrative sections (they replace statement/bio or activity/team). */
export const isAdapted = (view: { variant?: VariantView }) => (view.variant?.sections.length ?? 0) > 0;

// ---------------------------------------------------------------- main mappers

export interface ViewInput {
  profile: Profile;
  dossier: Dossier;
  /** Works already filtered and ordered as dossier.workIds. */
  works: Work[];
  call?: Call;
}

const ready = (has: boolean): SectionState => (has ? "ready" : "pending");

export function orderWorks(works: Work[], workIds: string[]): Work[] {
  const byId = new Map(works.map((w) => [w.id, w]));
  return workIds.map((id) => byId.get(id)).filter((w): w is Work => !!w);
}

export function toCreatorView({ profile, dossier, works, call }: ViewInput): CreatorView {
  const sec = (k: string) => sectionBody(dossier.sections, k);
  const statement = paragraphs(sec("statement") ?? profile.statement);
  const bio = paragraphs(sec("bio") ?? profile.bio);
  const family = familyOf(profile.disciplines);
  const series = groupSeries(works, { seriesBody: sec("series"), projectIdea: profile.projectIdea, worksTitle: vocabFor(family).works });
  const cv = buildCv(profile, sec("cv"), family);
  const contact = buildContact(profile, sec("contact"));
  const name = profile.displayName.trim();
  const tagline = firstSentence(statement[0] ?? "");
  const allWorks = series.flatMap((s) => s.works);
  return {
    kind: "creator",
    family,
    date: formatMonth(dossier.generatedAt),
    name,
    discipline: joinEs(profile.disciplines),
    city: profile.city ?? "",
    tagline,
    statement,
    bio,
    cover: allWorks[0],
    series,
    cv,
    contact,
    states: {
      cover: ready(!!name),
      statement: ready(statement.length > 0),
      bio: ready(bio.length > 0),
      series: ready(series.length > 0),
      cv: ready(cv.length > 0),
      contact: ready(contact.length > 0),
    },
    variant: toVariantView(dossier, call),
  };
}

const LEGAL_FORMS: Record<string, string> = {
  autonomo: "Autónomo/a",
  sl: "Sociedad limitada (S.L.)",
  sa: "Sociedad anónima (S.A.)",
  cooperativa: "Cooperativa",
  asociacion: "Asociación",
  otra: "Otra",
};

/** "- Nombre, rol: bio" | "- Nombre (rol). Bio" -> Person */
export function parsePerson(line: string): Person {
  const m = /^([^,(:–-]+?)\s*(?:[,(–-]\s*([^):.]+)\)?)?\s*[:.]?\s*(.*)$/.exec(line.trim());
  if (!m) return { name: line.trim(), role: "", bio: "" };
  return { name: m[1].trim(), role: capitalize((m[2] ?? "").trim()), bio: (m[3] ?? "").trim() };
}

export function toBusinessView({ profile, dossier, works, call }: ViewInput): BusinessView {
  const sec = (k: string) => sectionBody(dossier.sections, k);
  const activity = paragraphs(sec("activity") ?? [profile.bio, profile.statement].filter(Boolean).join("\n\n"));
  const teamBody = sec("team");
  const people = bullets(teamBody).map(parsePerson);
  const teamText = people.length ? paragraphs(teamBody?.split("\n").filter((l) => !/^\s*[-•]\s/.test(l)).join("\n")) : paragraphs(teamBody);
  const workViews = works.map((w, i) => toWorkView(w, i + 1));
  const projectsText = paragraphs(sec("projects"));
  const facts: FactRow[] = [];
  if (profile.annualRevenueEur) facts.push({ label: "Facturación anual", value: eur(profile.annualRevenueEur) });
  if (profile.employees !== undefined) facts.push({ label: "Plantilla", value: profile.employees === 1 ? "1 persona" : `${profile.employees} personas` });
  if (profile.foundedYear) facts.push({ label: "Fundación", value: String(profile.foundedYear) });
  if (profile.cnae) facts.push({ label: "CNAE", value: profile.cnae });
  if (profile.legalForm) facts.push({ label: "Forma jurídica", value: LEGAL_FORMS[profile.legalForm] });
  if (profile.sector) facts.push({ label: "Sector", value: capitalize(profile.sector) });
  const figuresBody = paragraphs(sec("figures"));
  const location: FactRow[] = [];
  const locBody = paragraphs(sec("location"));
  if (profile.city) location.push({ label: "Localidad", value: profile.city });
  if (profile.province && profile.province !== profile.city) location.push({ label: "Provincia", value: profile.province });
  if (profile.region) location.push({ label: "Comunidad", value: profile.region });
  if (locBody.length) location.push({ label: "Ámbito", value: locBody.join(" ") });
  const contact = buildContact(profile, sec("contact"));
  const name = profile.displayName.trim();
  const tagline = firstSentence(profile.statement || activity[0] || "");
  return {
    kind: "business",
    date: formatMonth(dossier.generatedAt),
    name,
    activityShort: capitalize(profile.sector ?? ""),
    city: [profile.city, profile.province && profile.province !== profile.city ? profile.province : undefined].filter(Boolean).join(", "),
    tagline,
    activity,
    plan: { idea: profile.projectIdea?.trim() ?? "", needs: profile.fundingNeeds.map(capitalize) },
    team: { size: profile.employees, people, text: teamText },
    projects: { works: workViews, milestones: profile.achievements, text: projectsText },
    facts: figuresBody.length ? [...facts, ...figuresBody.map((v) => ({ label: "Nota", value: v }))] : facts,
    location,
    cover: workViews[0],
    contact,
    states: {
      cover: ready(!!name),
      activity: ready(activity.length > 0 || !!profile.projectIdea),
      team: ready(people.length > 0 || teamText.length > 0 || profile.employees !== undefined),
      projects: ready(workViews.length > 0 || profile.achievements.length > 0 || projectsText.length > 0),
      figures: ready(facts.length > 0 || location.length > 0),
      contact: ready(contact.length > 0),
    },
    variant: toVariantView(dossier, call),
  };
}

export function toDossierView(input: ViewInput): DossierView {
  return input.profile.kind === "business" ? toBusinessView(input) : toCreatorView(input);
}

/** True when there is nothing to show yet (blank profile at the start of the demo). */
export function isBlank(view: DossierView): boolean {
  return Object.values(view.states).every((s) => s === "pending");
}
