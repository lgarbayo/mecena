/**
 * The onboarding turn schema as the API sees it. Optional profilePatch fields made the business schema fail with
 * 400 "Schema is too complex" / "Grammar compilation timed out" (2026-11-14), silently sending every pyme turn to the
 * deterministic extractor. Fields are now required with "not said" sentinels, which toTurnResult strips.
 */
import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { DossierSection, OnboardingTurnInput, ProfileKind } from "@/contracts";
import { blankCreator, FIXTURE_NOW } from "@/fixtures";
import { toTurnResult } from "@/features/onboarding/ai";
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
