/**
 * Free layout orchestration (server-only). The model composes the artist's dossier page by page: a batch of N
 * proposals (each with its own art direction, in parallel), the artist picks one and keeps asking for changes in
 * plain language (history + undo). There are no templates in this path: when no proposal survives (no key, model
 * error, every layout rejected by the guard or the render check) the artist gets the template design the product
 * always had, with a plain Spanish notice. The template flow never changes.
 *
 * Generating takes a minute or two, so POSTs start a background job (one per profile, in memory: Fly runs a single
 * machine) and the screen polls the state until it is idle.
 */
import { TooManyRequestsError } from "@/contracts";
import { getDossier, getProfile, getTranscript, listWorks, nowIso } from "@/server/store";
import { dossierLookRequests } from "@/features/onboarding/interview";
import { isVisualFamily, onboardingFamily } from "@/features/onboarding/family";
import { AiError } from "@/server/ai/llm";
import { buildCatalog, type Catalog } from "./catalog";
import { designLayout, layoutCount, layoutModel, planDirections, type Direction } from "./agent";
import { ensureLayoutFonts } from "./fonts-server";
import { missingContent } from "./completeness";
import { LayoutError, prepareLayout, type PrepareResult } from "./prepare";
import { renderPreparedLayoutPdf } from "./pdf-render";
import { emptyEntry, readAll, saveEntry, type LayoutEntry } from "./store";
import type { FreeLayout, PreparedLayout } from "./schema";
import { buildDossier, dossierView } from "../service";
import { hasSavedDesign } from "../designs";
import { paletteFromPixels } from "../style";
import { orderWorks } from "../model";

/** Change requests per profile per day (each is one model call). */
export const DAILY_LAYOUT_REQUESTS = 30;
/** Batches of proposals per profile per day (each is N + 1 model calls). */
export const DAILY_LAYOUT_BATCHES = 6;
export const HISTORY_LIMIT = 20;
const JOB_STALE_MS = 12 * 60_000;

export const TEMPLATE_NOTICE = "No he podido maquetarlo a mano esta vez, así que te enseño el diseño de plantilla de siempre. Prueba otra vez en un rato o pídelo de otra manera.";

// ---------------------------------------------------------------- catalog, thumbnails and colours

interface WorkLook {
  ratio?: number;
  colors?: string[];
  thumb?: { mediaType: "image/jpeg"; base64: string };
}

/** Ratio as shown (after the artist's crop), dominant colours and a small preview for the model. Never throws. */
async function lookOf(imageUrl: string, crop: { x: number; y: number; width: number; height: number } | undefined, wantThumb: boolean): Promise<WorkLook> {
  try {
    const { readImageBytes } = await import("../pdf/images");
    const bytes = readImageBytes(imageUrl);
    if (!bytes) return {};
    const sharp = (await import("sharp")).default;
    const m = await sharp(bytes).rotate().metadata();
    const rot = (m.orientation ?? 1) >= 5;
    const W = rot ? m.height : m.width;
    const H = rot ? m.width : m.height;
    const out: WorkLook = {};
    if (W && H) out.ratio = crop ? (crop.width * W) / (crop.height * H) : W / H;
    try {
      const raw = await sharp(bytes).rotate().resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer();
      const colors = paletteFromPixels(raw, 4);
      if (colors.length) out.colors = colors;
    } catch {
      // colours are a hint, not a requirement
    }
    if (wantThumb) {
      try {
        const jpg = await sharp(bytes).rotate().resize(448, 448, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 68 }).toBuffer();
        out.thumb = { mediaType: "image/jpeg", base64: jpg.toString("base64") };
      } catch {
        // the model then designs from the numbers and colours alone
      }
    }
    return out;
  } catch {
    return {};
  }
}

const MAX_THUMBS = 8;

