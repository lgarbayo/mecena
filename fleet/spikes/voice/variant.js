#!/usr/bin/env node
// Call-specific dossier variants ("variante por convocatoria").
// Takes the base profile + dossier built live from voice (fixtures/base-*.json, exported from a
// live run), scores the fit of each profile with each real call in src/calls.js, then writes a
// variant of the dossier for every eligible (profile, call) pair and checks it:
//   - every criterion clamped to its max, total estimated score per call
//   - numbers in the variant that do not appear in the profile / base dossier / call (invention guard)
//   - [PENDIENTE: …] placeholders left for the user
//
//   npm run variant                       all profiles x all calls
//   node variant.js --scenario painter    one profile
//   node variant.js --mock                deterministic mock even with a key
//   VARIANT_MODEL=claude-opus-5-5 npm run variant

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CALLS } from "./src/calls.js";
import { createClaudeLLM, loadApiKey, MODELS } from "./src/llm.js";
import { mockFitVariant } from "./src/mock.js";
import { normalize } from "./src/profile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: { scenario: { type: "string" }, call: { type: "string" }, mock: { type: "boolean", default: false } },
});

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c(2), bold = c(1), green = c(32), yellow = c(33), red = c(31), cyan = c(36);

const keyInfo = args.mock ? null : loadApiKey();
const live = Boolean(keyInfo);
const llm = live ? createClaudeLLM(keyInfo.key) : null;

console.log(bold("\nMecena · variante del dossier por convocatoria\n"));
if (live) {
  console.log(green("LIVE: Claude API"));
  console.log(dim(`models: fit=${MODELS.fit} variant=${MODELS.variant}`));
} else {
  console.log(yellow(bold("MOCK MODE: no ANTHROPIC_API_KEY (or --mock). Fit and variants are placeholders, latencies are 0.")));
}

const profiles = ["painter", "illustrator", "business"]
  .filter((id) => !args.scenario || id === args.scenario)
  .map((id) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", `base-${id}.json`), "utf8")));
const calls = CALLS.filter((x) => !args.call || x.id === args.call);
const short = (call) => call.id.split("-").slice(0, 2).join("-");

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** Clamp estimates to [0, max] and add up; non-competitive calls have no score. */
function scoreFit(fit, call) {
  const byId = Object.fromEntries(call.criteria.map((k) => [k.id, k]));
  let total = 0;
  for (const k of fit.criteria) {
    const max = byId[k.criterion_id]?.max ?? 0;
    k.estimate = Math.max(0, Math.min(max, Number(k.estimate) || 0));
    total += k.estimate;
  }
  const status = (s) => fit.eligibility.filter((e) => e.status === s).length;
  return { total: Math.round(total * 10) / 10, max: call.max_points, cumple: status("cumple"), sinDatos: status("sin_datos"), noCumple: status("no_cumple") };
}

const digits = (s) => s.replace(/[.,\s]/g, "");
/** Numbers in the variant text that appear nowhere in what the user said, the base dossier or the call. */
function unsupportedNumbers(variant, base, call) {
  const haystack = digits(normalize(JSON.stringify(base.profile) + JSON.stringify(base.dossier) + JSON.stringify(call)));
  const out = new Set();
  for (const s of variant.sections) {
    const text = s.body.replace(/\[PENDIENTE:[^\]]*\]/g, "");
    for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
      const n = digits(m[0]);
      if (n.length && !haystack.includes(n)) out.add(m[0]);
    }
  }
  return [...out];
}
const placeholders = (variant) => variant.sections.flatMap((s) => [...s.body.matchAll(/\[PENDIENTE:([^\]]*)\]/g)].map((m) => m[1].trim()));
const words = (variant) => variant.sections.reduce((n, s) => n + s.body.split(/\s+/).filter(Boolean).length, 0);

// ---------------------------------------------------------------------------
// 1. Fit: every profile x every call, in parallel
// ---------------------------------------------------------------------------

