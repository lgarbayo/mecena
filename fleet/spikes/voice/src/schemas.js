// JSON schemas for the voice extraction spike.
//
// Two families:
//   1. Canonical shapes (what the app stores): CREATOR_FIELDS / BUSINESS_FIELDS + ProfileState.
//   2. Model output schemas (what Claude returns through structured outputs):
//      patch ops, dossier sections, technical sheet, image notes.
//
// Structured-output constraints we design around:
//   - every object needs additionalProperties:false and every property listed in `required`;
//   - no unions/nullables: "" (empty string) and 0 mean "not said". This keeps the schemas
//     far away from the per-request union/optional-parameter limits and makes the
//     model's "I don't know" explicit instead of a missing key.

/**
 * Field catalogue per mode.
 *   kind "scalar": one value, replaced on correction (history kept client-side).
 *   kind "list":   keyed items ({title, year, place, detail}); add / update / remove.
 *   section:       dossier section that must be (re)written when the field changes.
 */
export const CREATOR_FIELDS = {
  name: { kind: "scalar", section: "bio", label: "Nombre" },
  artistic_name: { kind: "scalar", section: "bio", label: "Nombre artístico" },
  discipline: { kind: "scalar", section: "bio", label: "Disciplina" },
  location: { kind: "scalar", section: "bio", label: "Dónde vive/trabaja" },
  origin: { kind: "scalar", section: "bio", label: "Origen" },
  birth_year: { kind: "scalar", section: "bio", label: "Año de nacimiento" },
  practice: { kind: "scalar", section: "statement", label: "Cómo describe su práctica" },
  goals: { kind: "scalar", section: "statement", label: "Qué quiere conseguir / financiar" },
  website: { kind: "scalar", section: "bio", label: "Web / redes" },
  techniques: { kind: "list", section: "statement", label: "Técnicas y materiales" },
  themes: { kind: "list", section: "statement", label: "Temas" },
  series: { kind: "list", section: "series", label: "Series / proyectos" },
  education: { kind: "list", section: "cv", label: "Formación" },
  exhibitions: { kind: "list", section: "cv", label: "Exposiciones" },
  awards: { kind: "list", section: "cv", label: "Premios y becas" },
  residencies: { kind: "list", section: "cv", label: "Residencias" },
  publications: { kind: "list", section: "cv", label: "Publicaciones / clientes" },
};

export const BUSINESS_FIELDS = {
  contact_name: { kind: "scalar", section: "activity", label: "Persona de contacto" },
  business_name: { kind: "scalar", section: "activity", label: "Nombre comercial" },
  legal_form: { kind: "scalar", section: "activity", label: "Forma jurídica" },
  activity: { kind: "scalar", section: "activity", label: "Actividad" },
  location: { kind: "scalar", section: "activity", label: "Ubicación" },
  founded_year: { kind: "scalar", section: "activity", label: "Año de creación" },
  employees: { kind: "scalar", section: "team", label: "Plantilla" },
  revenue: { kind: "scalar", section: "activity", label: "Facturación" },
  goals: { kind: "scalar", section: "projects", label: "Qué quiere conseguir / financiar" },
  website: { kind: "scalar", section: "activity", label: "Web / redes" },
  team: { kind: "list", section: "team", label: "Equipo" },
  products: { kind: "list", section: "activity", label: "Productos / servicios" },
  markets: { kind: "list", section: "activity", label: "Clientes / canales / mercados" },
  projects: { kind: "list", section: "projects", label: "Proyectos" },
  certifications: { kind: "list", section: "activity", label: "Sellos, premios, certificaciones" },
  tools: { kind: "list", section: "projects", label: "Herramientas / situación digital" },
};

export const FIELDS = { creator: CREATOR_FIELDS, business: BUSINESS_FIELDS };

export const DOSSIER_SECTIONS = {
  creator: {
    bio: "Biografía breve",
    statement: "Statement",
    series: "Series",
    cv: "CV artístico",
  },
  business: {
    activity: "Presentación y actividad",
    team: "Equipo",
    projects: "Proyectos y necesidades",
  },
};

// ---------------------------------------------------------------------------
// 1. Incremental profile patch (output of the fast extractor, claude-sonnet-5-5)
// ---------------------------------------------------------------------------

