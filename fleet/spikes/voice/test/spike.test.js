import test from "node:test";
import assert from "node:assert/strict";
import { patchSchema, dossierSchema, SHEET_SCHEMA, IMAGE_NOTES_SCHEMA } from "../src/schemas.js";
import { emptyProfile, validateOp, applyOps, normalize, closestKey } from "../src/profile.js";
import { ORACLE, MOCK_SHEET, createMockLLM } from "../src/mock.js";
import { SCENARIOS, WORK_DESCRIPTION } from "../src/transcripts.js";
import { Session } from "../src/session.js";

// Structured outputs require additionalProperties:false and every property in `required`.
function assertStrict(schema, at = "$") {
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, `${at}: additionalProperties must be false`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${at}: all properties required`);
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${at}.${k}`);
  }
  if (schema.type === "array") assertStrict(schema.items, `${at}[]`);
  assert.ok(!schema.anyOf && !Array.isArray(schema.type), `${at}: no unions by design`);
}

test("output schemas are strict-mode compatible", () => {
  for (const mode of ["creator", "business"]) {
    assertStrict(patchSchema(mode));
    assertStrict(dossierSchema(mode));
  }
  assertStrict(SHEET_SCHEMA);
  assertStrict(IMAGE_NOTES_SCHEMA);
});

test("every oracle quote is verbatim in its transcript (except the injected hallucination)", () => {
  for (const [id, ops] of Object.entries(ORACLE)) {
    const t = normalize(SCENARIOS[id].finals.join(" "));
    for (const op of ops) assert.equal(t.includes(normalize(op.source)), !op.injected, `${id}: ${op.source}`);
  }
  const w = normalize(WORK_DESCRIPTION.finals.join(" "));
  for (const [k, f] of Object.entries(MOCK_SHEET)) if (f?.source) assert.ok(w.includes(normalize(f.source)), k);
});

const op = (o) => ({ op: "set", field: "name", key: "", value: "", year: "", place: "", detail: "", source: "", ...o });

test("validateOp rejects quotes that were not said and years that were not heard", () => {
  const s = emptyProfile("creator");
  const t = normalize("expuse en el museo provincial de lugo en 2022 y estudié bellas artes");
  assert.equal(validateOp(op({ value: "X", source: "me dieron el premio nacional" }), s, t).ok, false);
  const v = validateOp(op({ op: "add", field: "education", key: "bbaa", value: "Bellas Artes", year: "2015", source: "y estudié bellas artes" }), s, t);
  assert.ok(v.ok);
  assert.equal(v.op.year, "", "year not present in the quote is dropped");
  assert.equal(validateOp(op({ op: "update", field: "exhibitions", key: "nope", value: "X", source: "museo provincial de lugo" }), s, t).ok, false);
});

// The real case from the Sonnet run of 13/11 (FINDINGS 8.1): the series item had been added as novela-grafica-padre.
const NOVELA = "mi proyecto personal es una novela gráfica sobre el viaje de mi padre desde lagos hasta vigo en los años 80 se llama la otra orilla y llevo unas 40 páginas abocetadas";
const OTRA_ORILLA = "se llama la otra orilla y llevo unas 40 páginas abocetadas";
function illustratorState() {
  const s = emptyProfile("creator");
  return applyOps(s, [op({ op: "add", field: "series", key: "novela-grafica-padre", value: "Novela gráfica sobre el viaje de su padre", source: "una novela gráfica sobre el viaje de mi padre" })]).state;
}

test("update with a misspelled list key is rewritten to the existing key (real Sonnet case)", () => {
  const s = illustratorState();
  const v = validateOp(op({ op: "update", field: "series", key: "novela-graphica-padre", value: "La otra orilla", source: OTRA_ORILLA }), s, normalize(NOVELA));
  assert.ok(v.ok, v.reason);
  assert.equal(v.op.key, "novela-grafica-padre");
  assert.deepEqual(v.keyFix, { from: "novela-graphica-padre", to: "novela-grafica-padre" });
  const item = applyOps(s, [v.op]).state.lists.series["novela-grafica-padre"];
  assert.equal(item.title, "La otra orilla");
  assert.equal(item.history.length, 1);
  assert.equal(Object.keys(applyOps(s, [v.op]).state.lists.series).length, 1, "no duplicate item");
});

