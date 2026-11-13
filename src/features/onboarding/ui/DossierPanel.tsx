"use client";
import type { DossierSection, ProfileKind } from "@/contracts";
import { ONBOARDING, sectionTitles } from "../copy";
import s from "./onboarding.module.css";

function Body({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.trim().startsWith("- ")))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.trim().slice(2)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{b}</p>;
      })}
    </>
  );
}

/** Live dossier: every section of the kind, empty ones as placeholders; changed ones animate in. */
export function DossierPanel({ kind, sections, changed, version }: { kind: ProfileKind; sections: DossierSection[]; changed: Set<string>; version: number }) {
  const titles = sectionTitles(kind);
  const byKey = new Map(sections.map((x) => [x.key as string, x]));
  return (
    <section className={`${s.panel} ${s.dossier}`} aria-labelledby="dossier-panel-title" aria-live="polite">
      <header className={s.panelHead}>
        <h2 id="dossier-panel-title">{ONBOARDING.dossierPanel[kind]}</h2>
        <span className={s.counter}>
          {sections.length}/{Object.keys(titles).length}
        </span>
      </header>
      {sections.length === 0 && <p className={s.muted}>{ONBOARDING.dossierEmpty[kind]}</p>}
      <div className={s.sections}>
        {Object.entries(titles).map(([key, title]) => {
          const sec = byKey.get(key);
          if (!sec)
            return (
              <article key={key} className={`${s.section} ${s.sectionEmpty}`} data-section={key}>
                <h3>{title}</h3>
                <span className={s.pending}>{ONBOARDING.sectionPending}</span>
              </article>
            );
          const isNew = changed.has(key);
          return (
            <article key={isNew ? `${key}-${version}` : key} className={`${s.section} ${isNew ? s.sectionNew : ""}`} data-section={key} data-changed={isNew || undefined}>
              <h3>{sec.title || title}</h3>
              <div className={s.sectionBody}>
                <Body text={sec.body} />
              </div>
              <p className={s.provenance}>
                {ONBOARDING.fromYourWords} · {sec.sourceSegmentIds.length} {sec.sourceSegmentIds.length === 1 ? "fragmento" : "fragmentos"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
