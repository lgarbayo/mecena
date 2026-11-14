/**
 * Justification service (IDEA #7). One application's invoices, how they spend its budget, and the final memoria.
 * Mecena prepares; the user presents: nothing here is sent anywhere. The invoice photo is stored byte for byte, the
 * AI only proposes the fields and the budget line, and the user can change every one of them.
 */
import fs from "node:fs";
import path from "node:path";
import { BadRequestError, NotFoundError, type ApplicationSection, type Invoice, type JustificationMemoria } from "@/contracts";
import { MAX_INVOICES_PER_APPLICATION, type JustificationResponse, type UpdateInvoiceRequest } from "@/contracts/api";
import type { z } from "zod";
import { getAi } from "@/server/ai";
import {
  deleteInvoice,
  getApplication,
  getCall,
  getInvoice,
  getJustification,
  getProfile,
  getTranscript,
  listInvoices,
  newId,
  nowIso,
  saveInvoice,
  saveJustification,
  uploadsDir,
} from "@/server/store";
import { InvalidImageError, MAX_IMAGE_BYTES, parseDataUrl } from "@/features/works/service";
import { cleanDate, economicSection, findLine, round2, signatureOf, suggestLine, summarize } from "./rules";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Media = keyof typeof EXT;

export function justificationState(applicationId: string): JustificationResponse {
  const application = getApplication(applicationId);
  const call = getCall(application.callId);
  const invoices = listInvoices(applicationId);
  const summary = summarize(application.budget, invoices, call);
  const memoria = getJustification(applicationId) ?? null;
  return {
    application,
    call,
    invoices,
    summary,
    memoria,
    memoriaStale: !!memoria && memoria.signature !== summary.signature,
    mode: getAi().mode === "mock" ? "mock" : "ai",
  };
}

function imageFile(id: string): { file: string; mediaType: Media } | undefined {
  for (const [mediaType, ext] of Object.entries(EXT)) {
    const file = path.join(uploadsDir(), `${id}.${ext}`);
    if (fs.existsSync(file)) return { file, mediaType: mediaType as Media };
  }
  return undefined;
}

export function readInvoiceImage(id: string): { bytes: Buffer; mediaType: Media } | undefined {
  const img = imageFile(id);
  return img ? { bytes: fs.readFileSync(img.file), mediaType: img.mediaType } : undefined;
}

/** A photo of an invoice: stored as received, read once by the AI, and assigned to the budget line it most likely belongs to. */
export async function addInvoice(input: { applicationId: string; imageDataUrl: string; hint?: string }): Promise<JustificationResponse> {
  const application = getApplication(input.applicationId);
  const call = getCall(application.callId);
  if (listInvoices(application.id).length >= MAX_INVOICES_PER_APPLICATION)
    throw new BadRequestError(`Has llegado al máximo de ${MAX_INVOICES_PER_APPLICATION} facturas para esta solicitud.`);
  let parsed: ReturnType<typeof parseDataUrl>;
  try {
    parsed = parseDataUrl(input.imageDataUrl);
  } catch (e) {
    if (e instanceof InvalidImageError) throw new BadRequestError(e.message);
    throw e;
  }
  const bytes = Buffer.from(parsed.base64, "base64");
  if (!bytes.length) throw new BadRequestError("La imagen está vacía");
  if (bytes.length > MAX_IMAGE_BYTES) throw new BadRequestError("La foto pesa demasiado (máx. 6 MB). Prueba otra vez desde la cámara.");

  const read = await getAi().extractInvoice({
    imageBase64: parsed.base64,
    mediaType: parsed.mediaType,
    budget: application.budget,
    allowedExpenses: call.allowedExpenses,
    hint: input.hint,
  });
  const id = newId("inv");
  fs.writeFileSync(path.join(uploadsDir(), `${id}.${EXT[parsed.mediaType]}`), bytes);
  const line = suggestLine(application.budget, { lineConcept: read.lineConcept, expenseType: read.expenseType, concept: read.concept, supplier: read.supplier });
  const invoice: Invoice = {
    id,
    applicationId: application.id,
    profileId: application.profileId,
    imageUrl: `/api/justification/invoices/${id}/image`,
    supplier: read.supplier,
    taxId: read.taxId,
    number: read.number,
    date: cleanDate(read.date),
    concept: read.concept,
    baseEur: read.baseEur,
    vatEur: read.vatEur,
    totalEur: round2(read.totalEur),
    expenseType: read.expenseType ?? line?.expenseType,
    lineConcept: line?.concept,
    assignedBy: line ? "ai" : undefined,
    confidence: read.confidence,
    extractedBy: read.fallback ? "manual" : getAi().mode === "mock" ? "mock" : "vision",
    createdAt: nowIso(),
  };
  await saveInvoice(strip(invoice));
  return justificationState(application.id);
}

