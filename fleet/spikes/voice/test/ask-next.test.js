import test from "node:test";
import assert from "node:assert/strict";
import { isMojibake, validateAskNext } from "../src/profile.js";
import { createMockLLM } from "../src/mock.js";
import { SCENARIOS } from "../src/transcripts.js";
import { Session } from "../src/session.js";

// Real ask_next values written by claude-sonnet-5-5 (FINDINGS §8.1 and results/live-sonnet-run.txt).
const CORRUPT = [
  "ÂżDĂłnde vives y trabajas?",
  "ÂżEn quĂŠ aĂąo fue esa colectiva en la Fundaciأłn Luis Seoane?",
  "ÂżQuĂ© te gustarĂa conseguir o financiar con esta beca?",
  "ÂżEn quĂ© aĂąo fue esa colectiva en la Fundación Luis Seoane?",
  "ÂżTienes web o Instagram donde se puedan ver tus obras?",
  "ÂżQuĂ© proyecto o idea concreta te gustarĂa financiar con la ayuda?",
  "ÂżQuĂŠ te gustarĂ­a conseguir o financiar con la beca para esa novela grĂĄfica?",
  // cp1251 (Cyrillic), seen in the re-run of 14/11/2026
  "ВїQuГ© exposiciones o ferias has hecho Гєltimamente, aunque sean pequeГ±as?",
  "ВЂ¿Tienes una web o perfil de Instagram donde se pueda ver tu trabajo?",
  "ВTienes una web o Instagram donde se pueda ver tu obra?",
  "Â¿DÃ³nde vives?", // cp1252 flavour
  "¿Qué exposiciones has hecho â€” aunque sean pequeñas? 500 â‚¬", // 3-byte punctuation
  "¿Dónde expusiste en 2023?\uFFFD", // replacement character
];

const CLEAN = [
  "",
  "¿Dónde vives y trabajas?",
  "¿En qué año fue esa colectiva en la Fundación Luis Seoane?",
  "¿Qué te gustaría conseguir o financiar con esta beca?",
  "¿Cuántas personas sois en el equipo? ¿Y la pingüina del logo?",
  "¿Cuál es tu disciplina principal: pintura, ilustración o escultura?",
  "¿Ú última pregunta: tienes web? ¡Ñandú!",
  "Onde vives e traballas?", // Galician
  "¿En que ano comezaches a pintar en Compostela?",
  "Que técnica empregas? Acuarela, óleo ou xilografía?",
  "¿Expusiste en São Paulo — o en Lisboa… con «Terra queimada» por 500 €?",
  "Tes algunha exposición en Ourense ou na Coruña? ç, ü, á é í ó ú ñ",
];

test("isMojibake flags the real Sonnet questions", () => {
  for (const q of CORRUPT) assert.equal(isMojibake(q), true, q);
});

test("isMojibake lets normal Spanish and Galician questions through", () => {
  for (const q of CLEAN) assert.equal(isMojibake(q), false, q);
});

test("validateAskNext drops corrupt questions and keeps clean ones", () => {
  assert.deepEqual(validateAskNext(CORRUPT[0]), { ok: false, question: "", reason: "mojibake" });
  assert.deepEqual(validateAskNext("  ¿Dónde vives?  "), { ok: true, question: "¿Dónde vives?" });
  assert.deepEqual(validateAskNext(undefined), { ok: true, question: "" });
});

test("session never emits a corrupt ask_next and records the discard", async () => {
  const mock = createMockLLM("painter", { latencyScale: 0 });
  let calls = 0;
  const llm = {
    ...mock,
    async extract(args) {
      const r = await mock.extract(args);
      return { ...r, ask_next: calls++ === 0 ? CORRUPT[0] : r.ask_next };
    },
  };
  const s = new Session({ mode: "creator", llm, idleMs: 10, dossierGapMs: 0 });
  const asks = [];
  const discarded = [];
  s.on("extracted", ({ ask_next }) => asks.push(ask_next));
  s.on("ask_rejected", (d) => discarded.push(d));
  for (const f of SCENARIOS.painter.finals) s.final(f);
  const { rejectedAsks, rejected } = await s.stop();
  assert.equal(asks[0], "", "corrupt question replaced by empty");
  assert.ok(asks.every((q) => !isMojibake(q)));
  assert.deepEqual(rejectedAsks, [{ n: 1, ask_next: CORRUPT[0], reason: "mojibake" }]);
  assert.deepEqual(discarded, rejectedAsks);
  assert.equal(rejected.length, 1, "rejected ops are counted separately");
});
