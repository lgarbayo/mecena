/**
 * Stable test fixtures (scaffold-owned). Tests and mocks import these; do not edit them in a WP.
 * The polished demo seed lives in data/demo/ (WP-11) and the real calls in data/calls/ (WP-05).
 * Fixture calls are FICTIONAL (ids start with "fixture-") and must never be shown as real.
 */
import type { Application, Call, Db, Profile, TranscriptSegment, Work } from "@/contracts";

export const FIXTURE_NOW = "2026-11-13T21:00:00.000Z";
export const DEMO_CREATOR_ID = "demo-creator";
export const DEMO_BUSINESS_ID = "demo-business";
export const DEMO_APP_USER_ID = "mecena-demo-0001";

/** Creator profile at the start of the live demo: almost empty, onboarding fills it. */
export const blankCreator: Profile = {
  id: DEMO_CREATOR_ID,
  kind: "creator",
  beneficiaryTypes: [],
  displayName: "",
  disciplines: [],
  bio: "",
  statement: "",
  achievements: [],
  education: [],
  links: [],
  fundingNeeds: [],
  languages: [],
  updatedAt: FIXTURE_NOW,
};

/** Business profile a new account starts from when it switches to Pyme: empty, onboarding fills it. */
export const blankBusiness: Profile = {
  ...blankCreator,
  id: DEMO_BUSINESS_ID,
  kind: "business",
};

/** Creator profile after onboarding (used by tests of matching, dossier, drafting, jury). */
export const fixtureCreator: Profile = {
  ...blankCreator,
  displayName: "Antía Varela",
  territory: "mun:15030",
  beneficiaryTypes: ["persona-fisica"],
  city: "A Coruña",
  province: "A Coruña",
  region: "Galicia",
  birthYear: 1994,
  disciplines: ["ilustración", "pintura"],
  bio: "Ilustradora y pintora coruñesa. Trabaja con acuarela y tinta sobre la memoria de las mujeres del mar.",
  statement:
    "Pinto a las rederas y mariscadoras de mi familia porque su trabajo sostiene la costa y casi nunca sale en los libros.",
  achievements: ["Exposición colectiva en el Kiosko Alfonso (2024)", "Finalista del Certamen de Ilustración de Ourense (2023)"],
  education: ["Grado en Bellas Artes, Universidade de Vigo"],
  fundingNeeds: ["producir una serie de 12 acuarelas grandes", "editar un fanzine", "tiempo para trabajar"],
  projectIdea: "Serie 'Redeiras': 12 acuarelas y un fanzine sobre las rederas de Malpica.",
  languages: ["gallego", "castellano", "inglés"],
};

export const fixtureBusiness: Profile = {
  id: DEMO_BUSINESS_ID,
  kind: "business",
  displayName: "Cerámica Mareira",
  territory: "mun:27028",
  beneficiaryTypes: ["autonomo"],
  city: "Lugo",
  province: "Lugo",
  region: "Galicia",
  legalForm: "autonomo",
  cnae: "2341",
  sector: "artesanía / cerámica",
  employees: 1,
  foundedYear: 2019,
  annualRevenueEur: 48000,
  disciplines: [],
  bio: "Taller de cerámica artesanal en Lugo. Vende en ferias y por Instagram.",
  statement: "Queremos vender online a toda Europa sin perder el trato de taller.",
  achievements: ["Carta Artesana de Galicia", "Pedidos para 3 restaurantes de Santiago"],
  education: [],
  links: ["https://instagram.com/ceramicamareira"],
  fundingNeeds: ["tienda online", "contratar a una persona", "horno nuevo"],
  projectIdea: "Digitalizar la venta con una tienda online y contratar a una ayudante a media jornada.",
  languages: ["gallego", "castellano"],
  updatedAt: FIXTURE_NOW,
};

