// B3 "Historial de la convocatoria": links past editions of each BDNS call and aggregates their awards.
// Usage: npm run calls:history [-- <calls.json>]   (default <callsDir>/calls.json)
// Reads <callsDir>/resolutions.json (hand-curated from published resolutions) when present.
// Writes <callsDir>/history.json (aggregates, no names) and <callsDir>/awards.json (PastAward, entity winners only).
// Never breaks the app: on a BDNS error for one call it keeps that call's previous history and goes on.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { PastAward } from "@/contracts/domain";
import { serverEnv } from "@/contracts/env";
import { BdnsAward, type CallHistory, type EditionInput, Resolution, isSameSeries, searchTerms, summarizeHistory, toPastAwards } from "@/features/history/history";
import { normalizeBdnsRecord } from "@/features/normalize";

const BDNS = "https://www.infosubvenciones.es/bdnstrans/api";
const MAX_PAGES = 4; // per search term, 50 results each, newest first
const DELAY_MS = 300; // be gentle: BDNS rate-limits bursts

const dir = path.resolve(process.cwd(), serverEnv().callsDir);
const callsPath = process.argv[2] ?? path.join(dir, "calls.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const publicUrl = (id: string) => `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${id}`;

async function getJson(p: string, attempt = 0): Promise<unknown> {
  await sleep(DELAY_MS);
  const res = await fetch(`${BDNS}${p}`, { headers: { accept: "application/json" } });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await sleep(2000 * 2 ** attempt);
    return getJson(p, attempt + 1);
  }
  if (!res.ok) throw new Error(`BDNS ${res.status} on ${p}`);
  return res.json();
}

const SearchItem = z.object({ numeroConvocatoria: z.string(), descripcion: z.string(), fechaRecepcion: z.string(), nivel2: z.string().nullish(), nivel3: z.string().nullish() });
const page = <T extends z.ZodTypeAny>(item: T) => z.object({ content: z.array(item), totalPages: z.number() });
const organizerOf = (n: { nivel2?: string | null; nivel3?: string | null }) => n.nivel3 ?? n.nivel2 ?? ""; // same rule as normalizeBdnsRecord

async function search(term: string) {
  const out: z.infer<typeof SearchItem>[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const q = new URLSearchParams({ descripcion: term, page: String(p), pageSize: "50", vpd: "GE" });
    const r = page(SearchItem).parse(await getJson(`/convocatorias/busqueda?${q}`));
    out.push(...r.content);
    if (p + 1 >= r.totalPages) break;
  }
  return out;
}

async function awards(bdnsId: string): Promise<BdnsAward[]> {
  const out: BdnsAward[] = [];
  for (let p = 0; ; p++) {
    const q = new URLSearchParams({ numeroConvocatoria: bdnsId, page: String(p), pageSize: "50", vpd: "GE" });
    const r = page(BdnsAward).parse(await getJson(`/concesiones/busqueda?${q}`));
    out.push(...r.content);
    if (p + 1 >= r.totalPages || !r.content.length) break;
  }
  return out;
}

async function readJson<T>(f: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(f, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

const calls = await readJson<{ id: string; bdnsId?: string; codigoBDNS?: string; disciplines?: string[] }[]>(callsPath, []);
const resolutions = z.array(Resolution).parse(await readJson(path.join(dir, "resolutions.json"), []));
const previous = await readJson<Record<string, CallHistory>>(path.join(dir, "history.json"), {});
const builtAt = new Date().toISOString().slice(0, 10);
const histories: Record<string, CallHistory> = {};
const pastAwards: PastAward[] = [];

for (const call of calls) {
  const bdnsId = call.bdnsId ?? call.codigoBDNS; // codigoBDNS: pre-contract datasets
  if (!bdnsId) continue;
  try {
    const raw = await getJson(`/convocatorias?numConv=${encodeURIComponent(bdnsId)}&vpd=GE`);
    const { value: cur } = normalizeBdnsRecord(raw);
    const rec = z.object({ fechaRecepcion: z.string() }).passthrough().parse(raw);
    const current = { title: cur.title, organizer: cur.organizer ?? "" };

    const found = new Map<string, z.infer<typeof SearchItem>>();
    for (const t of searchTerms(cur.title)) for (const it of await search(t)) found.set(it.numeroConvocatoria, it);
    const past = [...found.values()].filter(
      (it) => it.numeroConvocatoria !== bdnsId && it.fechaRecepcion < rec.fechaRecepcion && isSameSeries(current, { title: it.descripcion, organizer: organizerOf(it) }),
    );

    const editions: EditionInput[] = [];
    for (const it of past) editions.push({ bdnsId: it.numeroConvocatoria, date: it.fechaRecepcion, title: it.descripcion, awards: await awards(it.numeroConvocatoria) });

    histories[call.id] = summarizeHistory({ callId: call.id, bdnsId, editions, resolutions, builtAt });
    pastAwards.push(...toPastAwards({ callId: call.id, organizer: current.organizer, editions, discipline: call.disciplines?.[0], sourceUrlFor: publicUrl }));
    console.log(`${call.id}  ${histories[call.id].evidence}`);
  } catch (e) {
    if (previous[call.id]) histories[call.id] = previous[call.id];
    console.warn(`${call.id}  BDNS error, kept previous history: ${(e as Error).message}`);
  }
}

await writeFile(path.join(dir, "history.json"), JSON.stringify(histories, null, 2) + "\n");
await writeFile(path.join(dir, "awards.json"), JSON.stringify(pastAwards, null, 2) + "\n");
console.log(`\n${Object.keys(histories).length} histories, ${pastAwards.length} past awards → ${dir}`);
