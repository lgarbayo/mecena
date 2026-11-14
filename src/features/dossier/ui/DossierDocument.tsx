"use client";
/**
 * Editorial dossier (screen + print), a faithful port of fleet/design/dossier/{creator,business}.html.
 * Pure render of a DossierView: no data fetching, no hooks, so WP-01 can reuse it for the progressive build
 * (pass `progressive` and the per-section states; empty slots render as skeletons, never as placeholder text).
 * Styles live in ./dossier.css, scoped under .dossier-wall.
 */
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import type { CropSuggestion } from "@/contracts";
import { cropStyles, isIdentityCrop } from "@/features/works/image";
import { isAdapted, type BusinessView, type CreatorView, type DossierView, type FactRow, type SectionState, type VariantView, type WorkView } from "../model";
import { linkLabel, vocabFor, type ArtFamily } from "../arts";
import { DEFAULT_TITLES, designTokens, fontStack, type DossierDesign, type SectionTitleKey } from "../design";
import { planCreator, type Block } from "../structure";
import "./dossier.css";

type Slot = CSSProperties & { "--lines"?: number; "--skw"?: string };

export interface DossierDocumentProps {
  view: DossierView;
  /** Show pending sections as skeletons with hints (progressive build). Otherwise empty sections are hidden. */
  progressive?: boolean;
  className?: string;
  /** The design the artist asked for (design.ts). Omit to keep the stylesheet defaults. */
  design?: DossierDesign;
}

type Vars = CSSProperties & Record<`--${string}`, string>;

/** A design as CSS custom properties + data attributes, so the page and the PDF share one description. */
function designProps(design?: DossierDesign): { wall?: Vars; sheet?: Vars; attrs: Record<string, string> } {
  if (!design) return { attrs: {} };
  const t = designTokens(design);
  const { display, body, labels } = design.type;
  const sheet: Vars = { "--accent": t.accent, "--accent-soft": t.accentSoft };
  const bodyStack = fontStack(body.family, body.category);
  const displayStack = fontStack(display.family, display.category);
  const wall: Vars = {
    ...sheet,
    "--paper": t.paper,
    "--ink": t.ink,
    "--granite": t.granite,
    "--hair": t.hair,
    "--skel": t.hair,
    "--wall": t.wall,
    "--ground": t.ground,
    "--on-ink": t.onInk,
    "--ink-rule": t.inkRule,
    "--back-paper": design.palette.backPaper,
    "--back-ink": design.palette.backInk,
    "--serif": bodyStack,
    "--sans": labels === "display" ? displayStack : bodyStack,
    "--display-font": displayStack,
    "--display-weight": String(display.weight),
    "--display-tracking": `${display.tracking}em`,
    "--display-case": display.uppercase ? "uppercase" : "none",
    "--display-style": "normal",
    "--body-scale": String(body.scale),
    "--name-scale": String(design.cover.nameScale),
    "--radius": `${design.rhythm.corners}px`,
  };
  return {
    wall,
    sheet,
    attrs: {
      "data-design": "",
      "data-cover": design.cover.layout,
      "data-works": design.works.layout,
      "data-frame": design.works.frame,
      "data-density": design.rhythm.density,
      "data-rules": design.rhythm.rules,
      "data-texture": design.rhythm.texture,
    },
  };
}

/** Section names in the artist's own voice (design.titles), keyed by the default Spanish name. */
const TitlesContext = createContext<Record<string, string>>({});
const KEY_BY_DEFAULT = Object.fromEntries(Object.entries(DEFAULT_TITLES).map(([k, v]) => [v, k])) as Record<string, SectionTitleKey>;

function titlesFor(design?: DossierDesign): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, key] of Object.entries(KEY_BY_DEFAULT)) {
    const t = design?.titles?.[key];
    if (t) out[name] = t;
  }
  return out;
}

