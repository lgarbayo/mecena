/** Business activity: CNAE-2025 section letters, divisions and classes (BDNS sectores[]). */
import { taxonomy } from "./taxonomy";
import { fold } from "./text";
import type { CnaeRef } from "./types";

const { sections, codes, legacy2009 } = taxonomy.cnae;
const sectionByLabel = new Map(sections.map((s) => [fold(s.label), s.code]));
const codeByLabel = new Map(codes.map((c) => [fold(c.label), c.code]));

export function sectionOfDivision(division: number): string | undefined {
  return sections.find((s) => division >= s.divisions[0] && division <= s.divisions[1])?.code;
}

export interface CnaeResult {
  ref: CnaeRef | null;
  legacy: boolean; // input was a CNAE-2009 4-digit code translated to CNAE-2025
}

/**
 * Normalise a CNAE value: section letter ("S"), division ("90"), group/class ("90.1", "90.12", "9012"),
 * BDNS { codigo, descripcion } objects, or the section/class description text.
 * Four-digit inputs are read as CNAE-2009 when listed in the crosswalk (users quote their IAE/CNAE-2009
 * code), else as CNAE-2025 "dd.dd".
 */
export function normalizeCnae(input: string | { codigo?: string | null; descripcion?: string | null } | null | undefined): CnaeResult {
  if (!input) return { ref: null, legacy: false };
  if (typeof input === "object") {
    const byCode = normalizeCnae(input.codigo ?? null);
    return byCode.ref ? byCode : normalizeCnae(input.descripcion ?? null);
  }
  const raw = input.trim();
  if (/^[A-Va-v]$/.test(raw)) return { ref: { section: raw.toUpperCase() }, legacy: false };
  const compact = raw.replace(/\s/g, "");
  if (/^\d{4}$/.test(compact) && legacy2009[compact]) return withSection(legacy2009[compact], true);
  const m = compact.match(/^(\d{2})(?:\.?(\d{1,2}))?$/);
  if (m) return withSection(m[2] ? `${m[1]}.${m[2]}` : m[1], false);
  const f = fold(raw);
  const sec = sectionByLabel.get(f);
  if (sec) return { ref: { section: sec }, legacy: false };
  const code = codeByLabel.get(f);
  if (code) return withSection(code, false);
  return { ref: null, legacy: false };
}

function withSection(code: string, legacy: boolean): CnaeResult {
  const section = sectionOfDivision(Number(code.slice(0, 2)));
  return section ? { ref: { section, code }, legacy } : { ref: null, legacy };
}

/**
 * Does a profile activity fall under a call sector? Prefix semantics on the hierarchy:
 * call "S" accepts any 90–93; call "90" accepts "90.12"; call "90.12" does not accept "90.20".
 * A profile with only a section matches a call division in that section as "unknown" (confirm).
 */
export function cnaeCheck(profile: CnaeRef | null, callSectors: readonly CnaeRef[]): "pass" | "fail" | "unknown" {
  if (!callSectors.length) return "pass";
  if (!profile) return "unknown";
  let partial = false;
  for (const s of callSectors) {
    if (s.section !== profile.section) continue;
    if (!s.code) return "pass";
    if (!profile.code) {
      partial = true;
      continue;
    }
    const a = s.code.replace(".", "");
    const b = profile.code.replace(".", "");
    if (b.startsWith(a)) return "pass";
    if (a.startsWith(b)) partial = true; // profile is coarser than the call's class
  }
  return partial ? "unknown" : "fail";
}

export function cnaeLabel(ref: CnaeRef): string {
  if (ref.code) return codes.find((c) => c.code === ref.code)?.label ?? ref.code;
  return sections.find((s) => s.code === ref.section)?.label ?? ref.section;
}

