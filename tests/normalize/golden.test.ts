/**
 * Golden test for the data standard: the same artist from A Coruña, written the way a user and three
 * different sources would write it, is matched by code against Galicia-wide, state-wide and Madrid-only
 * calls; a pyme never matches a "personas físicas sin actividad económica" call.
 */
import { evaluateEligibility, normalizeBdnsRecord, normalizeCall, normalizeProfile, type CanonicalCall } from "@/features/normalize";
import { makeCall, makeProfile } from "./helpers";

const TODAY = "2026-11-13";

const artist = normalizeProfile(
  makeProfile({
    id: "artist",
    kind: "creator",
    displayName: "Uxía",
    city: "Coruña (A)", // INE style
    province: "La Coruña", // old Spanish name
    region: "Galiza",
    birthYear: 1996,
    disciplines: ["Pintora", "ilustracion", "acuarela"],
  }),
).value;

const pyme = normalizeProfile(
  makeProfile({ id: "pyme", kind: "business", displayName: "Estudio Mar SL", city: "Santiago", legalForm: "sl", employees: 6, cnae: "74.10" }),
).value;

// Calls written in three different vocabularies
const galiciaWide = normalizeCall(
  makeCall({ id: "galicia", scope: "autonomico", region: "Galicia", disciplines: ["Artes plásticas"], eligibility: { residence: ["Comunidad Autónoma de Galicia"], legalForms: ["Personas físicas"] } }),
).value;
const stateWide: CanonicalCall = {
  ...normalizeBdnsRecord({
    codigoBDNS: "999001",
    descripcion: "Ayudas a la creación en artes visuales",
    tiposBeneficiarios: [{ descripcion: "PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA" }],
    regiones: [{ descripcion: "ES - ESPAÑA " }],
    sectores: [{ codigo: "90", descripcion: "Actividades de creación artística y artes escénicas" }],
    presupuestoTotal: 200000,
    fechaFinSolicitud: "2026-12-20",
    anuncios: [{ datPublicacion: "2026-11-02" }],
  }).value,
  id: "estatal",
  beneficiarySource: "explicit",
  age: {},
  requiredDocuments: [],
  criteria: [],
};
const madridOnly = normalizeCall(
  makeCall({ id: "madrid", scope: "autonomico", region: "Madrid", disciplines: ["pintura"], eligibility: { residence: ["ES30 - COMUNIDAD DE MADRID"] } }),
).value;
const sinActividad = normalizeBdnsRecord({
  codigoBDNS: "999002",
  descripcion: "Becas de creación artística",
  tiposBeneficiarios: [{ descripcion: "PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA" }],
  regiones: [{ descripcion: "ES11 - GALICIA" }],
  fechaFinSolicitud: "2026-12-20",
});
const sinActividadCall: CanonicalCall = { ...sinActividad.value, id: "sin-actividad", beneficiarySource: "explicit", age: {}, requiredDocuments: [], criteria: [] };

describe("golden: profile ↔ call comparability", () => {
  it("normalises the messy artist profile to canonical values", () => {
    expect(artist.territory).toBe("mun:15030");
    expect(artist.beneficiaryTypes).toEqual(["persona-fisica"]);
    expect(artist.disciplines).toEqual(["pintura", "ilustracion"]);
  });

  it("artist from A Coruña matches a Galicia-wide call", () => {
    const r = evaluateEligibility(artist, galiciaWide, { today: TODAY });
    expect(r.eligible).toBe(true);
    expect(r.checks.find((c) => c.rule === "territory")).toMatchObject({ result: "pass", reason: "Vives en A Coruña: cumple el requisito de Galicia" });
  });

  it("artist from A Coruña matches a state-wide (BDNS) call", () => {
    const r = evaluateEligibility(artist, stateWide, { today: TODAY });
    expect(r.eligible).toBe(true);
    expect(r.needsConfirmation).toBe(false);
  });

  it("artist from A Coruña does NOT match a Madrid-only call", () => {
    const r = evaluateEligibility(artist, madridOnly, { today: TODAY });
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.rule === "territory")).toMatchObject({ result: "fail", reason: "Exige residencia o sede en Comunidad de Madrid" });
  });

  it("a pyme does NOT match a 'personas físicas sin actividad económica' call, even in its own region", () => {
    const r = evaluateEligibility(pyme, sinActividadCall, { today: TODAY });
    expect(r.checks.find((c) => c.rule === "territory")?.result).toBe("pass");
    expect(r.checks.find((c) => c.rule === "beneficiary")?.result).toBe("fail");
    expect(r.eligible).toBe(false);
    // …while the artist does
    expect(evaluateEligibility(artist, sinActividadCall, { today: TODAY }).eligible).toBe(true);
  });

  it("an autónomo artist facing a persona-física call is kept but asked to confirm", () => {
    const autonomo = normalizeProfile(makeProfile({ kind: "creator", city: "Ferrol", legalForm: "autonomo" })).value;
    const r = evaluateEligibility(autonomo, sinActividadCall, { today: TODAY });
    expect(r.eligible).toBe(true);
    expect(r.needsConfirmation).toBe(true);
  });

  it("closed calls and age limits are decided by code", () => {
    const closed = { ...galiciaWide, deadline: { date: "2026-11-01", estimated: false, method: "explicit-field" as const } };
    expect(evaluateEligibility(artist, closed, { today: TODAY }).eligible).toBe(false);
    const young = { ...galiciaWide, age: { max: 25 } };
    const r = evaluateEligibility(artist, young, { today: TODAY });
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.rule === "age")?.reason).toBe("Edad fuera del rango (hasta 25 años)");
  });

  it("is deterministic", () => {
    expect(evaluateEligibility(artist, galiciaWide, { today: TODAY })).toEqual(evaluateEligibility(artist, galiciaWide, { today: TODAY }));
  });
});
