/**
 * Server-only A4 PDF of the dossier with @react-pdf/renderer. A faithful port of fleet/design/dossier
 * (print styles): full-bleed cover and back cover, a left "rail" with the section name, wall labels in
 * museum order, one series per page, works never split, page numbers bottom right.
 * Components are pure functions of the view model (no hooks), so tests can walk the tree.
 */
import path from "node:path";
import fs from "node:fs";
import type { ComponentProps, ReactNode } from "react";
import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BusinessView, CreatorView, CvGroup, DossierView, FactRow, WorkView } from "../model";
import type { PdfImage } from "./images";
import { styleTokens, type StyleTokens } from "../style";
import { DEFAULT_TITLES, type DossierDesign } from "../design";
import type { PdfFaces } from "./fonts";

export type PdfTokens = StyleTokens & { design?: DossierDesign };

// ---------------------------------------------------------------- fonts

const FONT_DIR = path.join(process.cwd(), "src/features/dossier/fonts");
let fontsReady: boolean | undefined;

/** Registers Schibsted Grotesk + Newsreader (full Latin, accents and ñ). Falls back to Helvetica/Times. */
export function registerFonts(): boolean {
  if (fontsReady !== undefined) return fontsReady;
  const f = (name: string) => path.join(FONT_DIR, name);
  fontsReady = ["SchibstedGrotesk-400-normal.ttf", "Newsreader-400-normal.ttf"].every((n) => fs.existsSync(f(n)));
  if (fontsReady) {
    Font.register({
      family: "Sans",
      fonts: [
        { src: f("SchibstedGrotesk-400-normal.ttf"), fontWeight: 400 },
        { src: f("SchibstedGrotesk-500-normal.ttf"), fontWeight: 500 },
        { src: f("SchibstedGrotesk-600-normal.ttf"), fontWeight: 600 },
      ],
    });
    Font.register({
      family: "Serif",
      fonts: [
        { src: f("Newsreader-400-normal.ttf"), fontWeight: 400 },
        { src: f("Newsreader-500-normal.ttf"), fontWeight: 500 },
        { src: f("Newsreader-400-italic.ttf"), fontWeight: 400, fontStyle: "italic" },
        { src: f("Newsreader-500-italic.ttf"), fontWeight: 500, fontStyle: "italic" },
      ],
    });
  } else {
    console.warn("[dossier] fonts not found, using built-in PDF fonts");
  }
  // Never hyphenate names or Galician words with English rules.
  Font.registerHyphenationCallback((word) => [word]);
  return fontsReady;
}

// ---------------------------------------------------------------- tokens

const mm = (n: number) => n * 2.8346;
/** Default palette ("sobrio"); a render can pass other tokens from style.ts. */
const SOBRIO = styleTokens("sobrio", "creator");
const M = { top: mm(18), side: mm(17), bottom: mm(20) };

