"use client";
import { useState, type FormEvent } from "react";
import type { Profile, ProfileKind, ProfilePatch } from "@/contracts";
import { LEGAL_FORM_LABELS, ONBOARDING, PROFILE_ROWS, fieldLabel } from "../copy";
import { profileValues as values } from "./format";
import s from "./onboarding.module.css";

const LIST_FIELDS = new Set(["disciplines", "achievements", "education", "links", "fundingNeeds", "languages"]);
const NUMBER_FIELDS = new Set(["employees", "foundedYear", "annualRevenueEur"]);
/** Where the calls check residence: the place you live or are registered in, not where you were born. */
const HINTS: Record<string, string> = {
  city: "Donde vives y estás empadronado/a (o la sede). Es lo que miran las bases.",
};

/** The raw value of a field as the editor shows it: lists one per line, numbers as digits. */
function draftOf(profile: Profile | null, field: string): string {
  const v = profile ? (profile as Record<string, unknown>)[field] : undefined;
  if (v === undefined || v === null) return "";
  return Array.isArray(v) ? v.join("\n") : String(v);
}

function patchOf(field: string, draft: string): ProfilePatch | null {
  if (LIST_FIELDS.has(field)) return { [field]: draft.split("\n").map((x) => x.trim()).filter(Boolean) } as ProfilePatch;
  if (NUMBER_FIELDS.has(field)) {
    const n = Number(draft.replace(/[^\d]/g, ""));
    return draft.trim() && Number.isFinite(n) ? ({ [field]: n } as ProfilePatch) : null;
  }
  if (field === "legalForm") return draft ? ({ legalForm: draft } as ProfilePatch) : null;
  return { [field]: draft.trim() } as ProfilePatch;
}

/** Live profile: one row per field; filled values pop in as chips and flash when they change. With onEdit, every row can be corrected by hand. */
export function ProfilePanel({
  kind,
  profile,
  changed,
  version,
  onEdit,
}: {
  kind: ProfileKind;
  profile: Profile | null;
  changed: Set<string>;
  version: number;
  onEdit?: (patch: ProfilePatch) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const filled = PROFILE_ROWS[kind].filter((f) => values(profile, f).length > 0).length;

  const open = (field: string) => {
    setEditing(field);
    setDraft(draftOf(profile, field));
    setError(false);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !onEdit) return;
    const patch = patchOf(editing, draft);
    if (!patch) return setEditing(null);
    setSaving(true);
    setError(false);
    try {
      await onEdit(patch);
      setEditing(null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={s.panel} aria-labelledby="profile-panel-title">
      <header className={s.panelHead}>
        <h2 id="profile-panel-title">{ONBOARDING.profilePanel[kind]}</h2>
        <span className={s.counter}>
          {filled}/{PROFILE_ROWS[kind].length}
        </span>
      </header>
      <dl className={s.rows}>
        {PROFILE_ROWS[kind].map((field) => {
          const vs = values(profile, field);
          const isNew = changed.has(field);
          const label = fieldLabel(kind, field);
          if (editing === field)
            return (
              <div key={field} className={`${s.row} ${s.rowEditing}`} data-field={field}>
                <dt>{label}</dt>
                <dd>
                  <form className={s.rowForm} onSubmit={save} data-testid={`edit-${field}`}>
                    {field === "legalForm" ? (
                      <select value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} autoFocus>
                        <option value="">—</option>
                        {Object.entries(LEGAL_FORM_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : LIST_FIELDS.has(field) ? (
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} rows={Math.min(6, Math.max(2, draft.split("\n").length + 1))} placeholder="Uno por línea" autoFocus />
                    ) : (
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} inputMode={NUMBER_FIELDS.has(field) ? "numeric" : undefined} enterKeyHint="done" autoFocus />
                    )}
                    {HINTS[field] && <small className={s.rowHint}>{HINTS[field]}</small>}
                    {error && <small className={s.rowError}>No se ha guardado. Prueba otra vez.</small>}
                    <span className={s.rowActions}>
                      <button type="button" className={s.rowBtn} onClick={() => setEditing(null)} disabled={saving}>
                        Cancelar
                      </button>
                      <button type="submit" className={`${s.rowBtn} ${s.rowBtnMain}`} disabled={saving}>
                        {saving ? "Guardando…" : "Guardar"}
                      </button>
                    </span>
                  </form>
                </dd>
              </div>
            );
          return (
            <div key={field} className={`${s.row} ${vs.length ? s.rowFilled : ""}`} data-field={field} data-changed={isNew || undefined}>
              <dt>{label}</dt>
              <dd>
                {vs.length === 0 ? (
                  <span className={s.chipEmpty}>—</span>
                ) : (
                  vs.map((v) => (
                    <span key={`${v}-${isNew ? version : 0}`} className={`${s.chip} ${isNew ? s.flash : ""}`}>
                      {v}
                    </span>
                  ))
                )}
                {onEdit && (
                  <button type="button" className={s.rowEdit} onClick={() => open(field)} aria-label={`Editar ${label}`} data-testid={`edit-open-${field}`}>
                    Editar
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
