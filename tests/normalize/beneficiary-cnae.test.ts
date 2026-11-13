import {
  beneficiaryCheck,
  cnaeCheck,
  mapProfileKind,
  normalizeBeneficiaries,
  normalizeBeneficiary,
  normalizeCnae,
  profileBeneficiaryTypes,
  profileKindsFor,
} from "@/features/normalize";
import { fixtureBusiness, fixtureCreator } from "./helpers";

describe("normalizeBeneficiary", () => {
  it("maps the exact BDNS catalogue strings, ids and objects", () => {
    expect(normalizeBeneficiary("PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA").ids).toEqual(["persona-fisica"]);
    expect(normalizeBeneficiary("pyme y personas fisicas que desarrollan actividad economica").ids).toEqual(["autonomo", "pyme"]);
    expect(normalizeBeneficiary({ descripcion: "PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA" }).ids).toEqual(["entidad-sin-animo-lucro", "entidad-publica"]);
    expect(normalizeBeneficiary(4).ids).toEqual(["gran-empresa"]);
    const none = normalizeBeneficiary("SIN INFORMACION ESPECIFICA");
    expect(none).toEqual({ ids: [], unknown: true, source: "bdns" });
  });

  it("maps free text from bases (es/gl, plurals, legal forms)", () => {
    expect(normalizeBeneficiary("autónomos").ids).toEqual(["autonomo"]);
    expect(normalizeBeneficiary("trabajadoras autónomas").ids).toEqual(["autonomo"]);
    expect(normalizeBeneficiary("Pequenas e medianas empresas").ids).toEqual(["pyme"]);
    expect(normalizeBeneficiary("SL").ids).toEqual(["pyme"]);
    expect(normalizeBeneficiary("Asociaciones culturales sin ánimo de lucro").ids).toContain("entidad-sin-animo-lucro");
    expect(normalizeBeneficiary("colectivos artísticos").ids).toEqual(["colectivo"]);
    expect(normalizeBeneficiary("entidad-sin-animo-lucro").ids).toEqual(["entidad-sin-animo-lucro"]);
    expect(normalizeBeneficiaries(["autonomo", "sl"]).ids).toEqual(["autonomo", "pyme"]);
  });

  it("maps to ProfileKind (autónomo is both)", () => {
    expect(mapProfileKind("persona-fisica")).toEqual(["creator"]);
    expect(mapProfileKind("autonomo")).toEqual(["creator", "business"]);
    expect(mapProfileKind("pyme")).toEqual(["business"]);
    expect(profileKindsFor(["autonomo", "pyme"])).toEqual(["creator", "business"]);
    expect(profileKindsFor(["persona-fisica"])).toEqual(["creator"]);
  });
});

describe("profile beneficiary types and compatibility", () => {
  it("derives types from kind + legal form + EU SME limits", () => {
    expect(profileBeneficiaryTypes(fixtureCreator)).toEqual(["persona-fisica"]);
    expect(profileBeneficiaryTypes(fixtureBusiness)).toEqual(["autonomo"]);
    expect(profileBeneficiaryTypes({ kind: "business", legalForm: "sl", employees: 12 })).toEqual(["pyme"]);
    expect(profileBeneficiaryTypes({ kind: "business", legalForm: "sa", employees: 400 })).toEqual(["gran-empresa"]);
    expect(profileBeneficiaryTypes({ kind: "business", legalForm: "asociacion" })).toEqual(["entidad-sin-animo-lucro"]);
    expect(profileBeneficiaryTypes({ kind: "business" })).toEqual([]);
  });

  it("checks compatibility: pyme ≠ persona física; autónomo vs persona física = confirm", () => {
    expect(beneficiaryCheck(["pyme"], ["persona-fisica"])).toBe("fail");
    expect(beneficiaryCheck(["persona-fisica"], ["autonomo", "pyme"])).toBe("fail");
    expect(beneficiaryCheck(["autonomo"], ["autonomo", "pyme"])).toBe("pass");
    expect(beneficiaryCheck(["autonomo"], ["persona-fisica"])).toBe("unknown");
    expect(beneficiaryCheck([], ["pyme"])).toBe("unknown");
    expect(beneficiaryCheck(["pyme"], [])).toBe("unknown");
  });
});

describe("CNAE", () => {
  it("normalises sections, divisions, classes, BDNS objects and CNAE-2009 codes", () => {
    expect(normalizeCnae("S").ref).toEqual({ section: "S" });
    expect(normalizeCnae("90").ref).toEqual({ section: "S", code: "90" });
    expect(normalizeCnae("90.12").ref).toEqual({ section: "S", code: "90.12" });
    expect(normalizeCnae({ codigo: "85.4", descripcion: "Educación terciaria" }).ref).toEqual({ section: "Q", code: "85.4" });
    expect(normalizeCnae("ACTIVIDADES ARTÍSTICAS, DEPORTIVAS Y DE ENTRETENIMIENTO").ref).toEqual({ section: "S" });
    expect(normalizeCnae("2341")).toEqual({ ref: { section: "C", code: "23.41" }, legacy: true });
    expect(normalizeCnae("9003")).toEqual({ ref: { section: "S", code: "90.1" }, legacy: true });
    expect(normalizeCnae("zz").ref).toBeNull();
  });

  it("checks sector containment", () => {
    const ceramics = normalizeCnae("23.41").ref;
    expect(cnaeCheck(ceramics, [])).toBe("pass");
    expect(cnaeCheck(ceramics, [{ section: "C" }])).toBe("pass");
    expect(cnaeCheck(ceramics, [{ section: "C", code: "23" }])).toBe("pass");
    expect(cnaeCheck(ceramics, [{ section: "S", code: "90" }])).toBe("fail");
    expect(cnaeCheck({ section: "S", code: "90" }, [{ section: "S", code: "90.12" }])).toBe("unknown");
    expect(cnaeCheck(null, [{ section: "S" }])).toBe("unknown");
  });
});
