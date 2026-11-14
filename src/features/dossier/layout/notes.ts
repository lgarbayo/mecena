/**
 * Guard notes that mean the layout no longer fits the artist's texts (they were edited after it was made), as opposed
 * to routine fixes (margins, columns). Only these offer "Ajustar la maquetación a mis textos". Shared by the guard
 * and the client panel, so it imports nothing.
 */
export const NOTE_QUOTE_LOST = "He quitado una cita porque ya no aparece tal cual en tus textos (solo uso tus palabras). Si los has editado, pídeme que ajuste la maquetación.";
export const NOTE_TEXT_MISSING = "He quitado un texto que no existe en tu dossier.";
export const NOTE_TEXT_OVERFLOW = "Un texto era demasiado largo y sigue en la página siguiente.";
export const NOTE_TEXT_SHRUNK = "He reducido el tamaño de algún texto para que cupiera entero.";

const TEXT_NOTES = new Set([NOTE_QUOTE_LOST, NOTE_TEXT_MISSING, NOTE_TEXT_OVERFLOW, NOTE_TEXT_SHRUNK]);

/** True when some note says the texts outgrew (or lost a quote from) the layout in force. */
export const textsOutgrewLayout = (adjustments: string[]): boolean => adjustments.some((a) => TEXT_NOTES.has(a));
