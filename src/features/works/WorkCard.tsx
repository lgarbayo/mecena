"use client";
/** One work: photo (crop shown with CSS, original one tap away) + its editable technical sheet. */
import { useEffect, useState } from "react";
import type { TechnicalSheet, Work } from "@/contracts";
import { Button, Tag } from "@/components/ui";
import { IDENTITY_CROP } from "./crop";
import { isIdentityCrop } from "./image";
import { WorkPhoto } from "./WorkPhoto";
import s from "./works.module.css";

type Field = { key: Exclude<keyof TechnicalSheet, "year"> | "year"; label: string; placeholder: string; wide?: boolean; multiline?: boolean };

const CREATOR_FIELDS: Field[] = [
  { key: "title", label: "Título", placeholder: "Sin título", wide: true },
  { key: "year", label: "Año", placeholder: "2025" },
  { key: "dimensions", label: "Medidas", placeholder: "50 x 70 cm" },
  { key: "technique", label: "Técnica", placeholder: "acuarela sobre papel", wide: true },
  { key: "series", label: "Serie", placeholder: "Redeiras", wide: true },
  { key: "concept", label: "Concepto", placeholder: "Qué cuenta esta obra, con tus palabras", wide: true, multiline: true },
];
const BUSINESS_FIELDS: Field[] = [
  { key: "title", label: "Nombre", placeholder: "Producto, taller o local", wide: true },
  { key: "year", label: "Año", placeholder: "2025" },
  { key: "dimensions", label: "Medidas", placeholder: "Opcional" },
  { key: "technique", label: "Material o proceso", placeholder: "cerámica esmaltada", wide: true },
  { key: "series", label: "Línea o colección", placeholder: "Opcional", wide: true },
  { key: "concept", label: "Descripción", placeholder: "Para qué sirve, qué lo hace especial", wide: true, multiline: true },
];

type Draft = Record<Field["key"], string>;
const toDraft = (sh: TechnicalSheet): Draft => ({
  title: sh.title === "Sin título" ? "" : sh.title,
  year: sh.year ? String(sh.year) : "",
  technique: sh.technique ?? "",
  dimensions: sh.dimensions ?? "",
  series: sh.series ?? "",
  concept: sh.concept ?? "",
});

export interface WorkCardProps {
  work: Work;
  index: number;
  total: number;
  business?: boolean;
  highlight?: boolean;
  onSave(id: string, patch: { sheet?: Partial<TechnicalSheet>; confirmed?: boolean; crop?: Work["crop"] }): Promise<void>;
  onMove(id: string, direction: -1 | 1): void;
  onRemove(id: string): void;
}

export function WorkCard({ work, index, total, business, highlight, onSave, onMove, onRemove }: WorkCardProps) {
  const fields = business ? BUSINESS_FIELDS : CREATOR_FIELDS;
  const [draft, setDraft] = useState<Draft>(() => toDraft(work.sheet));
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setDraft(toDraft(work.sheet)), [work.sheet]);

  const hasCrop = !isIdentityCrop(work.crop);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(work.sheet));
  const title = work.sheet.title || "Sin título";

  function sheetPatch(): Partial<TechnicalSheet> {
    const year = Number.parseInt(draft.year, 10);
    return {
      title: draft.title.trim() || "Sin título",
      // 0 = "cleared" (JSON cannot carry undefined); the server drops it.
      year: Number.isFinite(year) && year > 1000 && year < 3000 ? year : 0,
      technique: draft.technique.trim(),
      dimensions: draft.dimensions.trim(),
      series: draft.series.trim(),
      concept: draft.concept.trim(),
    };
  }

  async function save(extra: { confirmed?: boolean } = {}) {
    setSaving(true);
    try {
      await onSave(work.id, { ...(dirty || extra.confirmed ? { sheet: sheetPatch() } : {}), ...extra });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`card ${s.workCard} ${highlight ? s.highlight : ""}`} aria-label={`Obra: ${title}`}>
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
          ) : (
            <span className={s.muted}>Foto original, sin recorte</span>
          )}
        </div>
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
                <textarea rows={3} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur={() => dirty && void save()} />
              ) : (
                <input
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  inputMode={f.key === "year" ? "numeric" : undefined}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  onBlur={() => dirty && void save()}
                />
              )}
            </label>
          ))}
          <div className={s.cardActions}>
            {work.confirmed && !dirty ? (
              <Button type="button" variant="ghost" onClick={() => onSave(work.id, { confirmed: false })}>
                Editar ficha
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Confirmar ficha"}
              </Button>
            )}
            {confirmRemove ? (
              <span className={s.confirmRemove}>
                ¿Quitar esta obra?
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
