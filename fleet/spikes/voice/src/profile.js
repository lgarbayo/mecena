// Profile state + patch engine. Pure functions, no I/O: portable to the app as-is.
//
// State shape:
// {
//   kind: "creator" | "business",
//   fields: { [field]: { value, source, at, history: [{ value, source, at }] } },        // scalars
//   lists:  { [field]: { [key]: { title, year, place, detail, source, at, history } } }, // lists
// }

import { FIELDS } from "./schemas.js";

export function emptyProfile(mode) {
  const lists = {};
  for (const [k, f] of Object.entries(FIELDS[mode])) if (f.kind === "list") lists[k] = {};
  return { kind: mode, fields: {}, lists };
}

/** Lowercase, strip accents and punctuation, collapse whitespace. Used for verbatim checks. */
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const YEAR_RE = /\b(19\d\d|20\d\d)\b/;
const SPOKEN_YEAR_RE = /\b(dos mil|mil novecientos)\b/;

/**
 * Validate one op against the transcript and the current state.
 * Returns { ok: true, op } (possibly cleaned) or { ok: false, reason }.
 */
export function validateOp(op, state, transcriptNorm) {
  const spec = FIELDS[state.kind][op.field];
  if (!spec) return { ok: false, reason: `unknown field ${op.field}` };
  const src = normalize(op.source);
  if (src.split(" ").length < 2) return { ok: false, reason: "source too short" };
  if (!transcriptNorm.includes(src)) return { ok: false, reason: "source not verbatim in transcript" };

  const clean = { ...op };
  // A year must be audible in its own quote; otherwise drop the year, keep the fact.
  if (clean.year && !(YEAR_RE.test(op.source) || SPOKEN_YEAR_RE.test(src))) clean.year = "";

  if (spec.kind === "scalar") {
    if (!["set", "remove"].includes(op.op)) clean.op = "set";
    if (clean.op === "set" && !clean.value.trim()) return { ok: false, reason: "empty value" };
    return { ok: true, op: clean };
  }
  // list field
  if (clean.op === "set") clean.op = "add";
  if (!clean.key) clean.key = normalize(clean.value).replace(/ /g, "-").slice(0, 40) || `item-${Date.now()}`;
  const items = state.lists[op.field];
  if ((clean.op === "update" || clean.op === "remove") && !items[clean.key]) {
    return { ok: false, reason: `${clean.op} of unknown key ${clean.key}` };
  }
  if (clean.op === "add" && items[clean.key]) clean.op = "update"; // model re-added an existing key
  if (clean.op !== "remove" && !clean.value.trim()) return { ok: false, reason: "empty value" };
  return { ok: true, op: clean };
}

/**
 * Apply validated ops immutably. Returns { state, changed: [{field, key?, kind}], dirtySections: Set }.
 * Unchanged values (same normalized value) are not re-applied, which avoids UI flicker.
 */
export function applyOps(state, ops, now = Date.now()) {
  const next = structuredClone(state);
  const changed = [];
  const dirtySections = new Set();
  for (const op of ops) {
    const spec = FIELDS[next.kind][op.field];
    if (spec.kind === "scalar") {
      const prev = next.fields[op.field];
      if (op.op === "remove") {
        if (prev) {
          delete next.fields[op.field];
          changed.push({ field: op.field, kind: "removed" });
        }
      } else if (!prev || normalize(prev.value) !== normalize(op.value)) {
        const history = prev ? [...prev.history, { value: prev.value, source: prev.source, at: prev.at }] : [];
        next.fields[op.field] = { value: op.value.trim(), source: op.source, at: now, history };
        changed.push({ field: op.field, kind: prev ? "corrected" : "set", snapshot: next.fields[op.field] });
      } else continue;
    } else {
      const items = next.lists[op.field];
      const prev = items[op.key];
      if (op.op === "remove") {
        delete items[op.key];
        changed.push({ field: op.field, key: op.key, kind: "removed" });
      } else {
        const item = {
          title: op.value.trim(),
          year: op.year || prev?.year || "",
          place: op.place || prev?.place || "",
          detail: op.detail || prev?.detail || "",
        };
        if (prev && ["title", "year", "place", "detail"].every((k) => normalize(prev[k]) === normalize(item[k]))) continue;
        const history = prev ? [...prev.history, { title: prev.title, year: prev.year, place: prev.place, detail: prev.detail, source: prev.source }] : [];
        items[op.key] = { ...item, source: op.source, at: now, history };
        changed.push({ field: op.field, key: op.key, kind: prev ? "corrected" : "added", snapshot: items[op.key] });
      }
    }
    dirtySections.add(spec.section);
  }
  return { state: next, changed, dirtySections };
}

/** Compact view of the state for the prompt (drops timestamps/history to save tokens). */
export function stateForPrompt(state) {
  const out = { fields: {}, lists: {} };
  for (const [k, v] of Object.entries(state.fields)) out.fields[k] = { value: v.value, source: v.source };
  for (const [k, items] of Object.entries(state.lists)) {
    if (!Object.keys(items).length) continue;
    out.lists[k] = Object.fromEntries(
      Object.entries(items).map(([key, it]) => [key, { title: it.title, year: it.year, place: it.place, detail: it.detail, source: it.source }]),
    );
  }
  return out;
}

/** Human-readable rendering for the terminal. */
export function renderProfile(state) {
  const lines = [];
  for (const [k, spec] of Object.entries(FIELDS[state.kind])) {
    if (spec.kind === "scalar") {
      const f = state.fields[k];
      if (!f) continue;
      const corr = f.history.length ? `  (corregido; antes: ${f.history.map((h) => h.value).join(" → ")})` : "";
      lines.push(`  ${spec.label}: ${f.value}${corr}`);
      lines.push(`      «${f.source}»`);
    } else {
      const items = Object.entries(state.lists[k]);
      if (!items.length) continue;
      lines.push(`  ${spec.label}:`);
      for (const [, it] of items) {
        const meta = [it.year, it.place, it.detail].filter(Boolean).join(" · ");
        const corr = it.history.length ? `  (corregido; antes: ${it.history.map((h) => [h.title, h.year].filter(Boolean).join(" ")).join(" → ")})` : "";
        lines.push(`    - ${it.title}${meta ? ` — ${meta}` : ""}${corr}`);
        lines.push(`        «${it.source}»`);
      }
    }
  }
  return lines.join("\n");
}

export function countFilled(state) {
  return Object.keys(state.fields).length + Object.values(state.lists).reduce((n, l) => n + Object.keys(l).length, 0);
}