function makeStyles(fonts: boolean, C: PdfTokens = SOBRIO, faces: PdfFaces = {}) {
  const sans = fonts ? "Sans" : "Helvetica";
  const serif = fonts ? "Serif" : "Times-Roman";
  const display = faces.display ?? (C.display === "serif" ? serif : sans);
  const custom = !!faces.display;
  const dt = C.design?.type.display;
  // A downloaded face is registered as a single weight/style: ask for exactly that, never a synthetic variant.
  const displayFace = (size: number, bundledWeight: number, bundledTracking: number) => ({
    fontFamily: display,
    fontWeight: custom ? 400 : C.display === "serif" ? 400 : dt ? Math.min(700, Math.max(400, dt.weight)) : bundledWeight,
    letterSpacing: dt ? dt.tracking * size : bundledTracking,
    textTransform: (dt?.uppercase ? "uppercase" : "none") as "uppercase" | "none",
  });
  const back = { paper: C.design?.palette.backPaper ?? C.ink, ink: C.design?.palette.backInk ?? C.paper };
  const titles: Record<string, string> = {};
  for (const [k, v] of Object.entries(DEFAULT_TITLES)) {
    const t = C.design?.titles?.[k as keyof typeof DEFAULT_TITLES];
    if (t) titles[v] = t;
  }
  return {
    sans,
    serif,
    display,
    back,
    titles,
    worksBelow: !!C.design && C.design.works.layout !== "cartela-lateral",
    nameFirst: C.design?.cover.layout === "nombre-primero",
    t: C,
    s: StyleSheet.create({
      page: { backgroundColor: C.design ? C.paper : "#ffffff", color: C.ink, fontFamily: serif, fontSize: 9.5, lineHeight: 1.55, paddingTop: M.top, paddingBottom: M.bottom, paddingHorizontal: M.side },
      full: { backgroundColor: C.paper, color: C.ink, fontFamily: serif, fontSize: 9.5, padding: `${M.top} ${M.side}`, display: "flex", flexDirection: "column" },
      folio: { position: "absolute", bottom: mm(9), right: M.side, fontFamily: sans, fontSize: 7.5, color: C.granite },
      // rail layout
      ruled: { flexDirection: "row" },
      rail: { width: mm(34), marginRight: mm(7), borderTopWidth: 2, borderTopColor: C.ink, paddingTop: 4, fontFamily: sans, fontSize: 7.5, fontWeight: 500, color: C.granite, lineHeight: 1.35 },
      railName: { color: C.ink },
      main: { flex: 1, borderTopWidth: 0.6, borderTopColor: C.hair, paddingTop: 4 },
      sectionTitle: { ...displayFace(24, 500, -0.6), fontSize: 24, lineHeight: 1.05, marginBottom: 6 },
      // cover
      coverHead: { flexDirection: "row", justifyContent: "space-between", fontFamily: sans, fontSize: 7.5, color: C.granite },
      callHeader: { flexDirection: "row", justifyContent: "space-between", fontFamily: sans, fontSize: 7.5, marginTop: -M.top, marginHorizontal: -M.side, marginBottom: mm(10), paddingVertical: mm(4), paddingHorizontal: M.side, borderBottomWidth: 0.8 },
      coverFigure: { marginTop: mm(8), marginBottom: mm(7) },
      frame: { backgroundColor: C.flatFrames ? undefined : C.ground, alignItems: "center", justifyContent: "center", padding: C.flatFrames ? 0 : 14 },
      frameImg: { objectFit: "contain", width: "100%", height: "100%" },
      frameEmpty: { fontFamily: serif, fontStyle: "italic", fontSize: 10, color: C.granite, textAlign: "center", paddingHorizontal: 20 },
      caption: { fontSize: 7.5, color: C.granite, textAlign: "right", marginTop: 5 },
      coverText: { borderTopWidth: 2, borderTopColor: C.ink, paddingTop: 10 },
      coverName: { ...displayFace(50 * (C.design?.cover.nameScale ?? 1), 500, -2), fontSize: 50 * Math.min(1.15, C.design?.cover.nameScale ?? 1), lineHeight: 0.95, marginBottom: 14 },
      coverRow: { flexDirection: "row" },
      coverMeta: { flex: 1, marginRight: mm(7), fontFamily: sans, fontSize: 10, lineHeight: 1.35 },
      coverLine: { flex: 1, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.3 },
      // prose
      lead: { fontSize: 12.5, lineHeight: 1.4, marginBottom: 8 },
      p: { marginBottom: 7 },
      signature: { marginTop: 14, fontFamily: sans, fontSize: 7.5, color: C.granite },
      // works
      years: { fontFamily: sans, fontSize: 9.5, color: C.granite, marginBottom: 10 },
      seriesText: { marginBottom: mm(8), maxWidth: 330 },
      work: { flexDirection: "row", alignItems: "flex-end", marginBottom: mm(9) },
      workFrame: { flex: 2.4, height: mm(98), marginRight: mm(7) },
      label: { flex: 1, fontSize: 8.5, lineHeight: 1.45, paddingBottom: 2 },
      labelCat: { fontFamily: sans, fontSize: 7.5, color: C.granite, marginTop: 3 },
      labelTitle: { fontSize: 10.5, lineHeight: 1.25, marginBottom: 2 },
      cite: { fontStyle: "italic", fontWeight: 500 },
      muted: { color: C.granite },
      concept: { marginTop: 7, paddingTop: 5, borderTopWidth: 0.6, borderTopColor: C.hair },
      // cv
      cvCols: { flexDirection: "row" },
      cvCol: { flex: 1 },
      cvGroup: { marginBottom: 16 },
      blockTitle: { fontFamily: sans, fontWeight: 600, fontSize: 8.5, marginBottom: 5 },
      cvRow: { flexDirection: "row", borderTopWidth: 0.6, borderTopColor: C.hair, paddingVertical: 3.5, fontSize: 8.5, lineHeight: 1.4 },
      cvYear: { width: 27, fontFamily: sans, fontSize: 7.5, color: C.granite, paddingTop: 1 },
      // facts
      factRow: { flexDirection: "row", borderTopWidth: 0.6, borderTopColor: C.hair, paddingVertical: 4 },
      factLabel: { width: mm(36), fontFamily: sans, fontSize: 7.5, color: C.granite, paddingTop: 1.5 },
      factValue: { flex: 1 },
      // team
      team: { flexDirection: "row", flexWrap: "wrap" },
      person: { width: "47%", marginRight: "3%", borderTopWidth: 0.6, borderTopColor: C.hair, paddingTop: 5, marginBottom: 14 },
      personName: { fontFamily: sans, fontWeight: 500, fontSize: 10 },
      personRole: { fontFamily: sans, fontSize: 7.5, color: C.granite, marginBottom: 3 },
      // contact
      contact: { backgroundColor: C.design?.palette.backPaper ?? C.ink, color: C.design?.palette.backInk ?? C.paper, fontFamily: serif, fontSize: 9.5, padding: `${M.top} ${M.side}`, display: "flex", flexDirection: "column", justifyContent: "space-between" },
      contactName: { ...displayFace(32, 500, -1.1), fontSize: 32, lineHeight: 1, marginBottom: 20 },
      colophon: { fontFamily: sans, fontSize: 7, color: C.onInk, maxWidth: 330 },
      block: { marginTop: mm(12) },
    }),
  };
}

