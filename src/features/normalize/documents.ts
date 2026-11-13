/** Required documents: free text from the bases → canonical document ids (one line may name several). */
import { taxonomy } from "./taxonomy";
import { PhraseMatcher, unique } from "./text";

const items = taxonomy.documents.items;
const matcher = new PhraseMatcher(items.map((d) => ({ id: d.id, phrases: [d.id.replace(/-/g, " "), d.label.es, d.label.gl, ...d.synonyms] })));

export interface DocumentsResult {
  ids: string[];
  unmapped: string[];
  byInput: { input: string; ids: string[] }[];
}

/**
 * normalizeDocuments(["Certificados de estar al corriente con Hacienda y la Seguridad Social", "Dossier"])
 * → ids ["certificado-hacienda", "certificado-seguridad-social", "dossier"].
 */
export function normalizeDocuments(inputs: readonly string[]): DocumentsResult {
  const byInput = inputs.map((input) => {
    let hits = matcher.exact(input);
    if (!hits.length) hits = matcher.scan(input);
    if (!hits.length) hits = matcher.fuzzy(input);
    return { input, ids: unique(hits.map((h) => h.id)) };
  });
  return {
    ids: unique(byInput.flatMap((b) => b.ids)),
    unmapped: byInput.filter((b) => !b.ids.length).map((b) => b.input),
    byInput,
  };
}

export function documentLabel(id: string, lang: "es" | "gl" = "es"): string {
  return items.find((d) => d.id === id)?.label[lang] ?? id;
}

/** Required documents the user does not have yet (for "Qué te falta" / the checklist). */
export function missingDocuments(requiredIds: readonly string[], availableIds: readonly string[]): string[] {
  return requiredIds.filter((id) => !availableIds.includes(id));
}