async function loadCatalog(profileId: string, wantThumbs: boolean): Promise<{ catalog: Catalog; thumbs: NonNullable<WorkLook["thumb"]>[] }> {
  const profile = getProfile(profileId);
  const dossier = await buildDossier({ profileId });
  const works = orderWorks(listWorks(profile.id), dossier.workIds);
  const view = dossierView({ dossier, profile, works });
  const ratios: Record<string, number> = {};
  const colors: Record<string, string[]> = {};
  const thumbs: NonNullable<WorkLook["thumb"]>[] = [];
  const shown = works.filter((w) => w.confirmed !== false);
  const looks = await Promise.all(shown.map((w, i) => lookOf(w.imageUrl, w.crop, wantThumbs && i < MAX_THUMBS)));
  shown.forEach((w, i) => {
    const l = looks[i];
    if (l.ratio) ratios[w.id] = l.ratio;
    if (l.colors) colors[w.id] = l.colors;
    if (l.thumb) thumbs.push(l.thumb);
  });
  const said = getTranscript(profile.id).map((t) => t.text);
  return { catalog: buildCatalog(view, { said, ratios, colors }), thumbs };
}

/** What this artist may show: their own sections and confirmed works, never anything else. */
export async function catalogFor(profileId: string): Promise<Catalog> {
  return (await loadCatalog(profileId, false)).catalog;
}

// ---------------------------------------------------------------- state

export interface ProposalView {
  id: string;
  name: string;
  direction: string;
  rationale: string;
  prepared: PreparedLayout;
  adjustments: string[];
}
export interface BatchMetrics {
  kind: "batch" | "change";
  model: string;
  layouts: number; // proposals requested
  kept: number; // proposals that survived guard and render
  calls: number;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}
export interface LayoutOutcome {
  ok: boolean;
  notice?: string;
  adjustments: string[];
  metrics?: BatchMetrics;
}
export interface LayoutState {
  enabled: boolean;
  /** "libre" when the free layout is what the screen and the PDF show; "plantilla" otherwise. */
  mode: "libre" | "plantilla";
  prepared?: PreparedLayout;
  name?: string;
  rationale?: string;
  adjustments: string[];
  notice?: string;
  canUndo: boolean;
  history: string[];
  proposals: ProposalView[];
  /** A job (batch of proposals or one change) is running: poll until false. */
  busy: boolean;
  busyKind?: "batch" | "change";
  /** What the last finished job did (until the next one starts). */
  outcome?: LayoutOutcome;
  /** Batches left today for this profile. */
  batchesLeft: number;
  count: number; // proposals per batch
  /** How the artist imagines their dossier (onboarding answer), what every batch starts from. */
  wish?: string;
}

const today = () => nowIso().slice(0, 10);

/** The saved entry; a profile that never had one starts with the free layout on (the template stays until a proposal is chosen), unless it already has a saved template design. */
function loadEntry(profileId: string): LayoutEntry {
  const saved = readAll()[profileId];
  if (saved) return saved;
  const entry = emptyEntry();
  if (process.env.MECENA_FREE_LAYOUT_DEFAULT !== "0" && !hasSavedDesign(profileId)) {
    entry.enabled = true;
    saveEntry(profileId, entry); // sticky: opening the template design later does not flip it
  }
  return entry;
}

async function safePrepare(layout: FreeLayout, catalog: Catalog): Promise<{ ok: PrepareResult } | { error: string }> {
  try {
    await ensureLayoutFonts(layout);
    return { ok: prepareLayout(layout, catalog) };
  } catch (e) {
    console.error("[dossier] free layout rejected by the guard:", e instanceof Error ? e.message : e);
    return { error: e instanceof LayoutError ? e.message : "No he podido pintarla." };
  }
}

interface Job {
  kind: "batch" | "change";
  startedAt: number;
  promise: Promise<void>;
  outcome?: LayoutOutcome;
}
const g = ((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("mecena.layout-jobs")] ??= new Map<string, Job>()) as Map<string, Job>;
const running = (profileId: string): Job | undefined => {
  const j = g.get(profileId);
  return j && !j.outcome && Date.now() - j.startedAt < JOB_STALE_MS ? j : undefined;
};

