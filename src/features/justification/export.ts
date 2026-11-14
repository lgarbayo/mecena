import type { Call, JustificationMemoria } from "@/contracts";

/** The memoria as a plain text file the user can edit and attach (Mecena prepares; they present it themselves). */
export function memoriaAsText(call: Pick<Call, "title" | "organizer">, memoria: Pick<JustificationMemoria, "sections">): string {
  return [
    `MEMORIA DE JUSTIFICACIÓN — ${call.title}`,
    call.organizer,
    "",
    ...memoria.sections.flatMap((s) => [s.title.toUpperCase(), "", s.body.trim(), ""]),
    "Borrador preparado con Mecena. Revísalo y preséntalo tú con tu certificado digital.",
    "",
  ].join("\n");
}

/** How many "[Completa: …]" gaps a memoria still has. */
export function gapCount(memoria: Pick<JustificationMemoria, "sections"> | null | undefined): number {
  return (memoria?.sections ?? []).reduce((n, s) => n + (s.body.match(/\[Completa:[^\]]*\]/g)?.length ?? 0), 0);
}