const HINTS: Record<string, string> = {
  cover: "Dime tu nombre, tu disciplina y dónde trabajas.",
  statement: "Cuéntame de dónde viene tu trabajo y qué te mueve a hacerlo.",
  bio: "¿Dónde te formaste y cómo llegaste a lo que haces hoy?",
  series: "Haz una foto de cada obra y dime título, año, técnica y medidas.",
  cv: "Exposiciones, premios, becas, residencias: con el año basta.",
  contact: "¿Cómo quieres que te escriban? Correo, web, Instagram…",
  activity: "Cuéntame a qué se dedica tu empresa y para quién trabajáis.",
  team: "¿Quién forma el equipo y qué hace cada persona?",
  projects: "Enséñame dos o tres proyectos de los que estés orgulloso u orgullosa.",
  figures: "Facturación, plantilla, año de fundación y CNAE.",
};

function Section({
  name,
  state,
  progressive,
  className = "sheet ruled",
  children,
  extra,
}: {
  name: string;
  state: SectionState;
  progressive?: boolean;
  className?: string;
  children: ReactNode;
  extra?: Record<string, string>;
}) {
  if (state === "pending" && !progressive) return null;
  return (
    <section className={className} data-section={name} data-state={state} {...extra}>
      {children}
    </section>
  );
}

function Rail({ name, sub }: { name: string; sub?: string }) {
  const titles = useContext(TitlesContext);
  return (
    <h2 className="rail">
      <span className="rail__name">{titles[name] ?? name}</span>
      {sub}
    </h2>
  );
}

function Hint({ k }: { k: string }) {
  return <p className="hint">{HINTS[k]}</p>;
}

function Prose({ paras, slot, lines = 4 }: { paras: string[]; slot: string; lines?: number }) {
  if (!paras.length) return <p data-slot={slot} style={{ "--lines": lines } as Slot} />;
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className={i === 0 ? "lead" : undefined}>
          {p}
        </p>
      ))}
    </>
  );
}

function Frame({ work, hint, alt }: { work?: Pick<WorkView, "imageUrl" | "title" | "crop">; hint: string; alt?: string }) {
  return (
    <div className="frame" data-hint={hint}>
      {work?.imageUrl && !isIdentityCrop(work.crop) ? (
        <CroppedPhoto src={work.imageUrl} alt={alt ?? work.title} crop={work.crop} />
      ) : /* eslint-disable-next-line @next/next/no-img-element -- user artwork, never re-encoded */ work?.imageUrl ? (
        <img
          src={work.imageUrl}
          alt={alt ?? work.title}
          loading="lazy"
          decoding="async"
          // A missing file falls back to the empty frame and its hint, never a broken-image icon.
          onError={(e) => e.currentTarget.remove()}
        />
      ) : null}
    </div>
  );
}

/**
 * The crop/straighten from /obras, shown with the same CSS as there (cropStyles) on the untouched original:
 * the crop box keeps its proportion and fits inside the frame (container query units), never squashed.
 */