/** True when the artist chose a free layout: what decides between the free PDF and the template one. */
export function hasFreeLayout(profileId: string): boolean {
  const e = loadEntry(profileId);
  return e.enabled && !!e.current;
}

/** Resolves when the profile's running job (if any) has finished. For tests and the PDF route. */
export async function layoutIdle(profileId: string): Promise<void> {
  await running(profileId)?.promise.catch(() => undefined);
}

/** The state the screen needs; also what the PDF decides on. Never throws. */
export async function layoutState(input: { profileId: string; callId?: string }): Promise<LayoutState> {
  const entry = loadEntry(input.profileId);
  const job = g.get(input.profileId);
  const live = running(input.profileId);
  const wish = wishOf(input.profileId, entry);
  const base: LayoutState = {
    enabled: entry.enabled,
    mode: "plantilla",
    adjustments: [],
    canUndo: !!entry.current,
    history: entry.history.map((h) => h.request),
    proposals: [],
    busy: !!live,
    busyKind: live?.kind,
    outcome: job?.outcome,
    batchesLeft: Math.max(0, DAILY_LAYOUT_BATCHES - (entry.batchDay === today() ? entry.batches : 0)),
    count: layoutCount(),
    ...(wish ? { wish } : {}),
  };
  if (!entry.enabled) return base;
  if (input.callId) return { ...base, notice: "La maquetación libre es del dossier general: la versión para esta convocatoria usa el diseño de plantilla." };
  try {
    const catalog = await catalogFor(input.profileId);
    const proposals: ProposalView[] = [];
    for (const p of entry.proposals) {
      const r = await safePrepare(p.layout, catalog);
      if ("ok" in r) proposals.push({ id: p.id, name: p.layout.name, direction: p.direction, rationale: p.layout.rationale, prepared: r.ok.layout, adjustments: r.ok.adjustments });
    }
    const withProposals = { ...base, proposals };
    if (!entry.current) return withProposals;
    const r = await safePrepare(entry.current, catalog);
    if ("error" in r) return { ...withProposals, notice: TEMPLATE_NOTICE };
    return { ...withProposals, mode: "libre", prepared: r.ok.layout, name: entry.current.name, rationale: entry.current.rationale, adjustments: r.ok.adjustments };
  } catch (e) {
    console.error("[dossier] free layout state failed", e);
    return { ...base, notice: TEMPLATE_NOTICE };
  }
}

export async function setFreeLayout(input: { profileId: string; enabled: boolean }): Promise<LayoutState> {
  const entry = loadEntry(input.profileId);
  entry.enabled = input.enabled;
  saveEntry(input.profileId, entry);
  return layoutState({ profileId: input.profileId });
}

// ---------------------------------------------------------------- the artist's wish and the automatic first batch

const WISH_MAX = 600;

/** How the artist imagines their dossier: the answer to the onboarding question, or what they said about it in the interview. */
export function wishOf(profileId: string, entry: LayoutEntry = loadEntry(profileId)): string | undefined {
  if (entry.wish?.trim()) return entry.wish.trim();
  try {
    const said = dossierLookRequests(getTranscript(profileId)).map((s) => s.text);
    return said.length ? said.join(" ").slice(-WISH_MAX) : undefined;
  } catch {
    return undefined;
  }
}

/** Ensures the profile has its free-layout entry (new profiles start on the free layout). Call before anything saves a template design. */
export function ensureLayoutEntry(profileId: string): void {
  loadEntry(profileId);
}

/** Saves (adds to) the artist's answer to "¿cómo te imaginas tu dossier?". `reset` starts it over (a new onboarding). */
export function saveLayoutWish(input: { profileId: string; text: string; reset?: boolean }): void {
  const text = input.text.trim();
  const entry = loadEntry(input.profileId);
  if (input.reset) entry.wish = undefined;
  if (!text) return saveEntry(input.profileId, entry);
  const joined = entry.wish && !entry.wish.includes(text) ? `${entry.wish} ${text}` : (entry.wish ?? text);
  entry.wish = joined.slice(-WISH_MAX);
  saveEntry(input.profileId, entry);
}

