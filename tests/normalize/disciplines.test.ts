import { disciplineAncestors, disciplineFit, disciplinesToCnae, extractDisciplines, normalizeDiscipline } from "@/features/normalize";

describe("normalizeDiscipline", () => {
  it.each([
    ["pintura", ["pintura"]],
    ["Pintura", ["pintura"]],
    ["PINTURA", ["pintura"]],
    ["pintora", ["pintura"]],
    ["óleo", ["pintura"]],
    ["esculturas", ["escultura"]],
    ["Ilustración", ["ilustracion"]],
    ["ilustracion", ["ilustracion"]],
    ["ilustradora", ["ilustracion"]],
    ["fotógrafa", ["fotografia"]],
    ["artes plásticas", ["artes-visuales"]],
    ["Artes Plásticas y Visuales", ["artes-visuales"]],
    ["arte contemporáneo", ["artes-visuales"]],
    ["belas artes", ["artes-visuales"]],
    ["debuxo", ["dibujo"]],
    ["banda deseñada", ["comic"]],
    ["olaría", ["ceramica"]],
    ["encaixe de palillos", ["textil"]],
    ["curtametraxe", ["cine"]],
    ["artes escénicas", ["artes-escenicas"]],
    ["videoxogos", ["videojuegos"]],
    ["xestión cultural", ["gestion-cultural"]],
  ])("%s → %j", (input, ids) => {
    expect(normalizeDiscipline(input).ids).toEqual(ids);
  });

  it("splits lists and conjunctions (es/gl)", () => {
    expect(normalizeDiscipline("pintura, escultura e instalación").ids).toEqual(["pintura", "escultura", "instalacion"]);
    expect(normalizeDiscipline("música e danza").ids).toEqual(["musica", "danza"]);
    expect(normalizeDiscipline("teatro y circo").ids).toEqual(["teatro", "circo"]);
    expect(normalizeDiscipline(["ilustración", "pintura"]).ids).toEqual(["ilustracion", "pintura"]);
    expect(normalizeDiscipline("pintora; grabadora").ids).toEqual(["pintura", "grabado"]);
  });

  it("tolerates small typos but not on short words", () => {
    expect(normalizeDiscipline("fotgrafía").ids).toEqual(["fotografia"]);
    expect(normalizeDiscipline("ilustrasión").ids).toEqual(["ilustracion"]);
    expect(normalizeDiscipline("escultra").ids).toEqual(["escultura"]);
    expect(normalizeDiscipline("pos").ids).toEqual([]);
  });

  it("finds the most specific phrase inside a longer label", () => {
    expect(normalizeDiscipline("cine documental").ids).toEqual(["documental"]);
    expect(normalizeDiscipline("encaje de bolillos tradicional").ids).toEqual(["textil"]);
  });

  it("recognises 'any discipline' wording and reports what it cannot map", () => {
    const any = normalizeDiscipline("todas las disciplinas artísticas");
    expect(any.any).toBe(true);
    expect(any.ids).toEqual([]);
    expect(normalizeDiscipline("calquera disciplina").any).toBe(true);
    const r = normalizeDiscipline("pintura, astrofísica");
    expect(r.ids).toEqual(["pintura"]);
    expect(r.unmapped).toEqual(["astrofísica"]);
  });
});

describe("extractDisciplines (call titles)", () => {
  it("reads disciplines from a BDNS title without typo guessing", () => {
    const t = "Convocatoria de becas para la creación artística en los ámbitos de las artes visuales, de las artes escénicas, de la música";
    expect(extractDisciplines(t).ids.sort()).toEqual(["artes-escenicas", "artes-visuales", "musica"]);
    expect(extractDisciplines("VI Certamen Complutense de Fotografía Naturalista").ids).toEqual(["fotografia"]);
    expect(extractDisciplines("Subvención a cámaras de comercio para digitalización").ids).toEqual([]);
  });
});

describe("hierarchy", () => {
  it("knows parents and CNAE bridges", () => {
    expect(disciplineAncestors("pintura")).toEqual(["pintura", "artes-visuales"]);
    expect(disciplinesToCnae(["fotografia"])).toEqual(["74.20", "90.12"]);
  });

  it("disciplineFit: child of a call discipline fits, broader profile only relates", () => {
    expect(disciplineFit(["pintura"], []).fit).toBe("any");
    expect(disciplineFit(["pintura"], ["pintura", "escultura"]).fit).toBe("exact");
    expect(disciplineFit(["pintura"], ["artes-visuales"])).toEqual({ fit: "within", matched: ["pintura"] });
    expect(disciplineFit(["artes-visuales"], ["fotografia"]).fit).toBe("related");
    expect(disciplineFit(["ilustracion"], ["fotografia"]).fit).toBe("related");
    expect(disciplineFit(["pintura"], ["musica"]).fit).toBe("none");
  });
});
