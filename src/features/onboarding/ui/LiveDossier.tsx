"use client";
/**
 * The hero of the onboarding: the profile and the dossier growing while the person talks. Compact by default (fits
 * under the orb on a projected phone): one pill per dossier section that lights up when it gets text, the profile as
 * chips that flash when they change, and the section that just changed sliding in. "Ver entero" opens a sheet with
 * the full profile, every section and the photographed works with their sheets.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DossierSection, Profile, ProfileKind, Work } from "@/contracts";
import { WorkPhoto } from "@/features/works/WorkPhoto";
import { ONBOARDING, sectionTitles } from "../copy";
import { STEPS_COPY as C } from "../steps";
import { DossierPanel } from "./DossierPanel";
import { flyChips } from "./flyIn";
import { filledRows } from "./format";
import { ProfilePanel } from "./ProfilePanel";
import s from "./live.module.css";
import { Icon } from "@/components/ui/icons";

const MAX_CHIPS = 8;

export interface LiveDossierProps {
  kind: ProfileKind;
  profile: Profile | null;
  sections: DossierSection[];
  changedSections: Set<string>;
  changedFields: Set<string>;
  /** Bumps on every turn result: re-keys what changed so its animation replays. */
  version: number;
  works?: Work[];
  freshWorkId?: string | null;
}

/** One line of a work's technical sheet: "Mareas · 2024 · óleo sobre lino · 50 × 70 cm". */
export function sheetLine(w: Work): string {
  const { title, year, technique, dimensions, duration } = w.sheet;
  return [title, year, technique, dimensions ?? duration].filter((x) => x !== undefined && x !== null && String(x).trim()).join(" · ");
}

function firstLines(body: string): string {
  return body
    .split(/\n+/)
    .map((l) => l.replace(/^\s*-\s+/, "").trim())
    .filter(Boolean)
    .join(" ");
}

export function LiveDossier({ kind, profile, sections, changedSections, changedFields, version, works = [], freshWorkId }: LiveDossierProps) {
  const [open, setOpen] = useState(false);
  // A pyme sees only its company card grow: the capability memoria adds nothing to its onboarding.
  const memoria = kind === "creator";
  const panelTitle = memoria ? ONBOARDING.dossierPanel[kind] : ONBOARDING.profilePanel[kind];
  const titles = memoria ? sectionTitles(kind) : {};
  const byKey = new Map(memoria ? sections.filter((x) => x.body.trim()).map((x) => [x.key as string, x]) : []);
  const total = Object.keys(titles).length;
  // The section to show in full: the one this turn changed, else the most recently written.
  const latest =
    (memoria && sections.find((x) => changedSections.has(x.key) && x.body.trim())) ||
    [...byKey.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0];
  const rows = filledRows(kind, profile);
  const chips = rows.flatMap((r) => r.values.map((v) => ({ field: r.field, label: r.label, value: v }))).slice(0, MAX_CHIPS);
  const empty = byKey.size === 0 && chips.length === 0 && works.length === 0;

  // New profile values fly in from the words that produced them (flyIn.ts). Only values that were not on screen
  // before: when a list field grows, the values it already had stay put.
  const chipsRef = useRef<HTMLUListElement>(null);
  const shown = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    const now = new Set(chips.map((c) => `${c.field}|${c.value}`));
    const before = shown.current;
    shown.current = now;
    if (!before || !chipsRef.current) return; // first render: nothing "arrives"
    const fresh = [...chipsRef.current.querySelectorAll<HTMLElement>("[data-chip]")].filter((el) => !before.has(el.dataset.chip ?? ""));
    const host = chipsRef.current.closest<HTMLElement>("[data-stage]");
    flyChips(fresh, host, host?.querySelector<HTMLElement>('[data-testid="transcript"]') ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per turn result
  }, [version]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <section className={s.live} aria-labelledby="live-dossier-title" data-testid="live-dossier">
        <header className={s.liveHead}>
          <h2 id="live-dossier-title" className={s.liveTitle}>
            {panelTitle}
          </h2>
          {memoria && (
            <span className={s.counter} data-testid="live-count">
              {byKey.size}/{total}
            </span>
          )}
          <button type="button" className={s.textBtn} onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="live-open">
            {C.liveOpen}
          </button>
        </header>

        {memoria && (
          <ol className={s.pills} aria-label="Secciones">
            {Object.entries(titles).map(([key, title]) => {
              const filled = byKey.has(key);
              const isNew = changedSections.has(key);
              return (
                <li
                  key={isNew ? `${key}-${version}` : key}
                  className={`${s.pill} ${filled ? s.pillOn : ""} ${isNew ? s.pillNew : ""}`}
                  data-section={key}
                  data-filled={filled || undefined}
                  data-changed={isNew || undefined}
                >
                  {filled ? <Icon name="check" size={14} /> : null}
                  {title}
                </li>
              );
            })}
          </ol>
        )}

        {empty && <p className={s.liveEmpty}>{C.liveEmpty[kind]}</p>}

        {chips.length > 0 && (
          <ul ref={chipsRef} className={s.chips} aria-label={ONBOARDING.profilePanel[kind]}>
            {chips.map((c) => {
              const isNew = changedFields.has(c.field);
              return (
                <li key={`${c.field}-${c.value}-${isNew ? version : 0}`} className={`${s.chip} ${isNew ? s.chipNew : ""}`} title={c.label} data-field={c.field} data-chip={`${c.field}|${c.value}`}>
                  {c.value}
                </li>
              );
            })}
          </ul>
        )}

        {latest && (
          <article key={`${latest.key}-${changedSections.has(latest.key) ? version : 0}`} className={`${s.latest} ${changedSections.has(latest.key) ? s.latestNew : ""}`} data-testid="live-latest">
            <h3>{latest.title || titles[latest.key]}</h3>
            <p>{firstLines(latest.body)}</p>
          </article>
        )}

        {works.length > 0 && (
          <ul className={s.works} aria-label={C.worksTitle} data-testid="live-works">
            {works.map((w) => (
              <li key={w.id} className={`${s.work} ${w.id === freshWorkId ? s.workNew : ""}`}>
                <div className={s.workThumb}>
                  <WorkPhoto src={w.imageUrl} alt={w.sheet.title} crop={w.crop} />
                </div>
                <span className={s.workLine}>{sheetLine(w)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <div className={s.sheetBackdrop} onClick={() => setOpen(false)}>
          <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="live-sheet-title" onClick={(e) => e.stopPropagation()} data-testid="live-sheet">
            <header className={s.sheetHead}>
              <h2 id="live-sheet-title">{panelTitle}</h2>
              <button type="button" className={s.sheetClose} onClick={() => setOpen(false)} aria-label={C.close}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className={s.sheetBody}>
              <ProfilePanel kind={kind} profile={profile} changed={changedFields} version={version} />
              {works.length > 0 && (
                <section className={s.sheetWorks} aria-label={C.worksTitle}>
                  <h3>{C.worksTitle}</h3>
                  <ul>
                    {works.map((w) => (
                      <li key={w.id}>
                        <div className={s.workThumbLg}>
                          <WorkPhoto src={w.imageUrl} alt={w.sheet.title} crop={w.crop} />
                        </div>
                        <div>
                          <strong>{w.sheet.title}</strong>
                          <span>{sheetLine(w).split(" · ").slice(1).join(" · ")}</span>
                          {w.sheet.concept && <p>{w.sheet.concept}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {memoria && <DossierPanel kind={kind} sections={sections} changed={changedSections} version={version} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