/** @param {"creator"|"business"} mode */
export function patchSchema(mode) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ops", "ask_next"],
    properties: {
      ops: {
        type: "array",
        description: "Changes to apply to CURRENT_STATE. Empty array when nothing new was said.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["op", "field", "key", "value", "year", "place", "detail", "source"],
          properties: {
            op: {
              type: "string",
              enum: ["set", "add", "update", "remove"],
              description:
                "set: scalar field (also used to correct it). add: new list item. update: correct an existing list item by key. remove: the speaker retracted an item.",
            },
            field: { type: "string", enum: Object.keys(FIELDS[mode]) },
            key: {
              type: "string",
              description:
                "List items only: short slug. New slug for add; the EXISTING key from CURRENT_STATE for update/remove. Empty for scalars.",
            },
            value: {
              type: "string",
              description:
                "Scalar value, or the item's title/label. Spanish, as said by the speaker (fix only obvious ASR casing/accents).",
            },
            year: { type: "string", description: "Four-digit year if said for this item/value, else empty." },
            place: { type: "string", description: "Venue / city / institution if said, else empty." },
            detail: { type: "string", description: "Other details said about the item (one short phrase), else empty." },
            source: {
              type: "string",
              description:
                "Verbatim, contiguous words copied from TRANSCRIPT that state this fact (5-25 words). Validated by code; non-verbatim ops are discarded.",
            },
          },
        },
      },
      ask_next: {
        type: "string",
        description:
          "Optional short question in Spanish (tú) about the most valuable missing information, or empty string.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Dossier sections (output of the dossier writer)
// ---------------------------------------------------------------------------

/** @param {"creator"|"business"} mode */
export function dossierSchema(mode) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "body", "quotes_used", "missing"],
          properties: {
            id: { type: "string", enum: Object.keys(DOSSIER_SECTIONS[mode]) },
            title: { type: "string" },
            body: {
              type: "string",
              description: "Section text in Spanish (Spain). Markdown allowed (short paragraphs, '- ' lists). Empty if there is not enough information yet.",
            },
            quotes_used: {
              type: "array",
              items: { type: "string" },
              description: "Source quotes (from PROFILE) whose wording the body reuses.",
            },
            missing: {
              type: "array",
              items: { type: "string" },
              description: "What this section still lacks, in Spanish, short (e.g. 'medidas de las obras').",
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Per-work technical sheet (photo + spoken description)
// ---------------------------------------------------------------------------

const sheetField = (description) => ({
  type: "object",
  additionalProperties: false,
  required: ["value", "source", "origin"],
  properties: {
    value: { type: "string", description },
    source: { type: "string", description: "Verbatim words from the spoken description, or empty." },
    origin: {
      type: "string",
      enum: ["voz", "imagen", "ninguno"],
      description: "voz = said by the artist; imagen = only seen in the photo (needs confirmation); ninguno = unknown.",
    },
  },
});

export const SHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "year", "technique", "support", "dimensions", "series", "concept", "edition", "follow_up_question"],
  properties: {
    title: sheetField("Title as said. 'Sin título' only if the artist says so."),
    year: sheetField("Four-digit year, or empty."),
    technique: sheetField("Technique/medium, e.g. 'Óleo y pigmentos de tierra'."),
    support: sheetField("Support, e.g. 'lienzo', 'papel de algodón 300 g'."),
    dimensions: {
      type: "object",
      additionalProperties: false,
      required: ["height_cm", "width_cm", "depth_cm", "source"],
      properties: {
        height_cm: { type: "number", description: "0 if unknown. Spoken 'A por B' = height A x width B unless stated otherwise." },
        width_cm: { type: "number", description: "0 if unknown." },
        depth_cm: { type: "number", description: "0 if unknown or flat work." },
        source: { type: "string" },
      },
    },
    series: sheetField("Series it belongs to, or empty."),
    concept: sheetField("1-3 sentences in Spanish, first person, reusing the artist's own words."),
    edition: sheetField("Edition for prints/photography (e.g. '3/10'), or empty."),
    follow_up_question: {
      type: "string",
      description: "One short question in Spanish (tú) for the most important missing field, or empty.",
    },
  },
};

