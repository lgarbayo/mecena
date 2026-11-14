"use client";
/**
 * "¿Ya tienes dossier?": upload a PDF or a photo of it, or paste its text (CCR-8). Mecena reads it, fills the
 * profile and the dossier sections with the user's own text, and the user keeps talking only to fill the gaps.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { API, ROUTES, type ProfileKind } from "@/contracts";
import type { ImportDossierResponse } from "@/contracts/api";
import { apiSend, fileToDataUrl } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { LoadingRegion, SkeletonText } from "@/components/ui";
import { fieldLabel } from "../copy";
import s from "./onboarding.module.css";

type ImportPayload = { fileDataUrl?: string; fileName?: string; text?: string };

const MAX_MB = 20;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

const COPY = {
  creator: {
    question: "¿Ya tienes un dossier?",
    lede: "Súbelo y lo usamos de base. Solo te preguntaremos lo que falte.",
    reading: "Leyendo tu dossier…",
    placeholder: "O pega aquí el texto de tu dossier",
    textLabel: "Texto de tu dossier",
    failed: "No hemos podido leer tu dossier.",
    done: (r: ImportDossierResponse) =>
      `Listo: hemos rellenado ${r.changedSectionKeys.length} ${r.changedSectionKeys.length === 1 ? "sección" : "secciones"} de tu dossier con tus textos. Revísalas abajo y cuéntanos lo que falte.`,
  },
  // A pyme does not build a dossier: any document about the company only fills its card, to find aid faster.
  business: {
    question: "¿Tienes algo escrito sobre tu empresa?",
    lede: "Una presentación, el texto de tu web o una memoria. Lo leemos, rellenamos la ficha y solo te preguntamos lo que falte.",
    reading: "Leyendo el documento…",
    placeholder: "O pega aquí el texto (tu web, una presentación…)",
    textLabel: "Texto sobre tu empresa",
    failed: "No hemos podido leer el documento.",
    done: (r: ImportDossierResponse) => {
      const n = r.changedProfileFields.filter((f) => fieldLabel("business", f)).length; // derived ids (territory…) are not "datos"
      return n
        ? `Listo: hemos rellenado ${n} ${n === 1 ? "dato" : "datos"} de la ficha de tu empresa. Revísalos abajo y cuéntanos lo que falte.`
        : "Listo: lo guardamos para tus solicitudes. Cuéntanos lo que falte de la ficha.";
    },
  },
} satisfies Record<ProfileKind, { question: string; lede: string; reading: string; placeholder: string; textLabel: string; failed: string; done: (r: ImportDossierResponse) => string }>;

/** `bare`: no collapsible card of its own, for a sheet that already carries the title (the onboarding on a phone). */
export function ImportDossier({ kind, profileId, onImported, defaultOpen, bare }: { kind: ProfileKind; profileId?: string; onImported: (res: ImportDossierResponse) => void; defaultOpen?: boolean; bare?: boolean }) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportDossierResponse | null>(null);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const c = COPY[kind];
  // One idempotency key per import: a double tap is ignored, a retry of the same document reuses the key.
  const importAction = useAction((idempotencyKey: string, payload: ImportPayload) =>
    apiSend<ImportDossierResponse>(API.onboardingImport, { ...payload, profileId }, "POST", undefined, { idempotencyKey }),
  );
  const busy = importAction.pending;
  const error = localError ?? (importAction.error ? (importAction.error instanceof Error ? importAction.error.message : c.failed) : null);

  async function send(payload: ImportPayload) {
    setLocalError(null);
    const res = await importAction.run(payload);
    if (fileRef.current) fileRef.current.value = "";
    if (!res) return;
    setDone(res);
    setText("");
    onImported(res);
  }

  function fail(message: string) {
    importAction.reset();
    setLocalError(message);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) return fail(`El archivo pesa más de ${MAX_MB} MB. Prueba con un PDF más ligero o pega el texto.`);
    if (!ACCEPT.split(",").includes(file.type)) return fail("Sube un PDF o una foto (JPG, PNG). Si lo tienes en Word, expórtalo a PDF.");
    await send({ fileDataUrl: await fileToDataUrl(file), fileName: file.name });
  }

  const body = (
    <div className={`${s.importBody} ${bare ? s.importBodyBare : ""}`}>
      <label className={`btn btn-primary ${busy ? s.importBusy : ""}`} aria-disabled={busy}>
        {busy ? c.reading : "Subir PDF o foto"}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className={s.srOnly}
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          data-testid="import-file"
        />
      </label>
      <form
        className={s.textForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ text });
        }}
      >
        <textarea value={text} rows={3} placeholder={c.placeholder} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label={c.textLabel} />
        <button type="submit" className="btn btn-secondary" disabled={busy || !text.trim()}>
          Usar este texto
        </button>
      </form>
      <p className={s.muted}>Copiamos tus textos sin reescribirlos; solo corregimos erratas y tildes. El archivo es tuyo: no entrenamos con él.</p>
      {busy && (
        <LoadingRegion label={c.reading} className={s.importReading}>
          <p className={s.sending} aria-hidden>
            {c.reading.replace("…", "")}: tarda unos segundos…
          </p>
          <SkeletonText lines={3} />
        </LoadingRegion>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {done && !busy && (
        <div className={s.note} role="status" data-testid="import-done">
          {done.changedSectionKeys.length || done.changedProfileFields.length ? c.done(done) : "No hemos encontrado nada nuevo en este documento."}
          {done.worksFound.length > 0 && kind === "creator" ? (
            <>
              {" "}
              {done.worksFound.length === 1 ? "Aparece 1 obra" : `Aparecen ${done.worksFound.length} obras`}: <Link href={ROUTES.works}>{done.worksFound.length === 1 ? "añade una imagen" : "añade sus imágenes"}</Link> para que{" "}
              {done.worksFound.length === 1 ? "salga" : "salgan"} con su ficha.
            </>
          ) : null}
        </div>
      )}
    </div>
  );
  if (bare)
    return (
      <div data-testid="import-dossier">
        <p className={s.muted}>{c.lede}</p>
        {body}
      </div>
    );
  return (
    <details className={`${s.panel} ${s.importBox}`} open={defaultOpen || undefined} data-testid="import-dossier">
      <summary className={s.importSummary}>
        <strong>{c.question}</strong>
        <span className={s.muted}>{c.lede}</span>
      </summary>
      {body}
    </details>
  );
}