const SECTOR_PATTERNS: [RegExp, CnaeRef][] = [
  [/\b(ceramica|alfareria|ceramista)\b/, { section: "C", code: "23.41" }],
  [/\bvidrio\b/, { section: "C", code: "23.19" }],
  [/\b(joyeria|joyer[oa]|orfebre|orfebreria|bisuteria)\b/, { section: "C", code: "32.12" }],
  [/\b(carpinteria|muebles?|ebanisteria|madera|cesteria|corcho)\b/, { section: "C", code: "16" }],
  [/\b(moda|ropa|confeccion|sastreria|prendas)\b/, { section: "C", code: "14" }],
  [/\b(cuero|calzado|marroquineria|zapatos)\b/, { section: "C", code: "15" }],
  [/\b(textil|bordado|tejidos|hilatura)\b/, { section: "C", code: "13" }],
  [/\b(artesania|artesan[oa]s?|taller artesanal)\b/, { section: "C", code: "23.41" }],
  [/\b(restaurante|hosteleria|bar|cafeteria|taberna|meson|gastrobar|catering|comidas?|bebidas?)\b/, { section: "I", code: "56" }],
  [/\b(turismo|turistic[oa]s?|hotel|casa rural|alojamiento|albergue|hostal|pension|camping|apartamento)\b/, { section: "I", code: "55" }],
  [/\b(videojuegos?|gaming)\b/, { section: "J", code: "58.21" }],
  [/\b(editorial|libros?|edicion|revistas?|periodicos?|imprenta)\b/, { section: "J", code: "58.11" }],
  [/\b(audiovisual|cine|cinematograf\w*|cortometrajes?|largometrajes?|productora|rodaje|video|postproduccion|animacion|documental|grabacion|sonido|discografica|sello)\b/, { section: "J", code: "59" }],
  [/\b(tecnologia|software|informatica|programacion|desarrollo web|aplicaciones|apps?|saas|ciberseguridad|inteligencia artificial|digital)\b/, { section: "K", code: "62" }],
  [/\b(arquitectura|arquitect[oa]s?|urbanismo|ingenieria|topografia)\b/, { section: "N", code: "71.11" }],
  [/\b(investigacion|biotecnologia|laboratorio|i\+d)\b/, { section: "N", code: "72.20" }],
  [/\b(fotografia|estudio fotografico)\b/, { section: "N", code: "74.20" }],
  [/\b(traduccion|interpretacion)\b/, { section: "N", code: "74.30" }],
  [/\b(diseno|estudio creativo|branding|ilustracion)\b/, { section: "N", code: "74.10" }],
  [/\b(publicidad|agencia|comunicacion|marketing|relaciones publicas)\b/, { section: "N", code: "73" }],
  [/\b(consultoria|asesoria|gestoria|abogad\w*|juridic\w*|contabilidad|auditoria)\b/, { section: "N", code: "74" }],
  [/\b(educacion|academia|formacion|ensenanza|escuela)\b/, { section: "Q", code: "85" }],
  [/\b(artes escenicas|teatro|danza|circo|musica|conciertos|espectaculos)\b/, { section: "S", code: "90" }],
  [/\b(museos?|bibliotecas?|archivos?|galeria|gestion cultural|patrimonio)\b/, { section: "S", code: "91" }],
  [/\b(deporte|deportiv\w*|gimnasio|ocio|entrenamiento|recreativ\w*)\b/, { section: "S", code: "93" }],
  [/\b(comercio|tienda|minorista|retail|libreria|floristeria|ferreteria|papeleria|boutique|supermercado)\b/, { section: "G", code: "47" }],
  [/\b(agroalimentari\w*|agricola|agricultura|ganaderia|granja|pesca|conservas?|marisco|acuicultura|vino|vinos|bodega|vinedo|queso|quesos|miel|apicultura|aceite|huerta|campo)\b/, { section: "A" }],
  [/\b(panaderia|pasteleria|obrador|reposteria|alimentacion|cerveza|sidreria|destileria|fabrica|fabricacion|industria|metalurgia|mecanico|soldadura|envases|quimica)\b/, { section: "C" }],
  [/\b(energia|electricidad|renovables|solar|fotovoltaica)\b/, { section: "D" }],
  [/\b(construccion|reformas?|albanileria|fontaneria|instalaciones|climatizacion|rehabilitacion)\b/, { section: "F" }],
  [/\b(transporte|logistica|reparto|mensajeria|mudanzas|almacen|distribucion)\b/, { section: "H" }],
  [/\b(salud|clinica|fisioterapia|dental|odontologia|psicologia|nutricion|optica|farmacia|veterinaria)\b/, { section: "R" }],
  [/\b(estetica|peluqueria|barberia|belleza|cosmetica|spa|masajes|tintoreria)\b/, { section: "T" }],
];

/**
 * Derive a canonical CNAE-2025 reference from free-text sector descriptions ("artesanía / cerámica",
 * "hostelería", "tecnología", "comercio"…) when the business has not stated a numeric CNAE code.
 */
export function inferCnaeFromSector(sector: string | null | undefined): CnaeRef | null {
  if (!sector?.trim()) return null;
  const f = fold(sector);
  for (const [re, ref] of SECTOR_PATTERNS) {
    if (re.test(f)) return ref;
  }
  return normalizeCnae(sector).ref;
}