/** What an automatic batch is made from: the confirmed works, the sections there are and the wish. A new key means new proposals. */
function autoKeyOf(profileId: string, entry: LayoutEntry): { key: string; works: number; hasContent: boolean } {
  const works = listWorks(profileId)
    .filter((w) => w.confirmed !== false)
    .map((w) => w.id)
    .sort();
  const sections = (getDossier(profileId)?.sections ?? [])
    .filter((x) => x.body.trim())
    .map((x) => x.key)
    .sort();
  const statement = !!getProfile(profileId).statement?.trim();
  return { key: JSON.stringify([works, sections, statement, wishOf(profileId, entry) ?? ""]), works: works.length, hasContent: works.length > 0 || sections.length > 0 || statement };
}

/**
 * The free layout is the first design: once the artist has told us enough (end of the onboarding, or opening the
 * dossier), the first batch of proposals starts by itself, from their wish. Never twice for the same content, never
 * once a proposal is chosen, never over a running job or the day's budget. `charge` runs right before a batch
 * starts (per-user AI limit); if it throws, nothing starts. Returns the state and whether a batch started.
 */
export async function autoProposals(input: { profileId: string; from: "onboarding" | "dossier"; charge?: () => void }): Promise<LayoutState & { started: boolean }> {
  const skip = async () => ({ ...(await layoutState({ profileId: input.profileId })), started: false });
  try {
    if (running(input.profileId)) return skip();
    const profile = getProfile(input.profileId);
    if (profile.kind !== "creator") return skip();
    const entry = loadEntry(input.profileId);
    if (!entry.enabled || entry.current) return skip();
    const { key, works, hasContent } = autoKeyOf(input.profileId, entry);
    if (!hasContent || entry.autoKey === key) return skip();
    // A visual artist finishing the interview is about to photograph their work: wait for it (the dossier screen starts it).
    if (input.from === "onboarding" && works === 0 && isVisualFamily(onboardingFamily(profile.disciplines))) return skip();
    // Proposals asked for by hand before: they stay until the content changes.
    if (entry.proposals.length && !entry.autoKey) {
      entry.autoKey = key;
      saveEntry(input.profileId, entry);
      return skip();
    }
    input.charge?.();
    chargeDay(entry, "batch");
    entry.autoKey = key;
    saveEntry(input.profileId, entry);
    start(input.profileId, "batch", () => runBatch(input.profileId));
    return { ...(await layoutState({ profileId: input.profileId })), started: true };
  } catch (e) {
    if (!(e instanceof TooManyRequestsError)) console.error("[dossier] automatic layout batch not started", e);
    return skip();
  }
}

// ---------------------------------------------------------------- jobs

class Usage {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  readonly onUsage = (u: { inputTokens: number; outputTokens: number }) => {
    this.calls++;
    this.inputTokens += u.inputTokens;
    this.outputTokens += u.outputTokens;
  };
}

function start(profileId: string, kind: Job["kind"], run: () => Promise<LayoutOutcome>): void {
  const job: Job = { kind, startedAt: Date.now(), promise: Promise.resolve() };
  job.promise = run()
    .catch((e): LayoutOutcome => {
      console.error("[dossier] layout job failed", e);
      return { ok: false, notice: TEMPLATE_NOTICE, adjustments: [] };
    })
    .then((outcome) => {
      job.outcome = outcome;
    });
  g.set(profileId, job);
}

/** Layout budget of this profile today; throws a Spanish 429 when it is used up. */
function chargeDay(entry: LayoutEntry, what: "batch" | "change") {
  const day = today();
  if (what === "batch") {
    if (entry.batchDay !== day) (entry.batchDay = day), (entry.batches = 0);
    if (entry.batches >= DAILY_LAYOUT_BATCHES) throw new TooManyRequestsError("Hoy has pedido muchas tandas de propuestas. Quédate con una de las que tienes o sigue mañana.");
    entry.batches++;
  } else {
    if (entry.day !== day) (entry.day = day), (entry.requests = 0);
    if (entry.requests >= DAILY_LAYOUT_REQUESTS) throw new TooManyRequestsError("Hoy has probado muchas maquetaciones. Sigue mañana, o deshaz y quédate con la que más te guste.");
    entry.requests++;
  }
}

