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
import s from "./onboarding.module.css";

const MAX_MB = 20;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export function ImportDossier({ kind, profileId, onImported, defaultOpen }: { kind: ProfileKind; profileId?: string; onImported: (res: ImportDossierResponse) => void; defaultOpen?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportDossierResponse | null>(null);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const noun = kind === "creator" ? "dossier" : "dossier o memoria de empresa";

  async function send(payload: { fileDataUrl?: string; fileName?: string; text?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<ImportDossierResponse>(API.onboardingImport, { ...payload, profileId });
      setDone(res);
      setText("");
      onImported(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No hemos podido leer tu dossier.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) return setError(`El archivo pesa más de ${MAX_MB} MB. Prueba con un PDF más ligero o pega el texto.`);
    if (!ACCEPT.split(",").includes(file.type)) return setError("Sube un PDF o una foto (JPG, PNG). Si lo tienes en Word, expórtalo a PDF.");
    await send({ fileDataUrl: await fileToDataUrl(file), fileName: file.name });
  }

  return (
    <details className={`${s.panel} ${s.importBox}`} open={defaultOpen || undefined} data-testid="import-dossier">
      <summary className={s.importSummary}>
        <strong>¿Ya tienes {kind === "creator" ? "un dossier" : "un dossier o una memoria"}?</strong>
        <span className={s.muted}>Súbelo y lo usamos de base. Solo te preguntaremos lo que falte.</span>
      </summary>
      <div className={s.importBody}>
        <label className={`btn btn-primary ${busy ? s.importBusy : ""}`} aria-disabled={busy}>
          {busy ? "Leyendo tu dossier…" : "Subir PDF o foto"}
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
          <textarea value={text} rows={3} placeholder={`O pega aquí el texto de tu ${noun}`} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label={`Texto de tu ${noun}`} />
          <button type="submit" className="btn btn-ghost" disabled={busy || !text.trim()}>
            Usar este texto
          </button>
        </form>
        <p className={s.muted}>Copiamos tus textos tal cual, sin reescribirlos. El archivo es tuyo: no entrenamos con él.</p>
        {busy && (
          <p className={s.sending} role="status">
            Leyendo tu dossier: tarda unos segundos…
          </p>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {done && !busy && (
          <div className={s.note} role="status" data-testid="import-done">
            {done.changedSectionKeys.length || done.changedProfileFields.length
              ? `Listo: hemos rellenado ${done.changedSectionKeys.length} ${done.changedSectionKeys.length === 1 ? "sección" : "secciones"} de tu dossier con tus textos. Revísalas abajo y cuéntanos lo que falte.`
              : "No hemos encontrado nada nuevo en este documento."}
            {done.worksFound.length > 0 && kind === "creator" ? (
              <>
                {" "}
                {done.worksFound.length === 1 ? "Aparece 1 obra" : `Aparecen ${done.worksFound.length} obras`}: <Link href={ROUTES.works}>{done.worksFound.length === 1 ? "fotografíala" : "fotografíalas"}</Link> para que{" "}
                {done.worksFound.length === 1 ? "salga" : "salgan"} con su ficha.
              </>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}