test("fuzzy key match: exact key untouched, other field, ties, similar items and far keys are not guessed", () => {
  const t = normalize(NOVELA);
  const s = illustratorState();
  // Exact key: unchanged, no keyFix.
  const exact = validateOp(op({ op: "update", field: "series", key: "novela-grafica-padre", value: "La otra orilla", source: OTRA_ORILLA }), s, t);
  assert.ok(exact.ok);
  assert.equal(exact.op.key, "novela-grafica-padre");
  assert.equal(exact.keyFix, undefined);
  // Near match in another field does not count.
  const other = validateOp(op({ op: "update", field: "themes", key: "novela-graphica-padre", value: "Migración", source: OTRA_ORILLA }), s, t);
  assert.deepEqual(other, { ok: false, reason: "update of unknown key novela-graphica-padre" });
  // Two keys equally close: rejected, not guessed; a unique best match wins.
  const two = { "serie-marina": {}, "serie-marino": {} };
  assert.equal(closestKey("serie-marine", two), null);
  assert.equal(closestKey("serie-marinas", two), "serie-marina");
  // Different items with similar names are not typos (all of these used to match on whole-slug distance).
  for (const [k, existing] of [["colectiva-vigo", "colectiva-lugo"], ["mercado-chile", "mercado-china"], ["maria", "mario"], ["expo-valencia", "expo-palencia"], ["album-3", "album-1"], ["novela-grafica", "novela-grafica-padre"]]) {
    assert.equal(closestKey(k, { [existing]: {} }), null, `${k} must not match ${existing}`);
  }
  // Accents and case are not edits.
  assert.equal(closestKey("Novela-Gráfica-Padre", { "novela-grafica-padre": {} }), "novela-grafica-padre");
  // Remove is never redirected: it deletes the item with its history.
  const rm = validateOp(op({ op: "remove", field: "series", key: "novela-graphica-padre", source: OTRA_ORILLA }), s, t);
  assert.deepEqual(rm, { ok: false, reason: "remove of unknown key novela-graphica-padre" });
  // No close key: still rejected even with a value and a verbatim quote (not turned into an add).
  const far = validateOp(op({ op: "update", field: "series", key: "la-otra-orilla", value: "La otra orilla", source: OTRA_ORILLA }), s, t);
  assert.deepEqual(far, { ok: false, reason: "update of unknown key la-otra-orilla" });
});

test("session reports key fixes and applies the op", async () => {
  const llm = {
    extract: async () => ({ ops: [op({ op: "update", field: "series", key: "novela-graphica-padre", value: "La otra orilla", source: OTRA_ORILLA })], latencyMs: 0, usage: {} }),
    dossier: async ({ sections }) => ({ sections: sections.map((id) => ({ id, title: id, body: "", quotes_used: [], missing: [] })), latencyMs: 0, usage: {} }),
  };
  const s = new Session({ mode: "creator", llm, idleMs: 10, dossierGapMs: 0 });
  s.state = illustratorState();
  const seen = [];
  s.on("keyfix", (f) => seen.push(f));
  s.final(NOVELA);
  const { state, rejected, keyFixes } = await s.stop();
  assert.equal(rejected.length, 0);
  assert.deepEqual(keyFixes, [{ field: "series", from: "novela-graphica-padre", to: "novela-grafica-padre" }]);
  assert.deepEqual(seen, keyFixes);
  assert.equal(state.lists.series["novela-grafica-padre"].title, "La otra orilla");
});

test("corrections replace the value and keep history; repeats are no-ops", () => {
  let s = emptyProfile("business");
  s = applyOps(s, [op({ field: "employees", value: "4 personas", source: "somos 4 personas" })]).state;
  const r = applyOps(s, [op({ field: "employees", value: "5 personas", source: "bueno 5 desde septiembre" })]);
  assert.equal(r.state.fields.employees.value, "5 personas");
  assert.deepEqual(r.state.fields.employees.history.map((h) => h.value), ["4 personas"]);
  assert.deepEqual([...r.dirtySections], ["team"]);
  const again = applyOps(r.state, [op({ field: "employees", value: "5 PERSONAS", source: "bueno 5 desde septiembre" })]);
  assert.equal(again.changed.length, 0);
});

test("mock session: painter scenario ends with corrected exhibition year and all dossier sections", async () => {
  const s = new Session({ mode: "creator", llm: createMockLLM("painter", { latencyScale: 0 }), idleMs: 10, dossierGapMs: 0 });
  for (const f of SCENARIOS.painter.finals) s.final(f);
  const { state, dossier, rejected } = await s.stop();
  const ex = state.lists.exhibitions["terra-queimada-museo-lugo"];
  assert.equal(ex.year, "2023");
  assert.equal(ex.history[0].year, "2022");
  assert.equal(rejected.length, 1, "injected hallucination is rejected");
  assert.deepEqual(Object.keys(dossier).sort(), ["bio", "cv", "series", "statement"]);
});

