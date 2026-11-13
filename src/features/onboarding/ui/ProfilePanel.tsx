"use client";
import type { Profile, ProfileKind } from "@/contracts";
import { FIELD_LABELS, LEGAL_FORM_LABELS, ONBOARDING, PROFILE_ROWS } from "../copy";
import s from "./onboarding.module.css";

function values(profile: Profile | null, field: string): string[] {
  if (!profile) return [];
  const v = (profile as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String);
  if (field === "legalForm") return [LEGAL_FORM_LABELS[String(v)] ?? String(v)];
  if (field === "annualRevenueEur") return [`${Number(v).toLocaleString("es-ES")} €`];
  if (field === "employees") return [`${v} ${v === 1 ? "persona" : "personas"}`];
  return [String(v)];
}

/** Live profile: one row per field; filled values pop in as chips and flash when they change. */
export function ProfilePanel({ kind, profile, changed, version }: { kind: ProfileKind; profile: Profile | null; changed: Set<string>; version: number }) {
  const filled = PROFILE_ROWS[kind].filter((f) => values(profile, f).length > 0).length;
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
          return (
            <div key={field} className={`${s.row} ${vs.length ? s.rowFilled : ""}`} data-field={field} data-changed={isNew || undefined}>
              <dt>{FIELD_LABELS[field]}</dt>
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
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
