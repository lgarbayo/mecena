/**
 * The onboarding turn schema as the API sees it. Optional profilePatch fields made the business schema fail with
 * 400 "Schema is too complex" / "Grammar compilation timed out" (2026-11-14), silently sending every pyme turn to the
 * deterministic extractor. Fields are now required with "not said" sentinels, which toTurnResult strips.
 */
import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { DossierSection, OnboardingTurnInput, ProfileKind } from "@/contracts";
import { blankCreator, FIXTURE_NOW } from "@/fixtures";
import { mergeSectionBody, normaliseText, toTurnResult } from "@/features/onboarding/ai";
import { importSchema } from "@/features/onboarding/import";
import { followUpFor } from "@/features/onboarding/mock";
import { cleanProfilePatch, llmTurnSchema, type LlmTurn } from "@/features/onboarding/prompt";
import { looksGarbled } from "@/server/ai/wording";
import { nothingSaid } from "../helpers";

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; $defs?: Record<string, JsonSchema>; anyOf?: JsonSchema[] };

/** Every object in the schema, with its path, the way the SDK sends it (betaZodOutputFormat). */
function objects(s: JsonSchema, at = "$"): { at: string; s: JsonSchema }[] {
  const own = s.properties ? [{ at, s }] : [];
  const kids = [
    ...Object.entries(s.properties ?? {}).map(([k, v]) => objects(v, `${at}.${k}`)),
    ...Object.entries(s.$defs ?? {}).map(([k, v]) => objects(v, `${at}.$defs.${k}`)),
    ...(s.items ? [objects(s.items, `${at}[]`)] : []),
    ...(s.anyOf ?? []).map((v, i) => objects(v, `${at}|${i}`)),
  ];
  return [...own, ...kids.flat()];
}

const KINDS: ProfileKind[] = ["creator", "business"];

describe("onboarding structured-output schema", () => {
  it.each(KINDS)("%s: no optional property anywhere (turn and import schemas)", (kind) => {
    for (const schema of [llmTurnSchema(kind), importSchema(kind)]) {
      const json = betaZodOutputFormat(schema).schema as JsonSchema;
      const found = objects(json);
      expect(found.some((o) => o.at === "$.profilePatch")).toBe(true);
      for (const o of found) expect({ at: o.at, optional: Object.keys(o.s.properties!).filter((k) => !o.s.required?.includes(k)) }).toEqual({ at: o.at, optional: [] });
    }
  });

  it.each(KINDS)("%s: every section update carries a required mode append | replace", (kind) => {
    const json = betaZodOutputFormat(llmTurnSchema(kind)).schema as JsonSchema & {
      properties: { sectionUpdates: { items: { properties: { mode: { enum?: string[] } }; required: string[] } } };
    };
    const item = json.properties.sectionUpdates.items;
    expect(item.properties.mode.enum).toEqual(["append", "replace"]);
    expect(item.required).toEqual(expect.arrayContaining(["key", "mode", "body", "sourceSegmentIds"]));
  });

  it("business legalForm has an explicit 'not said' option", () => {
    const json = betaZodOutputFormat(llmTurnSchema("business")).schema as JsonSchema & { properties: { profilePatch: { properties: { legalForm: { enum?: string[] } } } } };
    expect(json.properties.profilePatch.properties.legalForm.enum).toContain("");
  });
});

const seg = (id: string, text: string) => ({ id, text, source: "voice" as const, at: FIXTURE_NOW });
const blankBusiness = { ...blankCreator, id: "biz", kind: "business" as const };
function turn(kind: ProfileKind, text: string, sections: DossierSection[] = []): OnboardingTurnInput {
  const newSegment = seg("s1", text);
  return { kind, profile: kind === "creator" ? blankCreator : blankBusiness, sections, transcript: [newSegment], newSegment };
}
const out = (kind: ProfileKind, patch: Record<string, unknown>, followUpQuestion = "¿Y qué más?"): LlmTurn =>
  ({ profilePatch: { ...nothingSaid(kind), ...patch }, sectionUpdates: [], followUpQuestion }) as LlmTurn;

describe("toTurnResult strips the sentinels", () => {
  it("business: nothing said → empty patch (no employees 0, no legalForm '')", () => {
    const r = toTurnResult(turn("business", "eh bueno"), out("business", {}));
    expect(r.profilePatch).toEqual({});
  });

  it("business: keeps what was said, drops the rest", () => {
    const r = toTurnResult(
      turn("business", "se llama conservas da ría es una sociedad limitada que montamos en 2019 somos 4"),
      out("business", { displayName: "Conservas da Ría", legalForm: "sl", foundedYear: 2019, employees: 4, achievements: ["", "  "] }),
    );
    expect(r.profilePatch).toEqual({ displayName: "Conservas da Ría", legalForm: "sl", foundedYear: 2019, employees: 4 });
  });

  it("creator: birthYear 0 and blank texts never reach the profile", () => {
    const r = toTurnResult(turn("creator", "soy pintora en Lugo"), out("creator", { city: "Lugo", disciplines: ["pintura"], displayName: " " }));
    expect(r.profilePatch).toEqual({ city: "Lugo", disciplines: ["pintura"] });
    expect(r.profilePatch).not.toHaveProperty("birthYear");
  });

  it("cleanProfilePatch is idempotent on an already clean patch", () => {
    const clean = { city: "Vigo", employees: 3, links: ["https://x.gal"] };
    expect(cleanProfilePatch(cleanProfilePatch(clean))).toEqual(clean);
  });
});