// Vision pass: describes the photo of the work. It must never invent title/year/meaning.
export const IMAGE_NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visual_description", "medium_hint", "orientation", "photo_issues", "visible_text"],
  properties: {
    visual_description: { type: "string", description: "Neutral 1-2 sentence description in Spanish of what is visible." },
    medium_hint: { type: "string", description: "Medium/support that looks likely (e.g. 'óleo sobre lienzo'), or empty if unclear." },
    orientation: { type: "string", enum: ["vertical", "horizontal", "cuadrada", "desconocida"] },
    photo_issues: {
      type: "array",
      items: { type: "string", enum: ["inclinada", "perspectiva", "reflejos", "recorte_excesivo", "fondo_visible", "desenfocada", "poca_luz"] },
    },
    visible_text: { type: "string", description: "Signature/date/text readable on the work, verbatim, or empty." },
  },
};

// ---------------------------------------------------------------------------
// 5. Fit with a call (convocatoria): eligibility + per-criterion estimate
// ---------------------------------------------------------------------------

export const FIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["eligibility", "criteria", "fit", "why_fit", "missing", "questions"],
  properties: {
    eligibility: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement_id", "status", "evidence", "action"],
        properties: {
          requirement_id: { type: "string" },
          status: { type: "string", enum: ["cumple", "no_cumple", "sin_datos"] },
          evidence: { type: "string", description: "Verbatim PROFILE source quote that proves it, or empty." },
          action: { type: "string", description: "Spanish, short: what the user must do or confirm. Empty if nothing." },
        },
      },
    },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion_id", "estimate", "confidence", "evidence", "gap"],
        properties: {
          criterion_id: { type: "string" },
          estimate: { type: "number", description: "Points a strict jury would give TODAY with only what is in PROFILE (0..max)." },
          confidence: { type: "string", enum: ["alta", "media", "baja"] },
          evidence: { type: "array", items: { type: "string" }, description: "Verbatim PROFILE source quotes supporting the estimate." },
          gap: { type: "string", description: "Spanish, short: what is missing to score higher. Empty if nothing." },
        },
      },
    },
    fit: { type: "string", enum: ["alto", "medio", "bajo", "no_elegible"] },
    why_fit: { type: "array", items: { type: "string" }, description: "Max 3 short Spanish reasons, each tied to a fact the user said." },
    missing: { type: "array", items: { type: "string" }, description: "Short Spanish list of what the application still needs." },
    questions: { type: "array", items: { type: "string" }, description: "Max 3 questions in Spanish (tú) that would raise the score most." },
  },
};

// ---------------------------------------------------------------------------
// 6. Call-specific dossier variant
// ---------------------------------------------------------------------------

/** @param {"creator"|"business"} mode */
export function variantSchema(mode) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["strategy", "sections", "omitted", "questions", "format_checks"],
    properties: {
      strategy: { type: "string", description: "Spanish, 2-3 sentences for the user: what this variant puts first and why, in terms of this call's criteria." },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "heading", "body", "criteria", "from"],
          properties: {
            id: { type: "string", description: "Short slug." },
            heading: { type: "string", description: "Spanish heading; mirror the structure the call asks for when it asks for one." },
            body: { type: "string", description: "Spanish (Spain) markdown. Facts only from PROFILE/BASE_DOSSIER. Missing required data as [PENDIENTE: …]." },
            criteria: { type: "array", items: { type: "string" }, description: "Criterion or requirement ids this section serves." },
            from: { type: "array", items: { type: "string", enum: [...Object.keys(DOSSIER_SECTIONS[mode]), "profile", "nuevo"] } },
          },
        },
      },
      omitted: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["what", "why"],
          properties: { what: { type: "string" }, why: { type: "string" } },
        },
        description: "Base-dossier content left out or shortened for this call, and why (Spanish).",
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion_id", "question"],
          properties: { criterion_id: { type: "string" }, question: { type: "string", description: "Spanish, tú, one short question." } },
        },
      },
      format_checks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rule", "status", "note"],
          properties: {
            rule: { type: "string" },
            status: { type: "string", enum: ["ok", "riesgo", "no_aplica"] },
            note: { type: "string" },
          },
        },
      },
    },
  };
}