const t0 = performance.now();
const pairs = profiles.flatMap((base) => calls.map((call) => ({ base, call })));
console.log(dim(`\n1) encaje: ${pairs.length} pares perfil × convocatoria en paralelo…`));
await Promise.all(
  pairs.map(async (p) => {
    const r = live ? await llm.fit({ profile: p.base.profile, call: p.call }) : await mockFitVariant.fit({ profile: p.base.profile, call: p.call, mode: p.base.mode });
    p.fit = r.fit;
    p.fitMs = r.latencyMs;
    p.fitUsage = r.usage;
    p.score = scoreFit(r.fit, p.call);
  }),
);

const fitColor = { alto: green, medio: yellow, bajo: dim, no_elegible: red };
console.log(bold("\nEncaje (estimación de un tribunal estricto con lo que el usuario ha contado):"));
console.table(
  pairs.map((p) => ({
    perfil: p.base.id,
    convocatoria: short(p.call),
    encaje: p.fit.fit,
    puntos: p.call.max_points ? `${p.score.total}/${p.call.max_points}${p.call.min_points ? ` (mín ${p.call.min_points})` : ""}` : "no competitiva",
    requisitos: `${p.score.cumple}✓ ${p.score.sinDatos}? ${p.score.noCumple}✗`,
    ms: p.fitMs,
  })),
);
for (const p of pairs.filter((x) => x.fit.fit !== "no_elegible")) {
  console.log(`\n${bold(p.base.id)} × ${cyan(p.call.name)}  ${fitColor[p.fit.fit](p.fit.fit)}`);
  for (const w of p.fit.why_fit) console.log(green(`  + ${w}`));
  for (const k of p.fit.criteria) {
    const spec = p.call.criteria.find((x) => x.id === k.criterion_id);
    console.log(`  ${k.criterion_id.padEnd(4)} ${String(k.estimate).padStart(4)}/${String(spec?.max ?? "?").padEnd(3)} ${dim(spec?.label ?? "")}${k.gap ? yellow(`  → ${k.gap}`) : ""}`);
  }
  for (const e of p.fit.eligibility.filter((x) => x.status !== "cumple")) console.log(`  ${e.status === "no_cumple" ? red("✗") : yellow("?")} ${e.requirement_id}: ${e.action}`);
  for (const q of p.fit.questions) console.log(cyan(`  ¿ ${q}`));
}

// ---------------------------------------------------------------------------
// 2. Variants for every eligible pair, in parallel
// ---------------------------------------------------------------------------

const eligible = pairs.filter((p) => p.fit.fit !== "no_elegible");
console.log(dim(`\n2) variantes: ${eligible.length} en paralelo (${MODELS.variant})…`));
await Promise.all(
  eligible.map(async (p) => {
    const input = { mode: p.base.mode, profile: p.base.profile, dossier: p.base.dossier, call: p.call, fit: p.fit };
    const r = live ? await llm.variant(input) : await mockFitVariant.variant(input);
    p.variant = r.variant;
    p.variantMs = r.latencyMs;
    p.variantUsage = r.usage;
    p.checks = { unsupported: unsupportedNumbers(r.variant, p.base, p.call), placeholders: placeholders(r.variant), words: words(r.variant) };
  }),
);