export const fixtureTranscript: TranscriptSegment[] = [
  { id: "seg-1", source: "voice", at: FIXTURE_NOW, text: "Me llamo Antía Varela, soy ilustradora y pintora de A Coruña." },
  {
    id: "seg-2",
    source: "voice",
    at: FIXTURE_NOW,
    text: "Pinto a las rederas y mariscadoras de mi familia, porque su trabajo sostiene la costa y casi nunca sale en los libros.",
  },
  {
    id: "seg-3",
    source: "voice",
    at: FIXTURE_NOW,
    text: "Quiero hacer una serie de doce acuarelas grandes y un fanzine sobre las rederas de Malpica.",
  },
];

export const fixtureWorks: Work[] = [
  {
    id: "work-1",
    profileId: DEMO_CREATOR_ID,
    imageUrl: "/demo/works/redeira-1.svg",
    sheet: { title: "Redeira I", year: 2025, technique: "acuarela sobre papel", dimensions: "56 x 76 cm", series: "Redeiras", concept: "Mi abuela cosiendo redes en el puerto de Malpica." },
    sheetSource: "seed",
    confirmed: true,
    order: 0,
    createdAt: FIXTURE_NOW,
  },
  {
    id: "work-2",
    profileId: DEMO_CREATOR_ID,
    imageUrl: "/demo/works/marisqueo.svg",
    sheet: { title: "Marea baixa", year: 2024, technique: "tinta y acuarela", dimensions: "30 x 40 cm", series: "Redeiras" },
    sheetSource: "seed",
    confirmed: true,
    order: 1,
    createdAt: FIXTURE_NOW,
  },
];

const fixtureCallBase = {
  disciplines: [] as string[],
  sectors: [] as string[],
  amountEur: {},
  opensAt: "2026-11-01",
  status: "open" as const,
  allowedExpenses: [] as string[],
  source: "seed" as const,
  verifiedAt: "2026-11-13",
  criteriaSource: "bases" as const,
  beneficiaryTypes: [], // derived by normalizeCall from legalForms / beneficiaryKinds
  territories: [], // derived by normalizeCall from eligibility.residence
};

