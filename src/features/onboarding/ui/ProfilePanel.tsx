"use client";
import type { Profile, ProfileKind } from "@/contracts";
import { ONBOARDING, PROFILE_ROWS, fieldLabel } from "../copy";
import { profileValues as values } from "./format";
import s from "./onboarding.module.css";

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
              <dt>{fieldLabel(kind, field)}</dt>
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
