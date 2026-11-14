/**
 * Presentation layer shared by both front doors (MCP server and in-app agent):
 * a short Spanish (Spain) summary of each tool result, the JSON Schema of each tool's input
 * and a user-facing message for each error type.
 */
import { ZodError, z } from "zod";
import { NotFoundError, PaymentRequiredError, ROUTES, serverEnv, toolSchemas, UnauthorizedError, type ToolName, type ToolOutput } from "@/contracts";
import { AiError } from "@/server/ai/llm";

const base = () => serverEnv().publicUrl;

export const pricingUrl = () => `${base()}${ROUTES.pricing}`;
export const callUrl = (callId: string) => `${base()}${ROUTES.call(callId)}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Summarizers = { [N in ToolName]: (out: ToolOutput<N>) => string };

const summarizers: Summarizers = {
  get_profile: ({ profile }) => {
    const who = profile.displayName || "Perfil sin nombre todavía";
    const kind = profile.kind === "creator" ? "creador/a" : "pyme o autónomo";
    const place = [profile.city, profile.region].filter(Boolean).join(", ");
    const tags = profile.kind === "creator" ? profile.disciplines : [profile.sector].filter(Boolean);
    return [`${who} (${kind}${place ? `, ${place}` : ""}).`, tags.length ? `Ámbito: ${tags.join(", ")}.` : "", profile.achievements.length ? `${plural(profile.achievements.length, "logro registrado", "logros registrados")}.` : ""]
      .filter(Boolean)
      .join(" ");
  },
  update_profile: ({ profile }) => `Perfil actualizado: ${profile.displayName || "sin nombre todavía"}.`,
  build_dossier: ({ dossier, url }) => {
    const what = dossier.kind === "creator" ? "Dossier artístico" : "Memoria de capacidades";
    const variant = dossier.variant
      ? ` Adaptado a la convocatoria ${dossier.variant.callId}${dossier.variant.maxImages ? ` (máximo ${dossier.variant.maxImages} imágenes)` : ""}.`
      : "";
    return `${what} listo: ${plural(dossier.sections.length, "sección", "secciones")} y ${plural(dossier.workIds.length, "obra", "obras")}.${variant} Ábrelo aquí: ${url}`;
  },
  export_dossier_pdf: ({ url, pages }) => `PDF del dossier generado${pages ? ` (${plural(pages, "página", "páginas")})` : ""}. Descárgalo aquí: ${url}`,
  search_calls: ({ results }) => {
    if (!results.length) return "No he encontrado convocatorias abiertas que encajen con tu perfil ahora mismo.";
    const lines = results.map(({ call, match }, i) => `${i + 1}. ${call.title} (${call.organizer}) · ${call.amountText} · plazo: ${call.deadlineText} · encaje ${Math.round(match.score)}/100 · ${callUrl(call.id)}`);
    return [`He encontrado ${plural(results.length, "convocatoria que encaja", "convocatorias que encajan")} contigo:`, ...lines].join("\n");
  },
  explain_call: ({ call, match, checklist }) =>
    [
      `${call.title} (${call.organizer}).`,
      `Cuantía: ${call.amountText}. Plazo: ${call.deadlineText}.`,
      call.summary,
      match.whyYouFit.length ? `Por qué encajas: ${match.whyYouFit.join("; ")}.` : "",
      match.whatYouMiss.length ? `Qué te falta: ${match.whatYouMiss.join("; ")}.` : "",
      checklist.length ? `Documentación: ${checklist.join("; ")}.` : "",
      `Más información: ${callUrl(call.id)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  draft_application: ({ application, url }) =>
    `Borrador de solicitud listo (versión ${application.version}): ${plural(application.sections.length, "apartado", "apartados")}, ${plural(application.budget.length, "partida", "partidas")} de presupuesto y ${plural(application.checklist.length, "punto", "puntos")} de checklist. Mecena prepara; tú presentas. Revísalo aquí: ${url}`,
  score_application: ({ score, url }) => {
    const crit = score.criteria.map((c) => `${c.name}: ${Math.round(c.points)}/${c.maxPoints}`).join("; ");
    return `El tribunal simulado le da ${score.total}/100.${crit ? ` ${crit}.` : ""} ${score.disclaimer} Detalle y mejoras: ${url}`;
  },
};

/** One short Spanish line (or a few) a human can read, for any tool output. */
export function summarizeToolResult<N extends ToolName>(name: N, output: ToolOutput<N>): string {
  return (summarizers[name] as (o: ToolOutput<N>) => string)(output);
}

/** User-facing Spanish message for an error thrown by a tool. */
export function toolErrorMessage(e: unknown): string {
  if (e instanceof PaymentRequiredError)
    return `Necesitas Mecena Pro o una Solicitud premium para preparar la solicitud. Desbloquéalo aquí: ${pricingUrl()} (una compra hecha en el móvil también desbloquea Claude Desktop).`;
  if (e instanceof ZodError) return `Datos de entrada no válidos: ${e.issues.map((i) => `${i.path.join(".") || "(entrada)"}: ${i.message}`).join("; ")}`;
  if (e instanceof NotFoundError) return e.message.charAt(0).toUpperCase() + e.message.slice(1) + ".";
  if (e instanceof UnauthorizedError) return e.message;
  if (e instanceof AiError) return "La IA no ha podido completar esta tarea ahora mismo. Inténtalo de nuevo en unos segundos.";
  return `Error inesperado: ${e instanceof Error ? e.message : String(e)}`;
}

/** JSON Schema (draft 2020-12) of a tool's input, for Claude's `tools[].input_schema`. */
export function toolInputJsonSchema(name: ToolName): { type: "object"; properties?: unknown; required?: string[]; [k: string]: unknown } {
  const schema = z.toJSONSchema(toolSchemas[name].input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return { ...schema, type: "object" };
}