export const fixtureCalls: Call[] = [
  {
    ...fixtureCallBase,
    id: "fixture-beca-artes-plasticas",
    title: "[FIXTURE] Beca de creación en artes plásticas",
    organizer: "Diputación ficticia",
    type: "beca",
    scope: "provincial",
    region: "A Coruña",
    beneficiaryKinds: ["creator"],
    disciplines: ["pintura", "ilustración", "escultura", "fotografía"],
    eligibility: { minAge: 18, maxAge: 35, residence: ["A Coruña"], legalForms: [], other: ["Persona física"] },
    amountEur: { max: 9000 },
    amountText: "9.000 €",
    deadline: "2026-12-05",
    deadlineText: "5 de diciembre de 2026",
    summary: "Una beca de 9.000 € para desarrollar un proyecto artístico durante 9 meses.",
    requiredDocuments: ["Memoria del proyecto", "Dossier artístico (máx. 10 imágenes)", "CV", "DNI", "Certificados de Hacienda y Seguridad Social"],
    dossierRequirements: { maxImages: 10, maxFileMb: 5, format: "PDF" },
    criteria: [
      { id: "calidad", name: "Calidad artística de la trayectoria", description: "Calidad del dossier y la trayectoria", maxPoints: 40 },
      { id: "proyecto", name: "Interés y viabilidad del proyecto", description: "Coherencia, calendario y presupuesto", maxPoints: 40 },
      { id: "territorio", name: "Vinculación con el territorio", description: "Relación del proyecto con la provincia", maxPoints: 20 },
    ],
    allowedExpenses: ["materiales", "producción", "honorarios propios", "edición"],
    sourceUrl: "https://example.org/fixture/beca-artes-plasticas",
  },
  {
    ...fixtureCallBase,
    id: "fixture-premio-ilustracion",
    title: "[FIXTURE] Premio de ilustración",
    organizer: "Fundación ficticia",
    type: "premio",
    scope: "privado",
    beneficiaryKinds: ["creator"],
    disciplines: ["ilustración"],
    eligibility: { residence: [], legalForms: [], other: [] },
    amountEur: { max: 3000 },
    amountText: "3.000 €",
    deadline: "2027-01-15",
    deadlineText: "15 de enero de 2027",
    summary: "Premio a un proyecto de libro ilustrado inédito.",
    requiredDocuments: ["3 ilustraciones", "Sinopsis", "CV"],
    criteria: [
      { id: "originalidad", name: "Originalidad", description: "", maxPoints: 50 },
      { id: "tecnica", name: "Calidad técnica", description: "", maxPoints: 50 },
    ],
    sourceUrl: "https://example.org/fixture/premio-ilustracion",
  },
  {
    ...fixtureCallBase,
    id: "fixture-digitalizacion-pymes",
    title: "[FIXTURE] Ayudas a la digitalización de pequeños negocios",
    organizer: "Agencia ficticia",
    type: "subvencion",
    scope: "autonomico",
    region: "Galicia",
    beneficiaryKinds: ["business"],
    eligibility: { residence: ["Galicia"], legalForms: ["autonomo", "sl"], maxEmployees: 9, other: [] },
    amountEur: { max: 6000 },
    amountText: "Hasta 6.000 € (80 %)",
    deadline: "2026-12-20",
    deadlineText: "20 de diciembre de 2026",
    summary: "Subvención del 80 % para tienda online, software de gestión y ciberseguridad.",
    requiredDocuments: ["Memoria técnica", "Presupuestos de proveedores", "Certificados de Hacienda y Seguridad Social"],
    criteria: [
      { id: "impacto", name: "Impacto en la competitividad", description: "", maxPoints: 50 },
      { id: "viabilidad", name: "Viabilidad técnica y económica", description: "", maxPoints: 30 },
      { id: "empleo", name: "Creación de empleo", description: "", maxPoints: 20 },
    ],
    allowedExpenses: ["software", "tienda online", "consultoría", "equipos informáticos"],
    sourceUrl: "https://example.org/fixture/digitalizacion",
  },
];

export const fixtureApplication: Application = {
  id: "app-fixture-1",
  profileId: DEMO_CREATOR_ID,
  callId: "fixture-beca-artes-plasticas",
  version: 1,
  status: "draft",
  sections: [
    { key: "memoria", title: "Memoria del proyecto", body: "Redeiras es una serie de 12 acuarelas sobre las rederas de Malpica.", sourceSegmentIds: ["seg-3"] },
    { key: "statement", title: "Declaración artística", body: "Pinto a las rederas y mariscadoras de mi familia.", sourceSegmentIds: ["seg-2"] },
  ],
  budget: [
    { concept: "Papel y pigmentos", amountEur: 1200, expenseType: "materiales" },
    { concept: "Impresión del fanzine", amountEur: 1800, expenseType: "edición" },
  ],
  checklist: [
    { item: "Memoria del proyecto", done: true },
    { item: "Certificado de estar al corriente con Hacienda", done: false },
  ],
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
};

/**
 * Default DB when no data/demo/seed.json exists. The two demo profiles have no owner, so no account can reach
 * them (tests claim them with tests/helpers.ts loginDemo); every new account gets its own blank profiles.
 */
export function defaultDb(): Db {
  return {
    meta: { activeProfileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID },
    users: [],
    sessions: [],
    inviteCodes: [],
    mcpTokens: [],
    profiles: [structuredClone(blankCreator), structuredClone(fixtureBusiness)],
    transcripts: [],
    works: [],
    dossiers: [],
    applications: [],
    juryScores: [],
    invoices: [],
    justifications: [],
    entitlements: [],
    usage: [],
    matchCache: [],
    variantCache: [],
    organizations: [],
    memberships: [],
  };
}
