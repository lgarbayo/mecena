"use client";
/**
 * Photo + one sentence -> technical sheet. The photo is downscaled in the browser and starts
 * uploading at once; meanwhile the artist dictates (or types) a line about the piece.
 */
import { useRef, useState } from "react";
import type { Work } from "@/contracts";
import { Button } from "@/components/ui";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { errorText, worksClient } from "./client";
import { downscalePhoto } from "./image";
import s from "./works.module.css";

type Upload = { state: "uploading" } | { state: "done"; work: Work } | { state: "error"; message: string };

export function CaptureWork({ business, profileId, onCreated }: { business?: boolean; profileId?: string; onCreated(work: Work): void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<Work> | null>(null);
  const dataUrl = useRef<string | null>(null);

  const speech = useSpeechRecognition({ onFinal: (t) => setNote((n) => (n ? `${n.trim()} ${t}` : t)) });

  function startUpload(url: string) {
    setUpload({ state: "uploading" });
    const p = worksClient.create(url, undefined, profileId);
    pending.current = p;
    p.then(
      (work) => pending.current === p && setUpload({ state: "done", work }),
      (e) => pending.current === p && setUpload({ state: "error", message: errorText(e) }),
    );
    p.catch(() => undefined);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const { dataUrl: url } = await downscalePhoto(file);
      dataUrl.current = url;
      setPreview(url);
      startUpload(url);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPreparing(false);
    }
  }

  function reset() {
    speech.stop();
    pending.current = null;
    dataUrl.current = null;
    setPreview(null);
    setUpload(null);
    setNote("");
    setError(null);
  }

  async function cancel() {
    const p = pending.current;
    reset();
    // The photo may already be stored: remove it so nothing is kept that the artist discarded.
    if (p) p.then((w) => worksClient.remove(w.id)).catch(() => undefined);
  }

  async function finish() {
    if (!pending.current) return;
    speech.stop();
    setBusy(true);
    setError(null);
    try {
      let work = await pending.current;
      const text = `${note} ${speech.interim}`.trim();
      if (text) work = await worksClient.describe(work.id, text);
      reset();
      onCreated(work);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <section className={`card ${s.capture}`} aria-busy={preparing}>
        <p className={s.captureLead}>{business ? "Haz una foto de un producto, tu taller o tu local." : "Haz una foto a la obra y dinos una frase sobre ella."}</p>
        <div className={s.captureButtons}>
          <label className={`btn btn-primary ${s.fileBtn} ${preparing ? s.disabled : ""}`}>
            <input type="file" accept="image/*" capture="environment" disabled={preparing} onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ""))} />
            {preparing ? "Preparando la foto…" : "📷 Hacer foto"}
          </label>
          <label className={`btn btn-ghost ${s.fileBtn} ${preparing ? s.disabled : ""}`}>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/*" disabled={preparing} onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ""))} />
            Elegir de la galería
          </label>
        </div>
        <p className={s.hint}>Consejo: foto de frente, con luz natural y la obra entera en el encuadre.</p>
        {error && <p className={s.error} role="alert">{error}</p>}
      </section>
    );
  }

  const uploading = upload?.state === "uploading";
  return (
    <section className={`card ${s.capture} ${s.captureActive}`}>
      <div className={s.captureRow}>
        <div className={s.thumb}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={preview} alt="Foto que acabas de hacer" />
          <span className={`${s.uploadChip} ${upload?.state === "error" ? s.chipError : upload?.state === "done" ? s.chipOk : ""}`} role="status">
            {uploading ? "Subiendo…" : upload?.state === "done" ? "Foto guardada" : "Error al subir"}
          </span>
        </div>
        <div className={s.voice}>
          <label htmlFor="work-note" className={s.voiceLabel}>
            {business ? "Cuéntanos qué es" : "Cuéntanos la obra en una frase"}
          </label>
          <textarea
            id="work-note"
            rows={4}
            value={speech.listening && speech.interim ? `${note} ${speech.interim}`.trim() : note}
            onChange={(e) => setNote(e.target.value)}
            readOnly={speech.listening}
            placeholder={business ? "«Se llama Taza Mar, cerámica esmaltada, 10 por 8»" : "«Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras»"}
          />
          <div className={s.voiceActions}>
            {speech.supported && (
              <Button type="button" variant={speech.listening ? "primary" : "ghost"} onClick={speech.listening ? speech.stop : speech.start} aria-pressed={speech.listening}>
                {speech.listening ? "■ Parar" : "🎙 Dictar"}
              </Button>
            )}
            {speech.listening && <span className={s.live}>Te escucho…</span>}
          </div>
          {speech.error && <p className={s.hint}>{speech.error}</p>}
        </div>
      </div>
      {upload?.state === "error" && (
        <p className={s.error} role="alert">
          {upload.message}{" "}
          <button type="button" className={s.linkBtn} onClick={() => dataUrl.current && startUpload(dataUrl.current)}>
            Reintentar
          </button>
        </p>
      )}
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.cardActions}>
        <Button type="button" onClick={finish} disabled={busy || upload?.state === "error"}>
          {busy ? (uploading ? "Terminando de subir…" : "Escribiendo la ficha…") : "Crear ficha"}
        </Button>
        <Button type="button" variant="quiet" onClick={cancel} disabled={busy}>
          Descartar foto
        </Button>
      </div>
    </section>
  );
}
