#!/usr/bin/env node
// Replays the Spanish onboarding transcripts word by word with realistic timing, as the
// Web Speech API would deliver them (interim results per word, a final result at each pause),
// runs the incremental extractor + dossier writer and prints how the profile evolves and
// what every Claude call costs in latency.
//
//   npm start                          all scenarios + the per-work sheet, real time
//   npm run fast                       same, 6x faster speech (stresses coalescing)
//   node replay.js --scenario painter  one scenario (painter | illustrator | business)
//   node replay.js --mock              force the deterministic mock even with a key

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { SCENARIOS, WORK_DESCRIPTION } from "./src/transcripts.js";
import { Session } from "./src/session.js";
import { createMockLLM } from "./src/mock.js";
import { createClaudeLLM, loadApiKey, MODELS } from "./src/llm.js";
import { renderProfile, countFilled } from "./src/profile.js";
import { FIELDS } from "./src/schemas.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    scenario: { type: "string" },
    speed: { type: "string", default: "1" },
    mock: { type: "boolean", default: false },
    "no-sheet": { type: "boolean", default: false },
    image: { type: "string" },
  },
});

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c(2), bold = c(1), green = c(32), yellow = c(33), red = c(31), cyan = c(36), magenta = c(35);

const speed = Number(args.speed) || 1;
const WORD_MS = 360 / speed; // ~165 words per minute, typical relaxed Spanish speech
const FINAL_DELAY_MS = 350 / speed; // recogniser closes the result shortly after the pause
const PAUSE_MS = 650 / speed; // pause between utterances

const keyInfo = args.mock ? null : loadApiKey();
const live = Boolean(keyInfo);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = performance.now();
const ts = () => dim(`[${((performance.now() - t0) / 1000).toFixed(1).padStart(5)}s]`);

function banner() {
  console.log(bold("\nMecena · spike de extracción por voz\n"));
  if (live) {
    console.log(green(`LIVE: Claude API (key from ${keyInfo.from === "environment" ? "environment" : keyInfo.from})`));
    console.log(dim(`models: extract=${MODELS.extract} dossier=${MODELS.dossier} sheet=${MODELS.sheet}`));
  } else {
    console.log(yellow(bold("MOCK MODE: no ANTHROPIC_API_KEY found (env or repo-root .env)" + (args.mock ? " / --mock" : ""))));
    console.log(yellow("The extractor is a deterministic oracle and latencies are SIMULATED, not measured."));
    console.log(yellow("Set ANTHROPIC_API_KEY (or add it to the repo-root .env) and rerun for real numbers."));
  }
  console.log(dim(`speech speed x${speed}: ${Math.round(WORD_MS)} ms/word, final +${Math.round(FINAL_DELAY_MS)} ms, pause ${Math.round(PAUSE_MS)} ms\n`));
}

function describeChange(state, ch) {
  const spec = FIELDS[state.kind][ch.field];
  if (spec.kind === "scalar") {
    const f = ch.snapshot;
    return f ? `${spec.label} = ${bold(f.value)}  ${dim(`«${f.source}»`)}` : `${spec.label} eliminado`;
  }
  const it = ch.snapshot;
  if (!it) return `${spec.label} − ${ch.key}`;
  const meta = [it.year, it.place, it.detail].filter(Boolean).join(" · ");
  return `${spec.label} + ${bold(it.title)}${meta ? ` (${meta})` : ""}  ${dim(`«${it.source}»`)}`;
}

