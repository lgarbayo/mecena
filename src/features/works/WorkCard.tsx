"use client";
/** One work: photo (crop shown with CSS, original one tap away) + its editable technical sheet. */
import { useEffect, useRef, useState } from "react";
import { MediaKind, type TechnicalSheet, type Work } from "@/contracts";
import { Button, Tag } from "@/components/ui";
import { MEDIA_KIND_LABEL, type ArtCopy, type Field, type SheetKey } from "./arts";
import type { WorkPatch } from "./client";
import { IDENTITY_CROP } from "./crop";
import { isIdentityCrop } from "./image";
import { linkLabel, normalizeLink } from "./links";
import { WorkPhoto } from "./WorkPhoto";
import s from "./works.module.css";

/** Fields a family does not show, but that are kept visible when the sheet already has them. */
const SPARE_FIELDS: Field[] = [
  { key: "technique", label: "Técnica o formato", placeholder: "", wide: true },
  { key: "dimensions", label: "Medidas", placeholder: "" },
  { key: "duration", label: "Duración", placeholder: "" },
  { key: "credits", label: "Créditos", placeholder: "", wide: true },
  { key: "venue", label: "Estreno o lugar", placeholder: "", wide: true },
  { key: "series", label: "Serie", placeholder: "", wide: true },
  { key: "concept", label: "Concepto", placeholder: "", wide: true, multiline: true },
];

type Draft = Record<SheetKey, string>;
const toDraft = (sh: TechnicalSheet): Draft => ({
  title: sh.title === "Sin título" ? "" : sh.title,
  year: sh.year ? String(sh.year) : "",
  technique: sh.technique ?? "",
  dimensions: sh.dimensions ?? "",
  series: sh.series ?? "",
  concept: sh.concept ?? "",
  duration: sh.duration ?? "",
  credits: sh.credits ?? "",
  venue: sh.venue ?? "",
});

export interface WorkCardProps {
  work: Work;
  index: number;
  total: number;
  copy: ArtCopy;
  highlight?: boolean;
  onSave(id: string, patch: WorkPatch): Promise<void>;
  onMove(id: string, direction: -1 | 1): void;
  onRemove(id: string): void;
}

