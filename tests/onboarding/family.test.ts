import { describe, expect, it } from "vitest";
import { isVisualFamily, onboardingFamily } from "@/features/onboarding/family";

describe("onboarding art family helper", () => {
  it.each([
    [["ilustración", "pintura"], "artes-visuales"],
    [["fotografía"], "artes-visuales"],
    [["música"], "musica"],
    [["guitarrista"], "musica"],
    [["jazz"], "musica"],
    [["danza"], "artes-escenicas"],
    [["bailarinas"], "artes-escenicas"],
    [["teatro"], "artes-escenicas"],
    [["circo"], "artes-escenicas"],
    [["cine"], "audiovisual"],
    [["documental"], "audiovisual"],
    [["poesía"], "literatura"],
    [["literatura"], "literatura"],
    [["narrativa"], "literatura"],
    [["diseño gráfico"], "diseno"],
    [["cerámica"], "artesania"],
    [["comisariado"], "gestion-cultural"],
  ])("%j → %s", (disciplines, family) => {
    expect(onboardingFamily(disciplines)).toBe(family);
  });

  it("uses the first discipline that maps and stays undefined for unknown words", () => {
    expect(onboardingFamily(["algo raro", "danza"])).toBe("artes-escenicas");
    expect(onboardingFamily([])).toBeUndefined();
    expect(onboardingFamily(["xyz"])).toBeUndefined();
  });

  it("visual families keep the photograph-your-work step", () => {
    expect(isVisualFamily("artes-visuales")).toBe(true);
    expect(isVisualFamily(undefined)).toBe(true);
    expect(isVisualFamily("musica")).toBe(false);
  });
});