describe("garbled follow-up questions", () => {
  it.each(["ÂżDĂłnde vives y trabajas?", "Â¿DÃ³nde vives?", "¿Dónde vives? �", "¿Dónde ترسم?"])("detects %s", (q) => expect(looksGarbled(q)).toBe(true));
  it.each(["¿Dónde vives y trabajas?", "¿Cuántas personas trabajáis, contándote a ti?", "Onde vives e traballas? Cóntame da túa obra.", "¿Año de fundación? ¡Ñu, Ü!"])(
    "accepts %s",
    (q) => expect(looksGarbled(q)).toBe(false),
  );

  it("a garbled question is replaced by the deterministic one; a clean one is kept", () => {
    const input = turn("creator", "hola");
    const garbled = toTurnResult(input, out("creator", {}, "ÂżDĂłnde vives y trabajas?"));
    expect(garbled.followUpQuestion).toBe(followUpFor("creator", blankCreator));
    expect(garbled.followUpQuestion).not.toMatch(/[ÂĂ]/);
    expect(toTurnResult(input, out("creator", {}, "¿Cómo te llamas?")).followUpQuestion).toBe("¿Cómo te llamas?");
  });

  it("the deterministic replacement accounts for what this turn said (pyme)", () => {
    const r = toTurnResult(turn("business", "somos conservas da ría"), out("business", { displayName: "Conservas da Ría" }, "ÂżQuĂ© vendĂ©is?"));
    expect(r.followUpQuestion).toBe("¿Qué vendéis o qué servicio dais?");
  });
});

const section = (key: DossierSection["key"], body: string, ids = ["s0"]): DossierSection => ({ key, title: key, body, sourceSegmentIds: ids, status: "draft", updatedAt: FIXTURE_NOW });
const patchOut = (updates: LlmTurn["sectionUpdates"]): LlmTurn => ({ profilePatch: nothingSaid("creator"), sectionUpdates: updates, followUpQuestion: "¿Y?" }) as LlmTurn;

describe("section patches: mergeSectionBody", () => {
  const prev = "Soy ilustradora en A Coruña.\n\nDibujo para editoriales gallegas.";

  it("append adds only the new paragraphs at the end", () => {
    const m = mergeSectionBody(prev, "append", "Empecé en 2015 con fanzines.");
    expect(m).toEqual({ body: `${prev}\n\nEmpecé en 2015 con fanzines.`, added: ["Empecé en 2015 con fanzines."], applied: "append" });
  });

  it("append drops paragraphs that already exist (accents, case, punctuation and bullets ignored)", () => {
    const m = mergeSectionBody(prev, "append", "dibujo para editoriales GALLEGAS\n\nTambién doy talleres.");
    expect(m?.body).toBe(`${prev}\n\nTambién doy talleres.`);
    expect(m?.added).toEqual(["También doy talleres."]);
  });

  it("append of only repeated text is no change", () => {
    expect(mergeSectionBody(prev, "append", "Soy ilustradora en A Coruña")).toBeUndefined();
    expect(mergeSectionBody(prev, "append", "   ")).toBeUndefined();
  });

  it("append that already carries the whole previous body (model sent everything) is a replace", () => {
    const all = `${prev}\n\nY expongo en Vigo.`;
    expect(mergeSectionBody(prev, "append", all)).toEqual({ body: all, added: ["Y expongo en Vigo."], applied: "replace" });
    // Same text, other paragraph breaks: still the whole previous body, word for word.
    const reflowed = "Soy ilustradora en A Coruña. Dibujo para editoriales gallegas. Y expongo en Vigo.";
    expect(mergeSectionBody(prev, "append", reflowed)?.body).toBe(reflowed);
  });

  it("a short previous body inside a longer new paragraph is NOT taken as 'sent everything' (no text is lost)", () => {
    const m = mergeSectionBody("Antes.", "append", "Antes de ilustrar estudié Bellas Artes.");
    expect(m?.body).toBe("Antes.\n\nAntes de ilustrar estudié Bellas Artes.");
  });

  it("append to a section that does not exist yet creates it", () => {
    expect(mergeSectionBody(undefined, "append", "Pinto el mar.")).toEqual({ body: "Pinto el mar.", added: ["Pinto el mar."], applied: "append" });
    expect(mergeSectionBody("  ", "append", "Pinto el mar.")?.body).toBe("Pinto el mar.");
  });

  it("replace rewrites the section; the same text is no change", () => {
    const fixed = "Soy ilustradora en A Coruña.\n\nDibujo para editoriales gallegas y portuguesas.";
    expect(mergeSectionBody(prev, "replace", fixed)).toEqual({ body: fixed, added: ["Dibujo para editoriales gallegas y portuguesas."], applied: "replace" });
    expect(mergeSectionBody(prev, "replace", ` ${prev} `)).toBeUndefined();
  });

  it("a missing mode (older output) is a replace", () => {
    expect(mergeSectionBody(prev, undefined, "Otra cosa.")?.body).toBe("Otra cosa.");
  });

  it("bullets appended after a list join the list; a paragraph after a list starts a new one", () => {
    const list = "Exposiciones:\n- Vigo, 2022";
    expect(mergeSectionBody(list, "append", "- Lugo, 2023\n- Vigo, 2022")?.body).toBe("Exposiciones:\n- Vigo, 2022\n- Lugo, 2023");
    expect(mergeSectionBody(list, "append", "Premio Castelao.")?.body).toBe(`${list}\n\nPremio Castelao.`);
  });

  it("normaliseText ignores accents, case, punctuation and leading bullets", () => {
    expect(normaliseText("- ¡Fotografía, Ourense!")).toBe(normaliseText("fotografia ourense"));
  });
});

