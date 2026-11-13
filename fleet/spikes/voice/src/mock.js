// Deterministic mock of the Claude calls, used when no ANTHROPIC_API_KEY is available.
// The mock extractor is an "oracle": a hand-written list of the ops a good model should emit
// for each scenario. On each call it returns the ops whose source quote is already present in
// the transcript and that it has not returned before, so the incremental pipeline (debounce,
// validation, corrections, dirty sections, dossier refresh) runs exactly as with the real API.
// Latency is simulated from the request/response size and is NOT a measurement.

import { normalize } from "./profile.js";
import { FIELDS, DOSSIER_SECTIONS } from "./schemas.js";

const o = (op, field, key, value, source, { year = "", place = "", detail = "" } = {}) => ({
  op, field, key, value, year, place, detail, source,
});

export const ORACLE = {
  painter: [
    o("set", "name", "", "Uxía Ferreiro", "me llamo uxía ferreiro y soy pintora"),
    o("set", "discipline", "", "Pintura", "me llamo uxía ferreiro y soy pintora"),
    o("set", "origin", "", "Monforte de Lemos", "nací en monforte de lemos"),
    o("set", "location", "", "O Corgo (Lugo)", "vivo en una aldea cerca de lugo en o corgo"),
    o("add", "techniques", "oleo", "Óleo sobre lienzo de gran formato", "trabajo sobre todo óleo sobre lienzo de gran formato"),
    o("add", "techniques", "pigmentos", "Pigmentos naturales de tierras del río Miño", "pigmentos naturales que preparo yo misma con tierras del río miño"),
    o("add", "themes", "paisaje-rural", "Memoria del paisaje rural", "me interesa es la memoria del paisaje rural"),
    o("add", "themes", "abandono", "Abandono del campo gallego", "el abandono del campo gallego cómo el monte se queda vacío"),
    o("set", "practice", "", "Pintura sobre la memoria del paisaje rural y el abandono del campo gallego", "lo que me interesa es la memoria del paisaje rural y el abandono del campo gallego"),
    o("add", "series", "terra-queimada", "Terra queimada", "mi serie más importante se llama terra queimada son 14 cuadros sobre los incendios de 2017", { detail: "14 cuadros sobre los incendios de 2017 en Galicia" }),
    o("add", "exhibitions", "terra-queimada-museo-lugo", "Terra queimada (individual)", "la expuse en el museo provincial de lugo en 2022", { year: "2022", place: "Museo Provincial de Lugo" }),
    o("update", "exhibitions", "terra-queimada-museo-lugo", "Terra queimada (individual)", "no perdona fue en 2023 en 2022 estaba todavía pintándola", { year: "2023", place: "Museo Provincial de Lugo" }),
    o("add", "exhibitions", "colectiva-seoane", "Exposición colectiva", "estuve en una colectiva en la fundación luis seoane en a coruña", { place: "Fundación Luis Seoane, A Coruña" }),
    o("add", "education", "bellas-artes", "Bellas Artes", "estudié bellas artes en pontevedra en la universidad de vigo", { place: "Universidad de Vigo (Pontevedra)" }),
    o("add", "awards", "accesit-diputacion", "Accésit, Premio de Pintura de la Diputación de Lugo", "en 2019 me dieron un accésit en el premio de pintura de la diputación de lugo", { year: "2019" }),
    // Injected hallucination: the quote is not in the transcript, so validation must reject it.
    { ...o("add", "awards", "premio-nacional", "Premio Nacional de Artes Plásticas", "me dieron el premio nacional de artes plásticas", { year: "2021" }), injected: true },
    o("add", "series", "mujeres-aldeas", "Serie nueva sobre las mujeres que sostienen las aldeas", "quiero empezar una serie nueva sobre las mujeres que sostienen las aldeas retratos de vecinas mías", { detail: "retratos de vecinas; en preparación" }),
    o("set", "goals", "", "Ayudas para la producción de la nueva serie y para exponer fuera de Galicia", "busco ayudas para la producción y para poder exponer fuera de galicia"),
  ],
  illustrator: [
    o("set", "name", "", "Daniel Okafor", "buenas soy daniel okafor ilustrador vivo en valencia"),
    o("set", "discipline", "", "Ilustración", "buenas soy daniel okafor ilustrador vivo en valencia"),
    o("set", "location", "", "Valencia", "ilustrador vivo en valencia aunque me crié en vigo"),
    o("set", "origin", "", "Vigo (se crió allí)", "aunque me crié en vigo"),
    o("set", "practice", "", "Álbum ilustrado infantil e ilustración editorial para prensa", "hago sobre todo álbum ilustrado infantil y algo de ilustración editorial para prensa"),
    o("add", "techniques", "digital", "Digital (Procreate)", "trabajo en digital con procreate"),
    o("add", "techniques", "gouache", "Gouache y lápices de colores", "cada vez más con gouache y lápices de colores porque me gusta que se note la mano"),
    o("add", "publications", "faro-de-papel", "Editorial Faro de Papel", "he publicado 6 álbumes con editorial faro de papel", { detail: "6 álbumes publicados" }),
    o("update", "publications", "faro-de-papel", "Editorial Faro de Papel", "bueno 7 si cuento el que sale en marzo", { detail: "7 álbumes, contando el que sale en marzo" }),
    o("add", "publications", "abuela-gaviotas", "La abuela que hablaba con las gaviotas", "el último se llama la abuela que hablaba con las gaviotas es de 2024", { year: "2024" }),
    o("add", "awards", "finalista-alicante", "Finalista, Premio de Álbum Ilustrado Ciudad de Alicante", "quedó finalista en el premio de álbum ilustrado ciudad de alicante", { detail: "con La abuela que hablaba con las gaviotas" }),
    o("add", "publications", "mar-de-fondo", "Revista Mar de Fondo (portadas mensuales)", "colaboro cada mes con la revista mar de fondo haciendo las portadas"),
    o("add", "series", "la-otra-orilla", "La otra orilla (novela gráfica)", "se llama la otra orilla y llevo unas 40 páginas abocetadas", { detail: "sobre el viaje de su padre de Lagos a Vigo en los 80; 40 páginas abocetadas" }),
    o("add", "themes", "migracion", "Migración familiar", "una novela gráfica sobre el viaje de mi padre desde lagos hasta vigo en los años 80"),
    o("add", "education", "bbaa-upv", "Bellas Artes", "estudié bellas artes en la politécnica de valencia", { place: "Universitat Politècnica de València" }),
    o("add", "education", "master-massana", "Máster de Ilustración", "un máster de ilustración en la escola massana en barcelona", { place: "Escola Massana, Barcelona" }),
    o("set", "goals", "", "Beca de creación para dedicarse 6 meses a la novela gráfica", "una beca de creación para poder dedicarme 6 meses solo a la novela gráfica"),
    o("set", "website", "", "@dani.dibuja (Instagram)", "mi instagram es arroba dani punto dibuja"),
  ],
  business: [
    o("set", "contact_name", "", "Marta Castro", "hola soy marta castro y con mi hermana"),
    o("set", "activity", "", "Conservera artesanal", "tenemos una conservera artesanal en boiro"),
    o("set", "location", "", "Boiro", "tenemos una conservera artesanal en boiro"),
    o("set", "business_name", "", "Conservas da Ría", "se llama conservas da ría es una sociedad limitada"),
    o("set", "legal_form", "", "Sociedad limitada", "es una sociedad limitada que montamos en 2019"),
    o("set", "founded_year", "", "2019", "una sociedad limitada que montamos en 2019"),
    o("add", "products", "conservas", "Conservas de pescado y marisco de la ría de Arousa en aceite de oliva", "hacemos conservas de pescado y marisco de la ría de arousa en aceite de oliva"),
    o("add", "products", "mejillon", "Mejillón, sardinilla y berberecho", "sobre todo mejillón sardinilla y berberecho"),
    o("set", "employees", "", "4 personas", "somos 4 personas mi hermana lleva la producción"),
    o("add", "team", "hermana", "Hermana de Marta (producción)", "mi hermana lleva la producción"),
    o("add", "team", "marta", "Marta Castro (comercial)", "yo llevo la parte comercial"),
    o("add", "team", "operarias", "Dos operarias", "y tenemos dos operarias"),
    o("set", "employees", "", "5 personas (desde septiembre)", "bueno 5 desde septiembre que entró una chica para la tienda online"),
    o("add", "team", "tienda-online", "Responsable de tienda online (desde septiembre)", "entró una chica para la tienda online"),
    o("add", "markets", "gourmet", "Tiendas gourmet de toda España", "vendemos a tiendas gourmet de toda españa"),
    o("add", "markets", "web", "Venta online por la web (desde hace un año)", "desde hace un año también por la web"),
    o("set", "revenue", "", "Unos 280.000 € el año pasado", "el año pasado facturamos unos 280000 euros"),
    o("add", "certifications", "galicia-calidade", "Sello Galicia Calidade", "tenemos el sello galicia calidade"),
    o("add", "projects", "descartes-udc", "Aprovechamiento de descartes de la pesca", "en 2022 hicimos un proyecto con la universidade da coruña para aprovechar los descartes de la pesca", { year: "2022", place: "Universidade da Coruña" }),
    o("add", "tools", "excel-papel", "Pedidos y stock con Excel y papel", "los pedidos y el stock los llevamos todo con excel y papel"),
    o("set", "goals", "", "Digitalizar pedidos y stock y empezar a exportar a Francia", "queremos digitalizar eso y empezar a exportar a francia"),
  ],
};