export function WorkCard({ work, index, total, copy, highlight, onSave, onMove, onRemove }: WorkCardProps) {
  const shown = new Set(copy.fields.map((f) => f.key));
  const fields = [...copy.fields, ...SPARE_FIELDS.filter((f) => !shown.has(f.key) && work.sheet[f.key])];
  const [newLink, setNewLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const links = work.links ?? [];
  const [draft, setDraft] = useState<Draft>(() => toDraft(work.sheet));
  const [showOriginal, setShowOriginal] = useState(false);
  // Two kinds of save: the autosave on blur never disables "Confirmar ficha" (else the first tap after
  // editing a field is lost: blur -> disabled -> no click); only confirming does.
  const [confirming, setConfirming] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // What the draft would be had the artist not typed since the last server sheet: a field whose draft
  // differs from it (or that has the focus) is being written and must survive a server echo.
  const synced = useRef<Draft>(draft);
  const focused = useRef<SheetKey | null>(null);
  useEffect(() => {
    const server = toDraft(work.sheet);
    setDraft((d) => {
      const next = { ...server };
      for (const k of Object.keys(server) as SheetKey[]) if (k === focused.current || d[k] !== synced.current[k]) next[k] = d[k];
      return next;
    });
    synced.current = server;
  }, [work.sheet]);

  const hasCrop = !isIdentityCrop(work.crop);
  const canRestore = !hasCrop && !!work.suggestedCrop && !isIdentityCrop(work.suggestedCrop);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(work.sheet));
  const title = work.sheet.title || "Sin título";

  function sheetPatch(): Partial<TechnicalSheet> {
    const year = Number.parseInt(draft.year, 10);
    const out: Partial<TechnicalSheet> = {
      title: draft.title.trim() || "Sin título",
      // 0 = "cleared" (JSON cannot carry undefined); the server drops it.
      year: Number.isFinite(year) && year > 1000 && year < 3000 ? year : 0,
    };
    // Only fields on screen: a hidden field is never wiped by accident.
    for (const f of fields) if (f.key !== "title" && f.key !== "year") out[f.key] = draft[f.key].trim();
    return out;
  }

  function addLink() {
    const url = normalizeLink(newLink);
    if (!url) {
      setLinkError("Ese enlace no parece válido. Cópialo entero, por ejemplo https://vimeo.com/…");
      return;
    }
    setLinkError(null);
    setNewLink("");
    if (!links.includes(url)) void onSave(work.id, { links: [...links, url] });
  }

  async function save(extra: { confirmed?: boolean } = {}) {
    const set = extra.confirmed ? setConfirming : setAutosaving;
    set(true);
    try {
      await onSave(work.id, { ...(dirty || extra.confirmed ? { sheet: sheetPatch() } : {}), ...extra });
    } finally {
      set(false);
    }
  }

  const fieldEvents = (key: SheetKey) => ({
    onFocus: () => (focused.current = key),
    onBlur: () => {
      if (focused.current === key) focused.current = null;
      if (dirty) void save();
    },
  });

  return (
    <article className={`card ${s.workCard} ${highlight ? s.highlight : ""}`} aria-label={`${copy.noun[0].toUpperCase()}${copy.noun.slice(1)}: ${title}`}>
      <div className={s.workMedia}>
        <WorkPhoto src={work.imageUrl} alt={title} crop={work.crop} showOriginal={showOriginal} />
        <div className={s.photoActions}>
          {hasCrop ? (
            <>
              <button type="button" className={s.linkBtn} aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? "Ver recorte" : "Ver original"}
              </button>
              <button type="button" className={s.linkBtn} onClick={() => onSave(work.id, { crop: { ...IDENTITY_CROP } })}>
                Quitar recorte
              </button>
            </>
          ) : canRestore ? (
            <>
              <span className={s.muted}>Foto original, sin recorte</span>
              <button type="button" className={s.linkBtn} onClick={() => onSave(work.id, { crop: work.suggestedCrop })}>
                Restaurar recorte
              </button>
            </>
          ) : (
            <span className={s.muted}>Foto original, sin recorte</span>
          )}
        </div>
        {work.analysis === "failed" ? (
          <p className={s.notice} role="status">
            No hemos podido analizar la foto: la ficha sale solo de lo que has dicho y la foto va entera. Complétala a mano.
          </p>
        ) : null}
      </div>

      <div className={s.sheet}>
        <div className={s.sheetHead}>
          <span className={s.position}>{String(index + 1).padStart(2, "0")}</span>
          {work.confirmed ? <Tag tone="ok">Ficha confirmada</Tag> : <Tag tone="warn">Revisa la ficha</Tag>}
          {work.sheetSource === "voice" && <Tag>Con tus palabras</Tag>}
          <span className={s.reorder}>
            <button type="button" className={s.iconBtn} aria-label="Subir" disabled={index === 0} onClick={() => onMove(work.id, -1)}>
              ↑
            </button>
            <button type="button" className={s.iconBtn} aria-label="Bajar" disabled={index === total - 1} onClick={() => onMove(work.id, 1)}>
              ↓
            </button>
          </span>
        </div>

        <form
          className={s.fields}
          onSubmit={(e) => {
            e.preventDefault();
            void save({ confirmed: true });
          }}
        >
          {fields.map((f) => (
            <label key={f.key} className={`${s.field} ${f.wide ? s.wide : ""}`}>
              <span>{f.label}</span>
              {f.multiline ? (
                <textarea rows={3} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} {...fieldEvents(f.key)} />
              ) : (
                <input
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  inputMode={f.key === "year" ? "numeric" : undefined}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  {...fieldEvents(f.key)}
                />
              )}
            </label>
          ))}
          <div className={`${s.field} ${s.wide}`}>
            <span>Enlaces</span>
            {links.length > 0 && (
              <ul className={s.links}>
                {links.map((l) => (
                  <li key={l}>
                    <a href={l} target="_blank" rel="noopener noreferrer">
                      {linkLabel(l)}
                    </a>
                    <button type="button" className={s.linkBtn} aria-label={`Quitar enlace ${linkLabel(l)}`} onClick={() => onSave(work.id, { links: links.filter((x) => x !== l) })}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={s.linkAdd}>
              <input
                type="url"
                inputMode="url"
                value={newLink}
                placeholder="https://…"
                aria-label="Nuevo enlace"
                onChange={(e) => (setNewLink(e.target.value), setLinkError(null))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
              <Button type="button" variant="ghost" onClick={addLink} disabled={!newLink.trim()}>
                Añadir
              </Button>
            </div>
            {linkError ? (
              <p className={s.error} role="alert">
                {linkError}
              </p>
            ) : (
              <p className={s.muted}>{copy.linksHint}</p>
            )}
          </div>
          <label className={s.field}>
            <span>Tipo de obra</span>
            <select value={work.mediaKind ?? "image"} onChange={(e) => onSave(work.id, { mediaKind: MediaKind.parse(e.target.value) })}>
              {MediaKind.options.map((k) => (
                <option key={k} value={k}>
                  {MEDIA_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <div className={s.cardActions}>
            {work.confirmed && !dirty ? (
              <Button type="button" variant="ghost" onClick={() => onSave(work.id, { confirmed: false })}>
                Editar ficha
              </Button>
            ) : (
              // Keep the field's focus on press: the tap confirms (with the edited sheet) instead of being eaten by the blur autosave.
              <Button type="submit" disabled={confirming} onPointerDown={(e) => e.preventDefault()}>
                {confirming ? "Guardando…" : "Confirmar ficha"}
              </Button>
            )}
            {autosaving && !confirming ? (
              <span className={s.muted} role="status">
                Guardando…
              </span>
            ) : null}
            {confirmRemove ? (
              <span className={s.confirmRemove}>
                {copy.noun === "foto" ? "¿Quitar esta foto?" : copy.noun === "obra" ? "¿Quitar esta obra?" : copy.noun === "pieza" ? "¿Quitar esta pieza?" : `¿Quitar este ${copy.noun}?`}
                <Button type="button" variant="quiet" onClick={() => onRemove(work.id)}>
                  Sí, quitar
                </Button>
                <Button type="button" variant="quiet" onClick={() => setConfirmRemove(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button type="button" variant="quiet" onClick={() => setConfirmRemove(true)}>
                Quitar
              </Button>
            )}
          </div>
        </form>
      </div>
    </article>
  );
}