describe("section patches in toTurnResult (hand-written LlmTurn, no API)", () => {
  const input = (sections: DossierSection[], text = "también hago grabado") => {
    const newSegment = seg("s1", text);
    return { kind: "creator" as const, profile: blankCreator, sections, transcript: [seg("s0", "antes"), newSegment], newSegment };
  };

  it("the contract still carries the FULL merged body, with provenance kept", () => {
    const r = toTurnResult(input([section("bio", "Soy pintora.")]), patchOut([{ key: "bio", mode: "append", body: "También hago grabado.", sourceSegmentIds: ["s1", "nope"] }]));
    expect(r.sectionUpdates).toHaveLength(1);
    expect(r.sectionUpdates[0]).toMatchObject({ key: "bio", title: "bio", body: "Soy pintora.\n\nTambién hago grabado.", sourceSegmentIds: ["s0", "s1"], status: "draft" });
  });

  it("an append that only repeats is dropped (no update, no flicker)", () => {
    const r = toTurnResult(input([section("bio", "Soy pintora.")]), patchOut([{ key: "bio", mode: "append", body: "soy pintora", sourceSegmentIds: ["s1"] }]));
    expect(r.sectionUpdates).toEqual([]);
  });

  it("an append to a new section creates it, with the new segment as source when the ids are unknown", () => {
    const r = toTurnResult(input([]), patchOut([{ key: "works", mode: "append", body: "- Mar de fondo (2024)", sourceSegmentIds: ["invented"] }]));
    expect(r.sectionUpdates[0]).toMatchObject({ key: "works", body: "- Mar de fondo (2024)", sourceSegmentIds: ["s1"] });
  });

  it("two patches to the same section in one turn both apply, in order", () => {
    const r = toTurnResult(
      input([section("cv", "- Vigo, 2022")]),
      patchOut([
        { key: "cv", mode: "append", body: "- Lugo, 2023", sourceSegmentIds: ["s1"] },
        { key: "cv", mode: "append", body: "- Ourense, 2024", sourceSegmentIds: ["s1"] },
      ]),
    );
    expect(r.sectionUpdates).toHaveLength(1);
    expect(r.sectionUpdates[0].body).toBe("- Vigo, 2022\n- Lugo, 2023\n- Ourense, 2024");
  });

  it("a replace (correction) rewrites the section", () => {
    const r = toTurnResult(input([section("cv", "- Vigo, 2022")], "no, fue en 2023"), patchOut([{ key: "cv", mode: "replace", body: "- Vigo, 2023", sourceSegmentIds: ["s1"] }]));
    expect(r.sectionUpdates[0].body).toBe("- Vigo, 2023");
  });

  it("the fundingNeeds backstop reads only what an append added", () => {
    const prev = section("series", "Busco una residencia en Francia.");
    const r = toTurnResult(
      input([prev], "y quiero aser un fotolibro"),
      patchOut([{ key: "series", mode: "append", body: "Busco una residencia en Francia.\n\nQuiero hacer un fotolibro.", sourceSegmentIds: ["s1"] }]),
    );
    expect(r.sectionUpdates[0].body).toBe("Busco una residencia en Francia.\n\nQuiero hacer un fotolibro.");
    expect(r.profilePatch.fundingNeeds).toEqual(["hacer un fotolibro"]);
  });

  it("the fundingNeeds backstop reads the rewritten paragraphs of a replace", () => {
    const prev = section("series", "Pinto a las rederas.");
    const r = toTurnResult(
      input([prev], "y kiero una beca de produccion"),
      patchOut([{ key: "series", mode: "replace", body: "Pinto a las rederas de Malpica.\n\nQuiero una beca de producción.", sourceSegmentIds: ["s1"] }]),
    );
    expect(r.profilePatch.fundingNeeds?.join(" ")).toMatch(/beca de producción/);
    expect(r.profilePatch.fundingNeeds?.join(" ")).not.toMatch(/rederas/);
  });
});
