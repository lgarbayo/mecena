// Real calls (convocatorias) used to test the call-specific dossier variant.
// Criteria, points, limits and requirements are copied from the official texts listed in `sources`.
// All three editions are CLOSED as of 13/11/2026: they are here because their scoring rules are real
// and typical of what the next edition will ask. The app must use the current edition's bases.

export const CALLS = [
  {
    id: "mc-arte-contemporaneo-2026-a",
    kind: "creator",
    name: "Ayudas para la producción e investigación artística en el ámbito del arte contemporáneo 2026 — Línea A: creación y producción artística",
    body: "Ministerio de Cultura (Secretaría de Estado de Cultura, D. G. de Patrimonio Cultural y Bellas Artes)",
    edition: "2026 (extracto BOE nº 101, 27/04/2026; plazo 28/04 a 19/05/2026, cerrada)",
    competitive: true,
    amount: "Hasta 30.000 € por proyecto (línea A). Hasta el 30 % (máx. 4.500 €) puede ser soporte de dedicación a la creación.",
    execution: "Actividad y gastos entre el 01/07/2026 y el 30/06/2027.",
    eligibility: [
      { id: "persona-fisica", text: "Persona física que realiza un proyecto de creación y producción artística." },
      { id: "reta", text: "Alta en el RETA (autónomos) antes de la lista definitiva de beneficiarios (no hace falta al solicitar)." },
      { id: "residencia-fiscal", text: "Residencia fiscal permanente en España." },
      { id: "no-beneficiaria-2025", text: "No haber sido beneficiaria de esta ayuda en la convocatoria anterior (salvo reintegro justificado)." },
      { id: "una-linea", text: "Solo se puede pedir una de las dos líneas (A o B)." },
    ],
    max_points: 30,
    min_points: null,
    criteria: [
      { id: "A1", label: "Currículum", max: 6, valued: "Recorrido formativo y artístico, y su vínculo con el proyecto planteado, en relación con la trayectoria." },
      { id: "A2a", label: "Calidad: aportación artística", max: 12, valued: "Aportación artística del proyecto, carácter innovador, experimental o capacidad para profundizar en temáticas y tendencias contemporáneas." },
      { id: "A2b", label: "Calidad: ODS y valores", max: 5, valued: "Vínculo con los ODS de la Agenda 2030, accesibilidad, inclusión social, diversidad cultural y territorial, igualdad de género." },
      { id: "A3a", label: "Viabilidad y presupuesto", max: 4, valued: "Adecuación del presupuesto al objeto del proyecto; posibilidad de implementación en espacios culturales o desarrollo digital." },
      { id: "A3b", label: "Difusión", max: 2, valued: "Proyección y plan de difusión, actividades en el entorno social (sostenibilidad, digitalización, igualdad, diversidad, inclusión, cohesión territorial); se valora que implique a varias comunidades autónomas." },
      { id: "A4", label: "DANA", max: 1, valued: "Residencia en municipios afectados por la DANA o proyecto relacionado con esos territorios." },
    ],
    documents: ["Solicitud en sede electrónica (cultura.sede.gob.es)", "Memoria del proyecto", "Currículum", "Presupuesto"],
    format: [],
    sources: [
      "https://www.boe.es (BOE nº 101, 27/04/2026, extracto)",
      "https://upta.es/wp-content/uploads/2026/04/RES-AYUDAS-A-LA-PRODUC-E-INVEST-ARTISTICA-ARTE-CONTEMPORANEO-2026.pdf",
    ],
  },
  {
    id: "rega-cidade-da-cultura",
    kind: "creator",
    name: "Axudas Rega: proxectos artísticos con mentoría a través de residencias (Cidade da Cultura de Galicia, CT898A)",
    body: "Fundación Cidade da Cultura de Galicia (Xunta de Galicia)",
    edition: "Bases 2025 (DOG nº 77, 23/04/2025). Edición 2026: orden de 09/03/2026, DOG 08/04/2026, plazo hasta 08/05/2026, cerrada. Criterios tomados de las bases 2025; verificar que 2026 no cambia.",
    competitive: true,
    amount: "8.000 € por proyecto (6 ayudas, 48.000 € en total), incluye producción, viaje, alojamiento, manutención y presentación.",
    execution: "Residencia de 3 a 6 semanas en la Cidade da Cultura (Santiago de Compostela), con mentor asignado.",
    eligibility: [
      { id: "persona-fisica", text: "Persona física (de alta como autónoma o no) con un proyecto de artes visuales, escénicas, musicales, digitales o de diseño." },
      { id: "inedito", text: "Proyecto de creación específica, original e inédito. Una solicitud por persona." },
      { id: "residencia-gaias", text: "Desarrollar la residencia en los espacios de la Cidade da Cultura, dentro del plazo de la convocatoria." },
    ],
    max_points: 100,
    min_points: 50,
    criteria: [
      { id: "A", label: "Concepto / idea artística", max: 45, valued: "Calidad, objetivos que se quieren conseguir, originalidad y argumentación de los contenidos." },
      { id: "B", label: "Viabilidad de su materialización", max: 30, valued: "Resultado práctico, criterios de producción y viabilidad; desglose del presupuesto y su pertinencia para desarrollarse en la Cidade da Cultura." },
      { id: "C", label: "Oportunidad para la trayectoria", max: 25, valued: "Qué supone esta residencia en la trayectoria del artista." },
    ],
    documents: [
      "Anexo II (solicitud)",
      "Memoria con: A) categoría, B) nombre del proyecto y solicitante, C) concepto/idea y objetivos, D) viabilidad con presupuesto, E) justificación de la oportunidad en la trayectoria",
    ],
    format: ["Memoria del proyecto: máximo 30 páginas en PDF (se excluyen los que superen el límite).", "Sin memoria en plazo: inadmisión, no subsanable."],
    sources: [
      "https://www.cidadedacultura.gal/sites/default/files/20250423_dog_cast.pdf",
      "https://www.cidadedacultura.gal/sites/default/files/resolucion_axudas_rega_2026_asinada.pdf",
    ],
  },
  {
    id: "igape-galicia-exporta-empresas-2026",
    kind: "business",
    name: "Galicia Exporta Empresas 2026 (IG622A)",
    body: "Igape (Xunta de Galicia), cofinanciada con FEDER Galicia 2021-2027",
    edition: "2026 (plazo 28/01 a 30/09/2026, cerrada; dotación 9.000.000 €)",
    competitive: false,
    amount: "Subvención de gastos de internacionalización (ferias, viajes, alojamiento, reserva de espacios…) con importes máximos por concepto según las bases.",
    execution: "Del 01/01/2026 al 15/12/2026. Anticipo de hasta el 50 % sin garantías.",
    eligibility: [
      { id: "pyme-galicia", text: "Pyme o autónomo con centro de trabajo en Galicia." },
      { id: "un-trabajador", text: "Al menos una persona trabajadora por cuenta ajena (salvo startups ENISA o empresas de menos de 42 meses)." },
      { id: "ig192", text: "Estar de alta en un programa avanzado del Igape de apoyo a la internacionalización con informe positivo (procedimiento IG192), pedido antes de solicitar." },
      { id: "vinculo-centro", text: "Las acciones de internacionalización deben estar vinculadas a la actividad del centro de trabajo en Galicia." },
    ],
    max_points: null,
    min_points: null,
    criteria: [],
    documents: ["Solicitud en spiga-sede.igape.es", "Plan / descripción de las acciones de internacionalización y su presupuesto"],
    format: [],
    sources: ["https://oficinaeconomicagalicia.xunta.gal/wp-content/uploads/2026/01/20260120_GaliciaExportaEmpresas.pdf"],
  },
];

export const callById = (id) => CALLS.find((c) => c.id === id);