/** zod's optional fields must be absent, not undefined, once stored as JSON: keep the record clean. */
const strip = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

type InvoicePatch = z.infer<typeof UpdateInvoiceRequest>;

/** The user's corrections win over whatever was read. `null` clears an optional field. */
export async function updateInvoice(id: string, patch: InvoicePatch): Promise<JustificationResponse> {
  const inv = getInvoice(id);
  const application = getApplication(inv.applicationId);
  const next: Invoice = { ...inv };
  const set = <K extends "supplier" | "concept" | "totalEur">(k: K, v: Invoice[K] | undefined) => {
    if (v !== undefined) next[k] = v;
  };
  const opt = <K extends "taxId" | "number" | "date" | "baseEur" | "vatEur" | "expenseType">(k: K, v: Invoice[K] | null | undefined) => {
    if (v === undefined) return;
    if (v === null || v === "") delete next[k];
    else next[k] = v;
  };
  set("supplier", patch.supplier?.trim());
  set("concept", patch.concept?.trim());
  set("totalEur", patch.totalEur === undefined ? undefined : round2(patch.totalEur));
  opt("taxId", patch.taxId === undefined ? undefined : (patch.taxId?.trim() ?? null));
  opt("number", patch.number === undefined ? undefined : (patch.number?.trim() ?? null));
  if (patch.date !== undefined && patch.date !== null && !cleanDate(patch.date)) throw new BadRequestError("Esa fecha no existe. Usa el formato AAAA-MM-DD.");
  opt("date", patch.date);
  opt("baseEur", patch.baseEur === undefined ? undefined : patch.baseEur === null ? null : round2(patch.baseEur));
  opt("vatEur", patch.vatEur === undefined ? undefined : patch.vatEur === null ? null : round2(patch.vatEur));
  opt("expenseType", patch.expenseType === undefined ? undefined : (patch.expenseType?.trim() ?? null));
  if (patch.lineConcept !== undefined) {
    if (patch.lineConcept === null || patch.lineConcept === "") {
      delete next.lineConcept;
      delete next.assignedBy;
    } else {
      const line = findLine(application.budget, patch.lineConcept);
      if (!line) throw new BadRequestError("Esa partida no está en el presupuesto de tu solicitud.");
      next.lineConcept = line.concept;
      next.assignedBy = "user";
      if (!next.expenseType && patch.expenseType === undefined) next.expenseType = line.expenseType;
    }
  }
  if (patch.supplier !== undefined || patch.totalEur !== undefined || patch.date !== undefined || patch.number !== undefined) next.confidence = Math.max(next.confidence, 0.6); // the user has checked it
  await saveInvoice(strip(next));
  return justificationState(inv.applicationId);
}

export async function removeInvoice(id: string): Promise<JustificationResponse> {
  const inv = getInvoice(id);
  await deleteInvoice(id);
  const img = imageFile(id);
  if (img) fs.rmSync(img.file, { force: true });
  return justificationState(inv.applicationId);
}

const memoriaSection = (key: string, title: string, body: string): ApplicationSection => ({ key, title, body, sourceSegmentIds: [] });

/** Draft the final memoria: narrative from the AI (their words, gaps marked), the economic account from the numbers. */
export async function generateMemoria(applicationId: string, notes?: string): Promise<JustificationResponse> {
  const application = getApplication(applicationId);
  const call = getCall(application.callId);
  const profile = getProfile(application.profileId);
  const invoices = listInvoices(applicationId);
  if (!invoices.length) throw new BadRequestError("Añade al menos una factura antes de preparar la memoria.");
  const summary = summarize(application.budget, invoices, call);
  const narrative = await getAi().writeJustification({
    profile,
    call,
    application,
    transcript: getTranscript(profile.id),
    invoices,
    lines: summary.lines.map((l) => ({ concept: l.concept, budgetEur: l.budgetEur, spentEur: l.spentEur })),
    notes,
  });
  const sections = [
    ...narrative.sections.map((s) => memoriaSection(s.key, s.title, s.body)),
    memoriaSection("economica", "Cuenta justificativa", economicSection(summary, invoices)),
  ];
  const now = nowIso();
  const memoria: JustificationMemoria = {
    applicationId,
    sections,
    signature: signatureOf(application.budget, invoices),
    generatedBy: getAi().mode === "mock" ? "mock" : "ai",
    generatedAt: now,
    updatedAt: now,
  };
  await saveJustification(memoria);
  return justificationState(applicationId);
}

/** The user has the last word: their edited sections replace the draft as written. */
export async function saveMemoria(applicationId: string, sections: ApplicationSection[]): Promise<JustificationResponse> {
  getApplication(applicationId);
  const memoria = getJustification(applicationId);
  if (!memoria) throw new NotFoundError("application");
  await saveJustification({ ...memoria, sections, updatedAt: nowIso() });
  return justificationState(applicationId);
}
