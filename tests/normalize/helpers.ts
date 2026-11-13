import type { Call, Profile } from "@/contracts/domain";
import { blankCreator, fixtureBusiness, fixtureCreator } from "@/fixtures";

/** A valid Call with sensible defaults; override what the test is about. */
export function makeCall(over: Omit<Partial<Call>, "eligibility"> & { eligibility?: Partial<Call["eligibility"]> } = {}): Call {
  const { eligibility, ...rest } = over;
  return {
    id: "test-call",
    title: "Convocatoria de prueba",
    organizer: "Organismo de prueba",
    type: "subvencion",
    scope: "estatal",
    beneficiaryKinds: ["creator"],
    disciplines: [],
    sectors: [],
    eligibility: { residence: [], legalForms: [], other: [], ...eligibility },
    amountEur: {},
    amountText: "Hasta 6.000 €",
    deadline: "2026-12-15",
    deadlineText: "15 de diciembre de 2026",
    status: "open",
    summary: "",
    requiredDocuments: [],
    criteria: [],
    criteriaSource: "estimated",
    allowedExpenses: [],
    sourceUrl: "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias",
    source: "seed",
    verifiedAt: "2026-11-13",
    ...rest,
  };
}

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return { ...structuredClone(blankCreator), id: "p", ...over };
}

export { fixtureBusiness, fixtureCreator };