for (const p of eligible) {
  const v = p.variant;
  console.log(bold(`\n━━━ ${p.base.id} × ${p.call.name} ━━━`));
  console.log(dim(`${p.variantMs} ms · ${p.checks.words} palabras · out ${p.variantUsage?.output_tokens ?? 0} tokens`));
  console.log(cyan(`Estrategia: ${v.strategy}`));
  console.log(dim(`Base: ${Object.keys(p.base.dossier).join(" → ")}`));
  console.log(`Variante: ${v.sections.map((s) => `${s.heading} [${s.criteria.join(",")}]`).join(" → ")}`);
  for (const s of v.sections) {
    console.log(bold(`\n  ## ${s.heading}`) + dim(`  criterios ${s.criteria.join(", ") || "-"} · de ${s.from.join(", ")}`));
    console.log(s.body.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  if (v.omitted.length) console.log(dim(`\n  Omitido: ${v.omitted.map((o) => `${o.what} (${o.why})`).join("; ")}`));
  for (const q of v.questions) console.log(cyan(`  ¿ [${q.criterion_id}] ${q.question}`));
  for (const f of v.format_checks) console.log(`  ${f.status === "ok" ? green("✓") : f.status === "riesgo" ? yellow("!") : dim("·")} ${f.rule}${f.note ? dim(` — ${f.note}`) : ""}`);
  console.log(
    p.checks.unsupported.length ? red(`  ⚠ números sin respaldo en el perfil: ${p.checks.unsupported.join(", ")}`) : green("  ✓ todos los números salen del perfil, el dossier base o las bases"),
  );
  console.log(dim(`  ${p.checks.placeholders.length} huecos [PENDIENTE] para el usuario`));
}

// ---------------------------------------------------------------------------
// Summary + files
// ---------------------------------------------------------------------------

const pct = (xs, q) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : null);
const fitMs = pairs.map((p) => p.fitMs), varMs = eligible.map((p) => p.variantMs);
console.log(bold(`\n━━━ Resumen ${live ? "(MEDIDO)" : "(MOCK)"} ━━━`));
console.table([
  { llamada: "fit", n: fitMs.length, p50: pct(fitMs, 0.5), max: Math.max(...fitMs) },
  { llamada: "variant", n: varMs.length, p50: pct(varMs, 0.5), max: varMs.length ? Math.max(...varMs) : null },
]);
console.log(`wall total ${Math.round(performance.now() - t0)} ms (fits en paralelo, luego variantes en paralelo)`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(path.join(here, "results"), { recursive: true });
const tag = `${live ? "live" : "mock"}-${MODELS.variant.replace("claude-", "")}`;
fs.writeFileSync(path.join(here, "results", `variants-${tag}-${stamp}.json`), JSON.stringify({ live, models: MODELS, pairs: pairs.map(({ base, ...p }) => ({ profile: base.id, ...p, call: p.call.id })) }, null, 2));

// Markdown report: what the user/app would see, one block per variant.
const md = [`# Variantes por convocatoria (${live ? "Claude API" : "mock"}, ${MODELS.variant}, ${new Date().toISOString().slice(0, 10)})`, ""];
md.push("| perfil | convocatoria | encaje | puntos | requisitos ✓/?/✗ |", "|---|---|---|---|---|");
for (const p of pairs) md.push(`| ${p.base.id} | ${short(p.call)} | ${p.fit.fit} | ${p.call.max_points ? `${p.score.total}/${p.call.max_points}` : "no competitiva"} | ${p.score.cumple}/${p.score.sinDatos}/${p.score.noCumple} |`);
for (const p of eligible) {
  const v = p.variant;
  md.push("", `## ${p.base.id} × ${p.call.name}`, "", `*${v.strategy}*`, "", `Encaje **${p.fit.fit}**${p.call.max_points ? `, ${p.score.total}/${p.call.max_points} puntos estimados hoy` : ""}. ${p.variantMs} ms.`, "");
  for (const s of v.sections) md.push(`### ${s.heading}`, `<sub>criterios: ${s.criteria.join(", ") || "-"} · de: ${s.from.join(", ")}</sub>`, "", s.body, "");
  if (v.omitted.length) md.push("**Omitido para esta convocatoria:**", ...v.omitted.map((o) => `- ${o.what}: ${o.why}`), "");
  if (v.questions.length) md.push("**Preguntas al usuario:**", ...v.questions.map((q) => `- [${q.criterion_id}] ${q.question}`), "");
  if (v.format_checks.length) md.push("**Formato:**", ...v.format_checks.map((f) => `- ${f.status}: ${f.rule} — ${f.note}`), "");
  md.push(`**Números sin respaldo:** ${p.checks.unsupported.length ? p.checks.unsupported.join(", ") : "ninguno"}`);
}
const mdFile = path.join(here, "results", `variants-${tag}.md`);
fs.writeFileSync(mdFile, md.join("\n") + "\n");
console.log(dim(`informe: ${path.relative(here, mdFile)}`));
if (!live) console.log(yellow("\nMOCK MODE: run with a key for real fit scores and variants."));
