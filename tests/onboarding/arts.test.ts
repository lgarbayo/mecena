import { describe, expect, it } from "vitest";
import { CreatorSectionKey, type DossierSection, type Profile, type TranscriptSegment } from "@/contracts";
import { blankCreator, fixtureTranscript, FIXTURE_NOW } from "@/fixtures";
import { DOSSIER_LOOK_QUESTION } from "@/features/onboarding/copy";
import { onboardingFamily } from "@/features/onboarding/family";
import { mockOnboardingTurn } from "@/features/onboarding/mock";
import { mergeProfile } from "@/server/store";

const seg = (id: string, text: string): TranscriptSegment => ({ id, text, source: "voice", at: FIXTURE_NOW });

/** Run texts through the mock like the service does, collecting every follow-up question. */
function interview(texts: string[], start: Profile = blankCreator) {
  let profile = structuredClone(start);
  const sections = new Map<string, DossierSection>();
  const transcript: TranscriptSegment[] = [];
  const questions: string[] = [];
  texts.forEach((text, i) => {
    const s = seg(`s${i + 1}`, text);
    transcript.push(s);
    const r = mockOnboardingTurn({ kind: profile.kind, profile, sections: [...sections.values()], transcript, newSegment: s });
    profile = mergeProfile(profile, r.profilePatch);
    for (const u of r.sectionUpdates) sections.set(u.key, u);
    questions.push(r.followUpQuestion ?? "");
  });
  const body = (k: string) => sections.get(k)?.body ?? "";
  return { profile, sections: [...sections.values()], body, questions };
}

describe("onboarding for every art (mock)", () => {
  it("a musician: instrument, own songs, record, concerts", () => {
    const r = interview([
      "Me llamo Iria Souto, soy violinista y compositora de Vigo.",
      "Toco en un cuarteto de cuerda y compongo mis propias canciones sobre el mar.",
      "Grabamos nuestro primer disco en 2024 y hemos tocado en el festival Sinsal.",
      "Quiero grabar un segundo disco y hacer una gira por Galicia.",
      "Estudié en el Conservatorio Superior de Vigo.",
    ]);
    expect(r.profile.displayName).toBe("Iria Souto");
    expect(r.profile.city).toBe("Vigo");
    expect(r.profile.disciplines).toEqual(["música"]);
    expect(onboardingFamily(r.profile.disciplines)).toBe("musica");
    expect(r.profile.fundingNeeds.join(" ")).toMatch(/segundo disco/);
    expect(r.profile.achievements.join(" ")).toMatch(/Sinsal/);
    expect(r.profile.education.join(" ")).toMatch(/Conservatorio/);
    expect(r.body("statement")).toMatch(/canciones sobre el mar/);
    expect(r.body("cv")).toMatch(/primer disco/);
    expect(r.body("series")).toMatch(/gira/);
    for (const s of r.sections) expect(CreatorSectionKey.options).toContain(s.key);
    // Follow-ups talk about records and touring, never about pictures or exhibitions.
    expect(r.questions[0]).toMatch(/grabar|girar|disco/);
    for (const q of r.questions) expect(q).not.toMatch(/expuesto|cuadro|técnica|serie/i);
  });

  it("a dancer: company, pieces, premieres; a venue is not a discipline", () => {
    const r = interview([
      "Me llamo Lucía Prado, soy bailarina de danza contemporánea en Madrid.",
      "Tengo una compañía con dos bailarinas más y creamos piezas sobre el cuerpo y el trabajo.",
      "Estrenamos nuestra última pieza en el Teatro Pradillo.",
    ]);
    expect(r.profile.displayName).toBe("Lucía Prado");
    expect(r.profile.city).toBe("Madrid");
    expect(r.profile.disciplines).toEqual(["danza"]);
    expect(onboardingFamily(r.profile.disciplines)).toBe("artes-escenicas");
    expect(r.body("statement")).toMatch(/piezas sobre el cuerpo/);
    expect(r.body("cv")).toMatch(/Estrenamos/);
    expect(r.questions[0]).toMatch(/pieza/);
    for (const q of r.questions) expect(q).not.toMatch(/expuesto|cuadro|técnica/i);
  });

  it("a writer: books, publisher, prizes; follow-ups about books", () => {
    const r = interview(["Me llamo Xoán Lema, soy escritor y poeta de Lugo.", "He publicado dos poemarios con la editorial Galaxia."]);
    expect(r.profile.disciplines).toEqual(expect.arrayContaining(["literatura", "poesía"]));
    expect(onboardingFamily(r.profile.disciplines)).toBe("literatura");
    expect(r.profile.achievements.join(" ")).toMatch(/editorial Galaxia/);
    expect(r.body("bio")).toMatch(/escritor y poeta/);
    expect(r.body("cv")).toMatch(/poemarios/);
    expect(r.questions[0]).toMatch(/libro/);
    const more = interview(["Quiero terminar una novela sobre la emigración."], r.profile);
    expect(more.profile.fundingNeeds.join(" ")).toMatch(/novela/);
  });

  it("asks the optional dossier-look question once, when the core profile is complete", () => {
    const r = interview([
      "Me llamo Iria Souto, soy violinista de Vigo.",
      "Quiero grabar un disco.",
      "Grabamos un EP en 2023.",
      "Toqué en la sala Capitol.",
    ]);
    expect(r.questions.filter((q) => q === DOSSIER_LOOK_QUESTION)).toHaveLength(1);
    expect(r.questions[1]).toBe(DOSSIER_LOOK_QUESTION);
    // Not blocking: ignoring it simply moves on.
    expect(r.questions[2]).not.toBe(DOSSIER_LOOK_QUESTION);
  });

  it("the dossier-look answer only stays in the transcript", () => {
    const r = interview([
      "Me llamo Xoán Lema, soy poeta de Lugo.",
      "Quiero terminar una novela.",
      "Me lo imagino sobrio, con mucho blanco y buena tipografía.",
    ]);
    const all = r.sections.map((s) => s.body).join(" ");
    expect(all).not.toMatch(/sobrio/);
    expect(JSON.stringify(r.profile)).not.toMatch(/sobrio/);
  });

  it("does not ask the dossier-look question if they already described their dossier", () => {
    const r = interview(["Mi dossier lo quiero sobrio. Me llamo Xoán Lema, soy poeta de Lugo.", "Quiero terminar una novela."]);
    expect(r.questions).not.toContain(DOSSIER_LOOK_QUESTION);
  });

  it("the visual-arts fixture still speaks about series", () => {
    const r = interview(fixtureTranscript.map((s) => s.text));
    expect(onboardingFamily(r.profile.disciplines)).toBe("artes-visuales");
    expect(r.questions).toContain(DOSSIER_LOOK_QUESTION);
  });
});