type S = ReturnType<typeof makeStyles>;
export type ImageMap = Record<string, PdfImage | undefined>;

// ---------------------------------------------------------------- pieces

function Folio({ st }: { st: S }) {
  return <Text style={st.s.folio} fixed render={({ pageNumber }) => String(pageNumber)} />;
}

function Rail({ st, name, sub, onInk }: { st: S; name: string; sub?: string; onInk?: boolean }) {
  return (
    <View style={[st.s.rail, onInk ? { borderTopColor: st.back.ink, color: st.t.onInk } : {}]}>
      <Text style={onInk ? { color: st.back.ink } : st.s.railName}>{st.titles[name] ?? name}</Text>
      {sub ? <Text>{sub}</Text> : null}
    </View>
  );
}

function Ruled({ st, name, sub, children, onInk, wrap = true }: { st: S; name: string; sub?: string; children: ReactNode; onInk?: boolean; wrap?: boolean }) {
  return (
    <View style={st.s.ruled} wrap={wrap}>
      <Rail st={st} name={name} sub={sub} onInk={onInk} />
      <View style={[st.s.main, onInk ? { borderTopColor: st.t.inkRule } : {}]}>{children}</View>
    </View>
  );
}

function Prose({ st, paras, leadFirst = true }: { st: S; paras: string[]; leadFirst?: boolean }) {
  return (
    <View>
      {paras.map((p, i) => (
        <Text key={i} style={i === 0 && leadFirst ? st.s.lead : st.s.p} orphans={3} widows={3}>
          {p}
        </Text>
      ))}
    </View>
  );
}

function Frame({ st, work, images, style }: { st: S; work?: WorkView; images: ImageMap; style: ComponentProps<typeof View>["style"] }) {
  const img = work ? images[work.imageUrl] : undefined;
  return (
    <View style={[st.s.frame, style]}>
      {img ? <Image src={img} style={st.s.frameImg} /> : <Text style={st.s.frameEmpty}>{work ? work.title : ""}</Text>}
    </View>
  );
}

function Label({ st, work, cat }: { st: S; work: WorkView; cat: string }) {
  return (
    <View style={st.worksBelow ? [st.s.label, { flexGrow: 0, flexShrink: 0, flexBasis: "auto", maxWidth: 360, paddingBottom: 0 }] : st.s.label}>
      <Text style={st.s.labelTitle}>
        <Text style={st.s.cite}>{work.title}</Text>
        {work.year ? `, ${work.year}` : ""}
      </Text>
      {work.technique ? <Text style={st.s.muted}>{work.technique}</Text> : null}
      {work.size ? <Text style={st.s.muted}>{work.size}</Text> : null}
      <Text style={st.s.labelCat}>{cat}</Text>
      {work.concept ? <Text style={st.s.concept}>{work.concept}</Text> : null}
    </View>
  );
}