// Polls cond() every ms, fails after 2 s instead of hanging the test run.
async function until(cond, what) {
  for (let i = 0; i < 2000 && !cond(); i++) await new Promise((r) => setTimeout(r, 1));
  assert.ok(cond(), `timed out waiting for ${what}`);
}

test("stop(): final pass = one dossier call per section, in parallel; a stale live call cannot overwrite it", async () => {
  const mock = createMockLLM("painter", { latencyScale: 0 });
  const gate = () => {
    let open;
    const p = new Promise((r) => (open = r));
    return Object.assign(p, { open });
  };
  const liveGate = gate(); // holds the live dossier call that is in flight when the user stops
  const statementGate = gate(); // holds one final call, to see the others applied before it returns
  const heldCalls = [];
  const finalCalls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let stopping = false;
  const llm = {
    ...mock,
    async dossier(req) {
      if (!stopping) {
        // Live call: answers only after the final pass, with text that must never reach the dossier.
        heldCalls.push(req.sections);
        const res = await mock.dossier(req);
        await liveGate;
        return { ...res, sections: res.sections.map((s) => ({ ...s, body: `STALE ${s.body}` })) };
      }
      finalCalls.push(req.sections);
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      if (req.sections[0] === "statement") await statementGate;
      else await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return mock.dossier(req);
    },
  };
  const s = new Session({ mode: "creator", llm, idleMs: 10, dossierGapMs: 0 });
  const finalEvents = [];
  s.on("dossier", ({ call, sections }) => call.type === "dossier-final" && finalEvents.push(sections.map((x) => x.id)));
  for (const f of SCENARIOS.painter.finals) s.final(f);
  await until(() => heldCalls.length, "a live dossier call in flight");
  await until(() => !s.extracting && s.sentUpTo === s.transcript.length, "every word extracted");
  assert.ok(s.dirty.size > 0, "more sections are waiting for the live loop…");
  assert.equal(heldCalls.length, 1, "…but it is single-flight: still one live dossier call");

  stopping = true;
  let stopResolved = false;
  const stopped = s.stop().then((r) => ((stopResolved = true), r));
  await until(() => finalEvents.length >= 3, "the three fast final calls (old stop() waited for the live call first)");
  assert.ok(!finalEvents.flat().includes("statement"), "each section is applied when its own call returns");
  statementGate.open();
  await until(() => stopResolved, "stop() to resolve with the old live call still in flight");
  const { dossier, calls } = await stopped;

  const sections = ["bio", "cv", "series", "statement"];
  assert.ok(heldCalls[0].some((id) => sections.includes(id)), "the stale call overlaps the final pass");
  assert.deepEqual(finalCalls.map((x) => x.join()).sort(), sections, "one final call per section, one section each");
  assert.equal(maxInFlight, 4, "all final calls run at the same time");
  assert.deepEqual(finalEvents.flat().sort(), sections);
  assert.equal(calls.filter((c) => c.type === "dossier-final").length, 4);
  assert.deepEqual(Object.keys(dossier).sort(), sections);

  liveGate.open(); // the old live call returns only now, after the final pass wrote every section
  await until(() => calls.some((c) => c.discarded), "the stale live call to settle");
  assert.ok(stopResolved);
  for (const id of sections) assert.ok(!dossier[id].body.startsWith("STALE"), `${id}: stale live text overwrote the final pass`);
  assert.deepEqual(calls.find((c) => c.discarded).discarded, heldCalls[0], "the stale call is recorded with its discarded sections");
  assert.equal(new Set(calls.filter((c) => c.type === "dossier-final").map((c) => c.n)).size, 4, "parallel final calls get distinct numbers");
});

test("stop(): a final that arrives during the flush is still extracted and written", async () => {
  const finals = SCENARIOS.painter.finals;
  const last = finals.at(-1);
  assert.match(last, /busco ayudas/);
  const s = new Session({ mode: "creator", llm: createMockLLM("painter", { latencyScale: 0.05 }), idleMs: 10_000, dossierGapMs: 0 });
  for (const f of finals.slice(0, -1)) s.final(f);
  await until(() => !s.extracting && s.sentUpTo === s.transcript.length, "every word extracted");
  s.final("ahora quiero"); // under minWords: waits for the idle timer, so stop() has to flush it
  const stopped = s.stop();
  await until(() => s.extracting, "the flush extract");
  s.final(last); // the browser delivers the last final after "Terminar"
  const { state, dossier } = await stopped;
  assert.ok(state.fields.goals?.value, "goals from the late final are in the profile");
  assert.ok(dossier.statement.body.includes(state.fields.goals.source), "and in the final statement");
});