async function runScenario(id) {
  const sc = SCENARIOS[id];
  console.log(bold(cyan(`\n━━━ ${sc.title} · modo ${sc.mode} ━━━`)));
  const llm = live ? createClaudeLLM(keyInfo.key) : createMockLLM(id);
  const s = new Session({ mode: sc.mode, llm });
  const started = performance.now();
  let interimShown = false;

  const clearInterim = () => {
    if (tty && interimShown) process.stdout.write("\r\x1b[2K");
    interimShown = false;
  };
  s.on("interim", (t) => {
    if (!tty) return;
    process.stdout.write(`\r\x1b[2K${dim("… " + t.slice(-110))}`);
    interimShown = true;
  });
  s.on("final", (t) => {
    clearInterim();
    console.log(`${ts()} 🎙  ${t}`);
  });
  s.on("extracted", ({ call, changed, ask_next, state }) => {
    clearInterim();
    const lat = `${call.latencyMs} ms${call.ttftMs ? `, ttft ${call.ttftMs}` : ""}, lag ${call.lagMs} ms`;
    const tok = live ? dim(` in ${call.usage.input_tokens}+${call.usage.cache_read_input_tokens ?? 0}c out ${call.usage.output_tokens}`) : "";
    console.log(`${ts()} ${magenta(`⚙ extract #${call.n}`)} ${call.words} palabras → ${call.applied}/${call.ops} ops  ${dim(lat)}${tok}`);
    for (const ch of changed) {
      const tag = ch.kind === "corrected" ? yellow("  ↺ corrige ") : green("  ✓ ");
      console.log(`${tag}${describeChange(state, ch)}`);
    }
    if (ask_next) console.log(dim(`  ? ${ask_next}`));
  });
  s.on("rejected", ({ op, reason }) => {
    clearInterim();
    console.log(red(`  ✗ descartado (${reason}): ${op.field} = ${op.value}  «${op.source}»${op.injected ? "  [alucinación inyectada a propósito en el mock]" : ""}`));
  });
  s.on("keyfix", ({ field, from, to }) => {
    clearInterim();
    console.log(yellow(`  ~ clave corregida ${from} → ${to} (${field})`));
  });
  s.on("ask_rejected", ({ ask_next, reason }) => {
    clearInterim();
    console.log(red(`  ✗ pregunta descartada (${reason}): ${JSON.stringify(ask_next)}`));
  });
  s.on("dossier", ({ call, sections }) => {
    clearInterim();
    console.log(`${ts()} ${cyan(`📄 ${call.type} #${call.n}`)} [${sections.map((x) => x.id).join(", ")}] ${dim(`${call.latencyMs} ms`)}`);
    for (const sec of sections) {
      const first = (sec.body || "(vacío)").split("\n")[0];
      console.log(dim(`   ${sec.id}: ${first.slice(0, 120)}${first.length > 120 ? "…" : ""}`));
    }
  });
  s.on("error", (e) => {
    clearInterim();
    console.log(red(`  ! ${e.message}`));
  });

  // Replay: interim result per word, final at the end of each utterance.
  for (const utterance of sc.finals) {
    const words = utterance.split(" ");
    for (let i = 1; i <= words.length; i++) {
      await sleep(WORD_MS);
      s.interim(words.slice(0, i).join(" "));
    }
    await sleep(FINAL_DELAY_MS);
    s.final(utterance);
    await sleep(PAUSE_MS);
  }
  const speechMs = performance.now() - started;
  const result = await s.stop();
  const doneMs = performance.now() - started;

  console.log(bold(`\n  Perfil final (${countFilled(result.state)} datos):`));
  console.log(renderProfile(result.state));
  console.log(bold("\n  Dossier:"));
  for (const [id, sec] of Object.entries(result.dossier)) {
    console.log(`  ${bold(sec.title)} ${dim(`(${id})`)}`);
    console.log((sec.body || dim("(vacío)")).split("\n").map((l) => "    " + l).join("\n"));
    if (sec.missing?.length) console.log(dim(`    falta: ${sec.missing.join(", ")}`));
  }
  console.log(dim(`\n  speech ${(speechMs / 1000).toFixed(1)} s · final dossier ready ${((doneMs - speechMs) / 1000).toFixed(1)} s after the user stops`));
  return { id, mode: sc.mode, speechMs: Math.round(speechMs), tailMs: Math.round(doneMs - speechMs), ...result };
}

async function runSheet() {
  console.log(bold(cyan(`\n━━━ ${WORK_DESCRIPTION.title} ━━━`)));
  const llm = live ? createClaudeLLM(keyInfo.key) : createMockLLM("sheet");
  const transcript = WORK_DESCRIPTION.finals.join(" ");
  console.log(`🎙  ${transcript}`);
  let imageNotes = null;
  if (args.image && live) {
    const r = await llm.imageNotes({ imagePath: args.image });
    imageNotes = r.notes;
    console.log(`${magenta("👁 vision")} ${dim(`${r.latencyMs} ms`)} ${JSON.stringify(imageNotes)}`);
  } else if (args.image) console.log(yellow("  (--image ignored in mock mode)"));
  const r = await llm.sheet({ transcript, imageNotes });
  console.log(`${magenta("⚙ sheet")} ${dim(`${r.latencyMs} ms${r.ttftMs ? `, ttft ${r.ttftMs}` : ""}`)}`);
  const sh = r.sheet;
  for (const k of ["title", "year", "technique", "support", "series", "concept", "edition"]) {
    if (sh[k].value) console.log(`  ${k}: ${bold(sh[k].value)} ${dim(`[${sh[k].origin}] «${sh[k].source}»`)}`);
  }
  const d = sh.dimensions;
  if (d.height_cm) console.log(`  dimensions: ${bold(`${d.height_cm} × ${d.width_cm}${d.depth_cm ? ` × ${d.depth_cm}` : ""} cm`)} ${dim(`«${d.source}»`)}`);
  if (sh.follow_up_question) console.log(dim(`  ? ${sh.follow_up_question}`));
  return { type: "sheet", latencyMs: r.latencyMs, ttftMs: r.ttftMs ?? null, usage: r.usage, sheet: sh };
}

function pct(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function summary(runs, sheet) {
  console.log(bold(`\n━━━ Latency summary (${live ? "MEASURED" : "SIMULATED — mock"}) ━━━`));
  const rows = [];
  for (const type of ["extract", "dossier", "dossier-final"]) {
    const calls = runs.flatMap((r) => r.calls.filter((c) => c.type === type));
    if (!calls.length) continue;
    const lat = calls.map((c) => c.latencyMs);
    const ttft = calls.map((c) => c.ttftMs).filter((x) => x != null);
    const lag = calls.map((c) => c.lagMs).filter((x) => x != null);
    rows.push({ type, n: calls.length, p50: pct(lat, 50), p95: pct(lat, 95), max: Math.max(...lat), ttft_p50: pct(ttft, 50), lag_p50: pct(lag, 50), lag_p95: pct(lag, 95) });
  }
  if (sheet) rows.push({ type: "sheet", n: 1, p50: sheet.latencyMs, p95: sheet.latencyMs, max: sheet.latencyMs, ttft_p50: sheet.ttftMs });
  console.table(rows);
  console.log(dim("latency = request → full JSON; lag = speech final result → profile updated on screen (queue wait + latency)"));
  for (const r of runs) {
    const extracts = r.calls.filter((c) => c.type === "extract");
    const inTok = r.calls.reduce((n, c) => n + (c.usage?.input_tokens ?? 0) + (c.usage?.cache_read_input_tokens ?? 0) + (c.usage?.cache_creation_input_tokens ?? 0), 0);
    const outTok = r.calls.reduce((n, c) => n + (c.usage?.output_tokens ?? 0), 0);
    console.log(`  ${r.id}: ${extracts.length} extract calls for ${r.state ? countFilled(r.state) : 0} facts, ${r.rejected.length} rejected ops, ${r.keyFixes?.length ?? 0} corrected keys, ${r.rejectedAsks?.length ?? 0} discarded questions, tail after stop ${(r.tailMs / 1000).toFixed(1)} s${live ? `, tokens in ${inTok} / out ${outTok}` : ""}`);
  }
}

banner();
const ids = args.scenario ? [args.scenario] : Object.keys(SCENARIOS);
for (const id of ids) if (!SCENARIOS[id]) throw new Error(`unknown scenario ${id}; use ${Object.keys(SCENARIOS).join(" | ")}`);
const runs = [];
for (const id of ids) runs.push(await runScenario(id));
const sheet = args["no-sheet"] || args.scenario ? null : await runSheet();
summary(runs, sheet);

const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${live ? "live" : "mock"}-x${speed}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outFile, JSON.stringify({ live, speed, models: MODELS, runs, sheet }, null, 2));
console.log(dim(`\nraw results: ${path.relative(process.cwd(), outFile)}`));
if (!live) console.log(yellow(bold("\nReminder: MOCK run. Numbers above are simulated, not Claude latencies.")));