const id = () => Math.random().toString(36).slice(2, 10);

/** A proposal that passes the guard and can really be painted; at most two model calls (the second hears what the guard rejected). */
async function composeOne(input: { catalog: Catalog; thumbs: NonNullable<WorkLook["thumb"]>[]; wish?: string; direction: Direction; others: string[]; avoid: string[]; usage: Usage; request?: string; current?: FreeLayout; history?: string[] }): Promise<{ layout: FreeLayout; adjustments: string[] } | undefined> {
  let problem: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const layout = await designLayout({
        request: input.request ?? "",
        wish: input.wish,
        current: input.current,
        catalog: input.catalog,
        history: input.history ?? [],
        direction: input.direction,
        others: input.others,
        avoid: input.avoid,
        thumbs: input.thumbs,
        problem,
        onUsage: input.usage.onUsage,
      });
      const missing = missingContent(layout, input.catalog, { request: input.request });
      if (missing) {
        console.error("[dossier] free layout rejected as incomplete:", missing);
        problem = missing;
        continue;
      }
      const r = await safePrepare(layout, input.catalog);
      if ("error" in r) {
        problem = r.error;
        continue;
      }
      try {
        await renderPreparedLayoutPdf(r.ok.layout, input.catalog.works);
      } catch (e) {
        console.error("[dossier] proposal discarded: it does not render", e instanceof Error ? e.message : e);
        problem = "No se pudo pintar: simplifica la página que falla.";
        continue;
      }
      return { layout, adjustments: r.ok.adjustments };
    } catch (e) {
      console.error("[dossier] layout agent failed", e instanceof Error ? e.message : e);
      if (e instanceof AiError && (e.reason === "budget" || e.reason === "api" || e.reason === "refusal")) return undefined;
      problem = "La respuesta no tenía el formato esperado.";
    }
  }
  return undefined;
}

/** Starts a batch of N proposals (each with its own art direction). Returns the state at once; poll `busy`. */
export async function requestProposals(input: { profileId: string }): Promise<LayoutState> {
  if (running(input.profileId)) return layoutState(input);
  const entry = loadEntry(input.profileId);
  chargeDay(entry, "batch");
  entry.enabled = true;
  saveEntry(input.profileId, entry);
  start(input.profileId, "batch", () => runBatch(input.profileId));
  return layoutState(input);
}

async function runBatch(profileId: string): Promise<LayoutOutcome> {
  const t0 = Date.now();
  const usage = new Usage();
  const count = layoutCount();
  const { catalog, thumbs } = await loadCatalog(profileId, true);
  const before = loadEntry(profileId);
  const metrics = (kept: number): BatchMetrics => ({ kind: "batch", model: layoutModel(), layouts: count, kept, calls: usage.calls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ms: Date.now() - t0 });
  let directions: Direction[];
  try {
    directions = await planDirections({ request: "", wish: wishOf(profileId, before), history: [], catalog, thumbs, count, avoid: before.shown, onUsage: usage.onUsage });
  } catch (e) {
    console.error("[dossier] art direction failed", e instanceof Error ? e.message : e);
    return { ok: false, notice: TEMPLATE_NOTICE, adjustments: [], metrics: metrics(0) };
  }
  const names = directions.map((d) => d.name);
  const wish = wishOf(profileId, before);
  const made = await Promise.all(directions.map((d, i) => composeOne({ catalog, thumbs, wish, direction: d, others: names.filter((_, k) => k !== i), avoid: before.shown, usage })));
  const kept = directions.flatMap((d, i) => (made[i] ? [{ id: id(), layout: made[i]!.layout, direction: d.brief, at: nowIso() }] : []));
  const m = metrics(kept.length);
  console.info(`[dossier] layout batch: ${kept.length}/${count} kept, ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ${m.ms} ms, model ${m.model}`);
  if (!kept.length) return { ok: false, notice: TEMPLATE_NOTICE, adjustments: [], metrics: m };
  const entry = loadEntry(profileId);
  entry.enabled = true;
  entry.proposals = kept;
  entry.shown = [...entry.shown, ...directions.map((d) => d.name)].slice(-12);
  saveEntry(profileId, entry);
  const dropped = count - kept.length;
  return { ok: true, notice: dropped > 0 ? `Te enseño ${kept.length} de ${count}: ${dropped === 1 ? "la otra no ha pasado" : "las otras no han pasado"} las comprobaciones de maquetación y la he descartado.` : undefined, adjustments: [], metrics: m };
}