function CroppedPhoto({ src, alt, crop }: { src: string; alt: string; crop?: CropSuggestion }) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const styles = cropStyles(crop, natural, { maxHeight: "100cqh" });
  return (
    <div className="frame__crop" style={natural ? styles.frame : { width: "100%", height: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user artwork, original bytes */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        style={natural ? styles.img : { width: "100%", height: "100%", objectFit: "contain" }}
        onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        onError={(e) => e.currentTarget.parentElement?.remove()}
        draggable={false}
      />
    </div>
  );
}

function CallHeader({ view }: { view: DossierView }) {
  if (!view.variant) return null;
  return (
    <div className="call-header" data-variant="call">
      <span>
        Dossier para: <span className="call-header__name">{view.variant.callName}</span>
      </span>
      {view.variant.callRef ? <span className="call-header__ref">{view.variant.callRef}</span> : null}
    </div>
  );
}

/** The call-adapted narrative (CCR-7): one ruled sheet per section, criteria it serves, gaps highlighted. */
function VariantSections({ variant }: { variant: VariantView }) {
  const n = variant.sections.length;
  return (
    <>
      {variant.sections.map((s, i) => (
        <section key={s.id} className="sheet ruled" data-section="variant" data-variant-section={s.id}>
          <Rail name="Para la convocatoria" sub={n > 1 ? `${i + 1} de ${n}` : undefined} />
          <div className="main prose">
            <h3 className="section-title">{s.heading}</h3>
            {s.criteria.length ? (
              <ul className="variant-criteria no-print" aria-label="Criterios que cubre">
                {s.criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
            {s.paras.map((parts, j) => (
              <p key={j} className={j === 0 ? "lead" : undefined}>
                {parts.map((part, k) =>
                  part.pending ? (
                    <mark key={k} className="pending-gap">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={k}>{part.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function workCaption(w: WorkView): ReactNode {
  const rest = [w.technique, w.size].filter(Boolean).join(", ");
  return (
    <>
      <cite>{w.title}</cite>
      {w.year ? `, ${w.year}` : ""}
      {rest ? `. ${rest}` : ""}
    </>
  );
}

/** The cover line is the statement's first sentence; skip it when it would repeat a one-sentence statement verbatim. */
function coverLine(view: DossierView): string {
  const body = view.kind === "creator" ? view.statement : view.activity;
  return body.length === 1 && body[0].trim() === view.tagline.trim() ? "" : view.tagline;
}

function Cover({ view, kicker, sub, progressive }: { view: DossierView; kicker: string; sub: [string, string]; progressive?: boolean }) {
  const w = view.cover;
  return (
    <Section name="cover" state={view.states.cover} progressive={progressive} className="sheet cover">
      <CallHeader view={view} />
      <header className="cover__head">
        <span>{kicker}</span>
        <span data-slot="meta.date">{view.date}</span>
      </header>
      {w || progressive ? (
        <figure className="cover__work">
          <Frame work={w} hint={view.kind === "creator" ? "Foto de la obra de portada" : "Foto del taller o de un proyecto"} />
          {w ? <figcaption className="cover__caption">{workCaption(w)}</figcaption> : null}
        </figure>
      ) : (
        <div />
      )}
      <div className="cover__text">
        <h1 className="cover__name" data-slot="profile.name">
          {view.name}
        </h1>
        <p className="cover__meta">
          <span data-slot="profile.discipline" style={{ "--skw": "16ch" } as Slot}>
            {sub[0]}
          </span>
          <span data-slot="profile.city" style={{ "--skw": "9ch" } as Slot}>
            {sub[1]}
          </span>
        </p>
        <p className="cover__line" data-slot="profile.tagline" style={{ "--lines": 2 } as Slot}>
          {coverLine(view)}
        </p>
      </div>
      {view.states.cover !== "ready" ? <Hint k="cover" /> : null}
    </Section>
  );
}

function Facts({ rows }: { rows: FactRow[] }) {
  return (
    <dl className="facts">
      {rows.map((r, i) => (
        <FactPair key={`${r.label}-${i}`} row={r} />
      ))}
    </dl>
  );
}

function FactPair({ row }: { row: FactRow }) {
  return (
    <>
      <dt>{row.label}</dt>
      <dd>
        {row.href ? (
          <a href={row.href} target={row.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
            {row.value}
          </a>
        ) : (
          row.value
        )}
      </dd>
    </>
  );
}

function Contact({ view, colophon, progressive }: { view: DossierView; colophon: string; progressive?: boolean }) {
  return (
    <Section name="contact" state={view.states.contact} progressive={progressive} className="sheet contact">
      <div className="ruled">
        <Rail name="Contacto" />
        <div className="main">
          <p className="contact__name" data-slot="profile.name">
            {view.name}
          </p>
          {view.contact.length ? <Facts rows={view.contact} /> : <p data-slot="contact.email" style={{ "--lines": 3, "--skw": "60%" } as Slot} />}
          {view.states.contact !== "ready" ? <Hint k="contact" /> : null}
        </div>
      </div>
      <p className="colophon">{colophon}</p>
    </Section>
  );
}

function Work({ w, family }: { w: WorkView; family: ArtFamily }) {
  const vocab = vocabFor(family);
  const measure = vocab.sizeLabel === "duration" ? w.duration || w.size : w.size || w.duration;
  return (
    <li className="work" data-work-id={w.id} data-media={w.mediaKind}>
      <Frame work={w} hint={vocab.photoHint} />
      <div className="label">
        <h4 className="label__title">
          <cite>{w.title || "Sin título"}</cite>
          {w.year ? <>, {w.year}</> : null}
        </h4>
        {w.technique ? <p className="label__tech">{w.technique}</p> : null}
        {measure ? <p className="label__size">{measure}</p> : null}
        {w.credits ? <p className="label__tech">{w.credits}</p> : null}
        {w.venue ? <p className="label__tech">{w.venue}</p> : null}
        <p className="label__cat">
          {vocab.cat} {w.catNo}
        </p>
        {w.confirmed ? null : (
          <p className="label__review no-print" data-testid="work-unreviewed">
            Ficha sin revisar: no entra en el PDF hasta que la confirmes en <a href="/obras">Obras</a>.
          </p>
        )}
        {w.concept ? <p className="label__concept">{w.concept}</p> : null}
        {w.links.length ? (
          <p className="label__links">
            {w.links.map((l, i) => (
              <a key={l} href={l} target="_blank" rel="noreferrer">
                {i ? " · " : ""}
                {linkLabel(l)}
              </a>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- creator

function CreatorDossier({ view: full, progressive, design }: { view: CreatorView; progressive?: boolean; design?: DossierDesign }) {
  const { view, blocks } = planCreator(full, design);
  const { states } = view;
  const vocab = vocabFor(view.family);
  // CCR-7: when the dossier is adapted to a call, the rewritten sections replace statement and bio.
  const adapted = isAdapted(view);
  const signature = [view.name, view.city, view.date.split(" ").pop()].filter(Boolean).join(", ");

  const render = (b: Block) => {
    switch (b.kind) {
      case "statement":
        return (
          <Section key="statement" name="statement" state={adapted ? "pending" : states.statement} progressive={progressive && !adapted}>
            <Rail name={b.title} />
            <div className="main prose">
              <Prose paras={view.statement} slot="profile.statement" lines={6} />
              {view.statement.length && view.name ? <p className="signature">{signature}</p> : null}
              {states.statement !== "ready" ? <Hint k="statement" /> : null}
            </div>
          </Section>
        );
      case "bio":
        if (!view.bio.length && !progressive) return null;
        return (
          <Section key="bio" name="bio" state={adapted ? "pending" : states.bio} progressive={progressive && !adapted}>
            <Rail name={b.title} />
            <div className="main prose">
              <Prose paras={view.bio} slot="profile.bio" lines={4} />
              {states.bio !== "ready" ? <Hint k="bio" /> : null}
            </div>
          </Section>
        );
      case "custom":
        return (
          <Section key={b.id} name="custom" state="ready" progressive={progressive}>
            <Rail name={b.title} />
            <div className="main prose">
              <Prose paras={b.paras} slot={b.id} lines={4} />
            </div>
          </Section>
        );
      case "works":
        if (!view.series.length && !progressive) return null;
        return view.series.length ? (
          view.series.map((s, i) => (
            <Section key={`series-${s.id}`} name="series" state={states.series} progressive={progressive} className="sheet ruled series" extra={{ "data-series-id": s.id }}>
              <Rail name={b.title} sub={view.series.length > 1 ? `${vocab.series} ${i + 1} de ${view.series.length}` : undefined} />
              <div className="main">
                {s.title || s.years || s.description.length ? (
                  <header className="series__head">
                    {s.title ? <h3 className="section-title">{s.title}</h3> : null}
                    {s.years ? <p className="series__years">{s.years}</p> : null}
                    {s.description.length ? (
                      <div className="series__text prose">
                        {s.description.map((p, j) => (
                          <p key={j}>{p}</p>
                        ))}
                      </div>
                    ) : null}
                  </header>
                ) : null}
                <ol className="works">
                  {s.works.map((w) => (
                    <Work key={w.id} w={w} family={view.family} />
                  ))}
                </ol>
              </div>
            </Section>
          ))
        ) : (
          <Section key="series" name="series" state={states.series} progressive={progressive} className="sheet ruled series">
            <Rail name={b.title} />
            <div className="main">
              <header className="series__head">
                <h3 className="section-title" data-slot="series[0].title" style={{ "--skw": "40%" } as Slot} />
              </header>
              <ol className="works">
                <li className="work">
                  <Frame hint={vocab.photoHint} />
                  <div className="label">
                    <p data-slot="series[0].works[0].title" style={{ "--lines": 3 } as Slot} />
                  </div>
                </li>
              </ol>
              <p className="hint">{vocab.worksHint}</p>
            </div>
          </Section>
        );
      case "cv":
        return (
          <Section key="cv" name="cv" state={states.cv} progressive={progressive}>
            <Rail name={b.title} />
            <div className="main">
              {view.cv.length ? (
                <div className="cv">
                  {view.cv.map((g) => (
                    <div key={g.key} className="cv__group" data-cv={g.key}>
                      <h3 className="cv__title">{g.title}</h3>
                      <ol className="cv__list">
                        {g.items.map((it, j) => (
                          <li key={j}>
                            <span className="cv__year">{it.year}</span>
                            <span>
                              {it.text}
                              {it.place ? (
                                <>
                                  {". "}
                                  <span className="cv__place">{it.place}</span>
                                </>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p data-slot="cv" style={{ "--lines": 5 } as Slot} />
              )}
              {states.cv !== "ready" ? <Hint k="cv" /> : null}
            </div>
          </Section>
        );
    }
  };

  return (
    <>
      <Cover view={view} kicker="Dossier artístico" sub={[view.discipline, view.city]} progressive={progressive} />
      {adapted && view.variant ? <VariantSections variant={view.variant} /> : null}
      {blocks.map(render)}
      <Contact
        view={view}
        progressive={progressive}
        colophon={`Obras y textos de ${view.name || "la artista o el artista"}. ${vocab.credit} Dossier maquetado con Mecena.`}
      />
    </>
  );
}

// ---------------------------------------------------------------- business

function BusinessDossier({ view, progressive }: { view: BusinessView; progressive?: boolean }) {
  const { states } = view;
  const adapted = isAdapted(view);
  const people = view.team.people;
  const teamSub =
    view.team.size !== undefined && people.length
      ? `${people.length} de ${view.team.size} ${view.team.size === 1 ? "persona" : "personas"}`
      : view.team.size !== undefined
        ? `${view.team.size} ${view.team.size === 1 ? "persona" : "personas"}`
        : undefined;
  const years = view.projects.works.map((w) => Number(w.year)).filter((n) => n > 1900);
  const projSub = years.length ? (Math.min(...years) === Math.max(...years) ? `Selección ${years[0]}` : `Selección ${Math.min(...years)}–${Math.max(...years)}`) : undefined;
  return (
    <>
      <Cover view={view} kicker="Dossier de empresa" sub={[view.activityShort, view.city]} progressive={progressive} />

      {adapted && view.variant ? <VariantSections variant={view.variant} /> : null}

      <Section name="activity" state={adapted ? "pending" : states.activity} progressive={progressive && !adapted}>
        <Rail name="Actividad" />
        <div className="main stack">
          <div className="prose">
            <Prose paras={view.activity} slot="company.activity" lines={5} />
          </div>
          {view.plan.idea || view.plan.needs.length ? (
            <div>
              <h3 className="block-title">Proyecto que buscamos financiar</h3>
              <dl className="facts">
                {view.plan.idea ? <FactPair row={{ label: "Idea", value: view.plan.idea }} /> : null}
                {view.plan.needs.length ? <FactPair row={{ label: "Necesidades", value: view.plan.needs.join(", ") }} /> : null}
              </dl>
            </div>
          ) : null}
          {states.activity !== "ready" ? <Hint k="activity" /> : null}
        </div>
      </Section>

      <Section name="team" state={adapted ? "pending" : states.team} progressive={progressive && !adapted}>
        <Rail name="Equipo" sub={teamSub} />
        <div className="main stack">
          {people.length ? (
            <ul className="team">
              {people.map((p, i) => (
                <li key={i} className="person">
                  <p className="person__name">{p.name}</p>
                  {p.role ? <p className="person__role">{p.role}</p> : null}
                  {p.bio ? <p className="person__bio">{p.bio}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {view.team.text.length ? (
            <div className="prose">
              {view.team.text.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
          {!people.length && !view.team.text.length ? (
            view.team.size !== undefined ? (
              <p className="section-title">{teamSub}</p>
            ) : (
              <p data-slot="team" style={{ "--lines": 3 } as Slot} />
            )
          ) : null}
          {states.team !== "ready" ? <Hint k="team" /> : null}
        </div>
      </Section>

      <Section name="projects" state={states.projects} progressive={progressive} className="sheet ruled series">
        <Rail name="Proyectos" sub={projSub} />
        <div className="main stack">
          {view.projects.text.length ? (
            <div className="prose">
              {view.projects.text.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
          {view.projects.works.length ? (
            <ol className="works">
              {view.projects.works.map((w) => (
                <Work key={w.id} w={w} family="diseno" />
              ))}
            </ol>
          ) : null}
          {view.projects.milestones.length ? (
            <div>
              <h3 className="block-title">Hitos</h3>
              <ol className="cv__list">
                {view.projects.milestones.map((m, i) => (
                  <li key={i}>
                    <span className="cv__year">{/^\d{4}/.exec(m)?.[0] ?? "·"}</span>
                    <span>{m.replace(/^\d{4}\s*[:.,–-]?\s*/, "")}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {states.projects !== "ready" ? <Hint k="projects" /> : null}
        </div>
      </Section>

      <Section name="figures" state={states.figures} progressive={progressive}>
        <Rail name="Cifras" sub="y datos de empresa" />
        <div className="main stack">
          {view.facts.length ? (
            <div>
              <h3 className="block-title">Datos de empresa</h3>
              <Facts rows={view.facts} />
            </div>
          ) : null}
          {view.location.length ? (
            <div>
              <h3 className="block-title">Ubicación</h3>
              <Facts rows={view.location} />
            </div>
          ) : null}
          {!view.facts.length && !view.location.length ? <p data-slot="company.figures" style={{ "--lines": 4 } as Slot} /> : null}
          {states.figures !== "ready" ? <Hint k="figures" /> : null}
        </div>
      </Section>

      <Contact view={view} progressive={progressive} colophon="Datos facilitados por la empresa. Dossier maquetado con Mecena." />
    </>
  );
}

export function DossierDocument({ view, progressive, className = "", design }: DossierDocumentProps) {
  const props = designProps(design);
  return (
    <TitlesContext.Provider value={titlesFor(design)}>
      <div className={`dossier-wall ${className}`.trim()} style={props.wall} {...props.attrs}>
        <article className="dossier" data-kind={view.kind} lang="es" style={props.sheet}>
          {view.kind === "creator" ? <CreatorDossier view={view} progressive={progressive} design={design} /> : <BusinessDossier view={view} progressive={progressive} />}
        </article>
      </div>
    </TitlesContext.Provider>
  );
}
