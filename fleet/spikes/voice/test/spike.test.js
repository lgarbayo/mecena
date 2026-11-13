import test from "node:test";
import assert from "node:assert/strict";
import { patchSchema, dossierSchema, SHEET_SCHEMA, IMAGE_NOTES_SCHEMA } from "../src/schemas.js";
import { emptyProfile, validateOp, applyOps, normalize } from "../src/profile.js";
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