/** The artist picks one of the proposals: it becomes the layout in force (history starts there). */
export async function chooseProposal(input: { profileId: string; proposalId: string }): Promise<LayoutState> {
  if (running(input.profileId)) return layoutState(input);
  const entry = loadEntry(input.profileId);
  const p = entry.proposals.find((x) => x.id === input.proposalId);
  if (!p) return { ...(await layoutState(input)), notice: "Esa propuesta ya no está. Elige otra de las que ves." };
  entry.enabled = true;
  entry.current = p.layout;
  entry.history = [{ request: `Propuesta elegida: ${p.layout.name}`, layout: p.layout, at: nowIso() }];
  saveEntry(input.profileId, entry);
  g.delete(input.profileId);
  return layoutState(input);
}

/** Starts one change of the layout in force, in plain language. The previous layout stays if it fails. */
export async function requestChange(input: { profileId: string; request: string }): Promise<LayoutState> {
  if (running(input.profileId)) return layoutState(input);
  const entry = loadEntry(input.profileId);
  if (!entry.current) return { ...(await layoutState(input)), notice: "Primero elige una de las propuestas y luego dime qué quieres cambiar." };
  chargeDay(entry, "change");
  entry.enabled = true;
  saveEntry(input.profileId, entry);
  start(input.profileId, "change", () => runChange(input.profileId, input.request));
  return layoutState(input);
}

async function runChange(profileId: string, request: string): Promise<LayoutOutcome> {
  const t0 = Date.now();
  const usage = new Usage();
  const { catalog, thumbs } = await loadCatalog(profileId, true);
  const entry = loadEntry(profileId);
  const metrics = (kept: number): BatchMetrics => ({ kind: "change", model: layoutModel(), layouts: 1, kept, calls: usage.calls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ms: Date.now() - t0 });
  const made = await composeOne({ catalog, thumbs, direction: { name: entry.current?.name ?? "", brief: "Mantén la dirección de arte de la maquetación actual y aplica solo el cambio pedido." }, others: [], avoid: [], usage, request, current: entry.current, history: entry.history.map((h) => h.request) });
  const m = metrics(made ? 1 : 0);
  console.info(`[dossier] layout change: ${made ? "ok" : "failed"}, ${usage.calls} calls, ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ${m.ms} ms`);
  if (!made) return { ok: false, notice: "No he podido hacer ese cambio y dejo la maquetación como estaba. Prueba a pedirlo de otra manera.", adjustments: [], metrics: m };
  const latest = loadEntry(profileId);
  latest.enabled = true;
  latest.current = made.layout;
  latest.history = [...latest.history, { request, layout: made.layout, at: nowIso() }].slice(-HISTORY_LIMIT);
  saveEntry(profileId, latest);
  return { ok: true, adjustments: made.adjustments, metrics: m };
}

export async function undoLayout(input: { profileId: string }): Promise<LayoutState> {
  if (running(input.profileId)) return layoutState(input);
  const entry = loadEntry(input.profileId);
  if (entry.history.length > 1) {
    entry.history = entry.history.slice(0, -1);
    entry.current = entry.history[entry.history.length - 1].layout;
  } else {
    entry.history = [];
    entry.current = undefined; // back to the proposals (or the template if there are none)
  }
  saveEntry(input.profileId, entry);
  g.delete(input.profileId);
  return layoutState(input);
}

export { emptyEntry };