function WorkRow({ st, work, images, cat }: { st: S; work: WorkView; images: ImageMap; cat: string }) {
  return (
    <View style={st.worksBelow ? { marginBottom: mm(9) } : st.s.work} wrap={false}>
      <Frame st={st} work={work} images={images} style={st.worksBelow ? { height: mm(92), marginBottom: mm(4) } : st.s.workFrame} />
      <Label st={st} work={work} cat={cat} />
    </View>
  );
}

function Facts({ st, rows, onInk }: { st: S; rows: FactRow[]; onInk?: boolean }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View key={i} style={[st.s.factRow, onInk ? { borderTopColor: st.t.inkRule } : {}]} wrap={false}>
          <Text style={[st.s.factLabel, onInk ? { color: st.t.onInk } : {}]}>{r.label}</Text>
          {r.href ? (
            <Link src={r.href} style={[st.s.factValue, { color: onInk ? st.back.ink : st.t.ink, textDecoration: "none" }]}>
              {r.value}
            </Link>
          ) : (
            <Text style={st.s.factValue}>{r.value}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function CallHeader({ st, view, kind }: { st: S; view: DossierView; kind: "creator" | "business" }) {
  if (!view.variant) return null;
  const a = { accent: st.t.accent, soft: st.t.accentSoft };
  return (
    <View style={[st.s.callHeader, { backgroundColor: a.soft, borderBottomColor: a.accent }]}>
      <Text>
        Dossier para: <Text style={{ fontWeight: 600 }}>{view.variant.callName}</Text>
      </Text>
      {view.variant.callRef ? <Text style={st.s.muted}>{view.variant.callRef}</Text> : null}
    </View>
  );
}

function Cover({ st, view, images, kicker, meta }: { st: S; view: DossierView; images: ImageMap; kicker: string; meta: string[] }) {
  const w = view.cover;
  // Fixed frame height so the cover is always exactly one page (long names take two lines).
  const nameLines = (view.name || "Dossier").length > 15 ? 2 : 1;
  const frameH = mm(184) - (nameLines - 1) * 48 - (view.variant ? mm(14) : 0) - (view.tagline.length > 120 ? 16 : 0);
  const caption = w ? [`${w.title}${w.year ? `, ${w.year}` : ""}`, [w.technique, w.size].filter(Boolean).join(", ")].filter(Boolean) : [];
  return (
    <Page size="A4" style={st.s.full}>
      <CallHeader st={st} view={view} kind={view.kind} />
      <View style={st.s.coverHead}>
        <Text>{kicker}</Text>
        <Text>{view.date}</Text>
      </View>
      {st.nameFirst ? <CoverText st={st} view={view} meta={meta} first /> : null}
      <View style={st.s.coverFigure}>
        {w && images[w.imageUrl] ? (
          <>
            <Frame st={st} work={w} images={images} style={{ height: frameH, padding: 24 }} />
            <Text style={st.s.caption}>
              <Text style={{ fontStyle: "italic" }}>{caption[0]}</Text>
              {caption[1] ? `. ${caption[1]}` : ""}
            </Text>
          </>
        ) : null}
      </View>
      {st.nameFirst ? null : <CoverText st={st} view={view} meta={meta} />}
    </Page>
  );
}

function CoverText({ st, view, meta, first }: { st: S; view: DossierView; meta: string[]; first?: boolean }) {
  return (
    <View style={first ? { marginTop: mm(6) } : [st.s.coverText, { marginTop: "auto" }]}>
      <Text style={st.s.coverName}>{view.name || "Dossier"}</Text>
      <View style={st.s.coverRow}>
        <View style={st.s.coverMeta}>
          {meta.filter(Boolean).map((m, i) => (
            <Text key={i} style={i ? st.s.muted : undefined}>
              {m}
            </Text>
          ))}
        </View>
        <Text style={st.s.coverLine}>{view.tagline}</Text>
      </View>
    </View>
  );
}

function Contact({ st, name, rows, colophon }: { st: S; name: string; rows: FactRow[]; colophon: string }) {
  return (
    <Page size="A4" style={st.s.contact}>
      <Ruled st={st} name="Contacto" onInk>
        <Text style={st.s.contactName}>{name}</Text>
        <Facts st={st} rows={rows} onInk />
      </Ruled>
      <Text style={st.s.colophon}>{colophon}</Text>
    </Page>
  );
}

function splitColumns(groups: CvGroup[]): [CvGroup[], CvGroup[]] {
  const total = groups.reduce((n, g) => n + g.items.length + 1.5, 0);
  const left: CvGroup[] = [];
  let acc = 0;
  for (const g of groups) {
    if (acc < total / 2 || !left.length) {
      left.push(g);
      acc += g.items.length + 1.5;
    } else break;
  }
  return [left, groups.slice(left.length)];
}

function CvColumn({ st, groups }: { st: S; groups: CvGroup[] }) {
  return (
    <View style={st.s.cvCol}>
      {groups.map((g) => (
        <View key={g.key} style={st.s.cvGroup}>
          <Text style={st.s.blockTitle}>{g.title}</Text>
          {g.items.map((it, i) => (
            <View key={i} style={st.s.cvRow} wrap={false}>
              <Text style={st.s.cvYear}>{it.year}</Text>
              <Text style={{ flex: 1 }}>
                {it.text}
                {it.place ? <Text style={st.s.muted}>{`. ${it.place}`}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- documents

export function CreatorPdf({ view, images, st }: { view: CreatorView; images: ImageMap; st: S }) {
  const year = view.date.split(" ").pop();
  const [left, right] = splitColumns(view.cv);
  return (
    <>
      <Cover st={st} view={view} images={images} kicker="Dossier artístico" meta={[view.discipline, view.city]} />
      {view.statement.length || view.bio.length ? (
        <Page size="A4" style={st.s.page}>
          {view.statement.length ? (
            <Ruled st={st} name="Declaración" sub="artística">
              <Prose st={st} paras={view.statement} />
              <Text style={st.s.signature}>{[view.name, view.city, year].filter(Boolean).join(", ")}</Text>
            </Ruled>
          ) : null}
          {view.bio.length ? (
            <View style={view.statement.length ? st.s.block : undefined}>
              <Ruled st={st} name="Biografía">
                <Prose st={st} paras={view.bio} leadFirst={false} />
              </Ruled>
            </View>
          ) : null}
          <Folio st={st} />
        </Page>
      ) : null}
      {view.series.map((s, i) => (
        <Page key={s.id} size="A4" style={st.s.page}>
          <Ruled st={st} name="Obra" sub={view.series.length > 1 ? `Serie ${i + 1} de ${view.series.length}` : undefined}>
            <View wrap={false}>
              <Text style={st.s.sectionTitle}>{s.title}</Text>
              {s.years ? <Text style={st.s.years}>{s.years}</Text> : null}
              {s.description.length ? (
                <View style={st.s.seriesText}>
                  <Prose st={st} paras={s.description} leadFirst={false} />
                </View>
              ) : (
                <View style={{ height: 10 }} />
              )}
            </View>
            {s.works.map((w) => (
              <WorkRow key={w.id} st={st} work={w} images={images} cat={`Cat. ${w.catNo}`} />
            ))}
          </Ruled>
          <Folio st={st} />
        </Page>
      ))}
      {view.cv.length ? (
        <Page size="A4" style={st.s.page}>
          <Ruled st={st} name="Trayectoria">
            <View style={st.s.cvCols}>
              <CvColumn st={st} groups={left} />
              <View style={{ width: mm(9) }} />
              <CvColumn st={st} groups={right} />
            </View>
          </Ruled>
          <Folio st={st} />
        </Page>
      ) : null}
      {view.contact.length ? (
        <Contact st={st} name={view.name} rows={view.contact} colophon={`Obras y textos de ${view.name || "la artista"}. Fotografías de la obra hechas por su autora o autor, sin retoques. Dossier maquetado con Mecena.`} />
      ) : null}
    </>
  );
}

export function BusinessPdf({ view, images, st }: { view: BusinessView; images: ImageMap; st: S }) {
  const teamSub = view.team.size ? (view.team.size === 1 ? "1 persona" : `${view.team.size} personas`) : undefined;
  const hasActivity = view.activity.length || view.plan.idea || view.plan.needs.length;
  const hasTeam = view.team.people.length || view.team.text.length;
  const p = view.projects;
  return (
    <>
      <Cover st={st} view={view} images={images} kicker="Dossier de empresa" meta={[view.activityShort, view.city]} />
      {hasActivity || hasTeam ? (
        <Page size="A4" style={st.s.page}>
          {hasActivity ? (
            <Ruled st={st} name="Actividad">
              <Prose st={st} paras={view.activity} />
              {view.plan.idea || view.plan.needs.length ? (
                <View style={{ marginTop: 14 }} wrap={false}>
                  <Text style={st.s.blockTitle}>Proyecto que queremos impulsar</Text>
                  {view.plan.idea ? <Text style={st.s.p}>{view.plan.idea}</Text> : null}
                  <Facts st={st} rows={view.plan.needs.map((n, i) => ({ label: `Necesidad ${i + 1}`, value: n }))} />
                </View>
              ) : null}
            </Ruled>
          ) : null}
          {hasTeam ? (
            <View style={hasActivity ? st.s.block : undefined}>
              <Ruled st={st} name="Equipo" sub={teamSub}>
                {view.team.text.length ? <Prose st={st} paras={view.team.text} leadFirst={false} /> : null}
                <View style={st.s.team}>
                  {view.team.people.map((x, i) => (
                    <View key={i} style={st.s.person} wrap={false}>
                      <Text style={st.s.personName}>{x.name}</Text>
                      {x.role ? <Text style={st.s.personRole}>{x.role}</Text> : null}
                      {x.bio ? <Text style={{ fontSize: 8.5 }}>{x.bio}</Text> : null}
                    </View>
                  ))}
                </View>
              </Ruled>
            </View>
          ) : null}
          <Folio st={st} />
        </Page>
      ) : null}
      {p.works.length || p.milestones.length || p.text.length ? (
        <Page size="A4" style={st.s.page}>
          <Ruled st={st} name="Proyectos" sub="y logros">
            {p.text.length ? <Prose st={st} paras={p.text} leadFirst={false} /> : null}
            {p.works.map((w) => (
              <WorkRow key={w.id} st={st} work={w} images={images} cat={`Proyecto ${w.catNo}`} />
            ))}
            {p.milestones.length ? (
              <View wrap={false}>
                <Text style={st.s.blockTitle}>Hitos</Text>
                {p.milestones.map((m, i) => (
                  <View key={i} style={st.s.cvRow}>
                    <Text>{m}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Ruled>
          <Folio st={st} />
        </Page>
      ) : null}
      {view.facts.length || view.location.length ? (
        <Page size="A4" style={st.s.page}>
          <Ruled st={st} name="Cifras" sub="y datos de empresa">
            <Facts st={st} rows={view.facts} />
          </Ruled>
          {view.location.length ? (
            <View style={st.s.block}>
              <Ruled st={st} name="Ubicación">
                <Facts st={st} rows={view.location} />
              </Ruled>
            </View>
          ) : null}
          <Folio st={st} />
        </Page>
      ) : null}
      {view.contact.length ? <Contact st={st} name={view.name} rows={view.contact} colophon={`Dossier de ${view.name || "la empresa"}. Datos facilitados por la propia empresa. Maquetado con Mecena.`} /> : null}
    </>
  );
}

export function DossierPdf({ view, images, tokens, faces }: { view: DossierView; images: ImageMap; tokens?: PdfTokens; faces?: PdfFaces }) {
  const st = makeStyles(registerFonts(), tokens, faces);
  const title = `Dossier${view.name ? ` · ${view.name}` : ""}${view.variant ? ` · ${view.variant.callName}` : ""}`;
  return (
    <Document title={title} author={view.name || "Mecena"} creator="Mecena" producer="Mecena" language="es-ES">
      {view.kind === "creator" ? <CreatorPdf view={view} images={images} st={st} /> : <BusinessPdf view={view} images={images} st={st} />}
    </Document>
  );
}