const ASK = {
  creator: [
    ["discipline", "¿A qué te dedicas: pintura, ilustración, fotografía…?"],
    ["location", "¿Desde dónde trabajas?"],
    ["series", "¿Cuál es tu serie o proyecto más importante?"],
    ["exhibitions", "¿Dónde has expuesto o publicado últimamente?"],
    ["goals", "¿Qué te gustaría financiar ahora?"],
  ],
  business: [
    ["activity", "¿A qué se dedica tu negocio?"],
    ["location", "¿Dónde está la empresa?"],
    ["employees", "¿Cuántas personas sois?"],
    ["founded_year", "¿Desde qué año funcionáis?"],
    ["goals", "¿Qué os gustaría financiar ahora?"],
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Rough model of a fast structured-output call: base + input reading + output generation.
const simulatedLatency = (inChars, outChars) => Math.round(450 + inChars / 40 + outChars * 2.2);

export function createMockLLM(scenarioId, { latencyScale = 1 } = {}) {
  const emitted = new Set();
  return {
    mock: true,
    async extract({ mode, transcript, state }) {
      const tnorm = normalize(transcript);
      const ops = [];
      for (const [i, op] of (ORACLE[scenarioId] ?? []).entries()) {
        if (emitted.has(i)) continue;
        // The injected hallucination is emitted together with the op just before it.
        const probe = op.injected ? ORACLE[scenarioId][i - 1].source : op.source;
        if (!tnorm.includes(normalize(probe))) continue;
        emitted.add(i);
        ops.push(op);
      }
      const has = (f) => state.fields[f] || Object.keys(state.lists[f] ?? {}).length || ops.some((x) => x.field === f);
      const ask_next = (ASK[mode].find(([f]) => !has(f)) ?? [, ""])[1];
      const out = JSON.stringify({ ops, ask_next });
      const latencyMs = simulatedLatency(transcript.length + JSON.stringify(state).length, out.length);
      await sleep(latencyMs * latencyScale);
      return { ops, ask_next, latencyMs, usage: { input_tokens: 0, output_tokens: 0 } };
    },

    async dossier({ mode, state, sections }) {
      const sectionsOut = sections.map((id) => mockSection(mode, id, state));
      const out = JSON.stringify(sectionsOut);
      const latencyMs = simulatedLatency(JSON.stringify(state).length, out.length);
      await sleep(latencyMs * latencyScale);
      return { sections: sectionsOut, latencyMs, usage: { input_tokens: 0, output_tokens: 0 } };
    },

    async sheet() {
      const sheet = MOCK_SHEET;
      const latencyMs = simulatedLatency(600, JSON.stringify(sheet).length);
      await sleep(latencyMs * latencyScale);
      return { sheet, latencyMs, usage: { input_tokens: 0, output_tokens: 0 } };
    },

    async imageNotes() {
      return { notes: null, latencyMs: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
  };
}

// Template-based dossier: deterministic, stitched from the profile's own quotes.
function mockSection(mode, id, state) {
  const F = state.fields;
  const L = (f) => Object.values(state.lists[f] ?? {});
  const val = (f) => F[f]?.value ?? "";
  const line = (it) => `- ${[it.year, it.title, it.place, it.detail].filter(Boolean).join(" · ")}`;
  const missing = Object.entries(FIELDS[mode])
    .filter(([f, s]) => s.section === id && !(F[f] || L(f).length))
    .map(([, s]) => s.label.toLowerCase());
  let body = "";
  if (id === "bio") body = [val("name") && `${val("name")}${val("origin") ? ` (${val("origin")})` : ""}`, val("discipline"), val("location") && `vive y trabaja en ${val("location")}`, L("education").map((e) => `formación en ${e.title}`).join(", ")].filter(Boolean).join(". ");
  if (id === "statement") body = [F.practice?.source, ...L("techniques").map((t) => t.source), ...L("themes").map((t) => t.source), F.goals?.source].filter(Boolean).join(". ");
  if (id === "series" || id === "projects") body = L(id === "series" ? "series" : "projects").map(line).concat(id === "projects" && F.goals ? [`Siguiente paso: ${val("goals")}`] : []).join("\n");
  if (id === "cv") body = ["education", "exhibitions", "awards", "residencies", "publications"].flatMap((f) => (L(f).length ? [`**${FIELDS.creator[f].label}**`, ...L(f).map(line)] : [])).join("\n");
  if (id === "activity") body = [val("business_name") && `${val("business_name")} (${val("legal_form") || "forma jurídica sin indicar"}), ${val("activity")} en ${val("location")} desde ${val("founded_year") || "?"}`, ...L("products").map((p) => p.title), ...L("markets").map((m) => m.title), val("revenue") && `Facturación: ${val("revenue")}`].filter(Boolean).join(". ");
  if (id === "team") body = [val("employees"), ...L("team").map(line)].filter(Boolean).join("\n");
  return {
    id,
    title: DOSSIER_SECTIONS[mode][id],
    body,
    quotes_used: [],
    missing,
  };
}

const f = (value, source, origin = "voz") => ({ value, source, origin });
export const MOCK_SHEET = {
  title: f("A última fía", "esta se llama a última fía"),
  year: f("2024", "bueno el año en realidad es 2024 la terminé en enero"),
  technique: f("Óleo y pigmento de tierra", "óleo y pigmento de tierra sobre lienzo"),
  support: f("Lienzo", "óleo y pigmento de tierra sobre lienzo"),
  dimensions: { height_cm: 130, width_cm: 97, depth_cm: 0, source: "mide 130 por 97" },
  series: f("Serie sobre las mujeres de la aldea (sin título aún)", "es la primera de la serie nueva de las mujeres de la aldea"),
  concept: f(
    "Es mi vecina Carmen hilando en la cocina. Quería que se viera que el trabajo de ellas es lo que mantiene viva la aldea.",
    "es mi vecina carmen hilando en la cocina quería que se viera que el trabajo de ellas es lo que mantiene viva la aldea",
  ),
  edition: f("", "", "ninguno"),
  follow_up_question: "",
};

// ---------------------------------------------------------------------------
// Fit + variant mock: kind match, every requirement "sin_datos", criteria at a third of max,
// variant = base sections reordered, one section per criterion. Deterministic, no claims.
// ---------------------------------------------------------------------------

export const mockFitVariant = {
  async fit({ profile, call, mode }) {
    const wrongKind = call.kind !== mode;
    const fit = {
      eligibility: call.eligibility.map((r) => ({ requirement_id: r.id, status: wrongKind ? "no_cumple" : "sin_datos", evidence: "", action: "Confírmalo." })),
      criteria: call.criteria.map((c) => ({ criterion_id: c.id, estimate: Math.round(c.max / 3), confidence: "baja", evidence: [], gap: "Sin evaluar (mock)." })),
      fit: wrongKind ? "no_elegible" : "medio",
      why_fit: wrongKind ? [] : [`Tu perfil (${profile.fields.discipline?.value ?? profile.fields.activity?.value ?? "?"}) es del tipo que admite la convocatoria.`],
      missing: ["Evaluación real (mock)"],
      questions: [],
    };
    return { fit, latencyMs: 0, usage: { input_tokens: 0, output_tokens: 0 } };
  },
  async variant({ mode, dossier, call }) {
    const ids = Object.keys(DOSSIER_SECTIONS[mode]);
    const sections = (call.criteria.length ? call.criteria : [{ id: "requisitos", label: "Requisitos" }]).map((c, i) => ({
      id: `s-${c.id}`.toLowerCase(),
      heading: c.label,
      body: dossier[ids[i % ids.length]]?.body || "[PENDIENTE: contenido]",
      criteria: [c.id],
      from: [ids[i % ids.length]],
    }));
    const variant = { strategy: "Variante simulada (mock): secciones ordenadas por criterio.", sections, omitted: [], questions: [], format_checks: call.format.map((rule) => ({ rule, status: "no_aplica", note: "mock" })) };
    return { variant, latencyMs: 0, usage: { input_tokens: 0, output_tokens: 0 } };
  },
};
