# Mecena dossier templates (block A5)

Standalone, dependency-free HTML + one shared stylesheet. Open any file directly in a browser.

| File | What it is |
|---|---|
| `dossier.css` | The whole design system: screen, phone, A4 print, skeleton states. |
| `creator.html` | Artist dossier: cover, statement, series with works, CV, contact. Also shows the variant hooks via query string. |
| `business.html` | Pyme / autónomo capability dossier: cover, activity, team, projects, figures, company data (CNAE, location), contact. |
| `progressive.html` | Demo of the dossier being built section by section from a simulated voice interview. |
| `screenshots/` | Desktop, phone and PDF renders used for visual QA. |

All placeholder people, venues and companies are fictional. The artworks are inline SVG stand-ins; in the app they are the user's photos.

## Design system

- **Palette** (CSS custom properties on `:root`): `--paper #f4f4f1`, `--ink #262b30` ("lousa", slate), `--granite #6b7075`, `--wall #d6d8d5` (screen backdrop and artwork ground), `--accent #a3a05a` ("liquen"). `.dossier[data-kind="business"]` swaps the accent to `#4f6e7d` ("ría").
- **Type** (Google Fonts, both with fallbacks):
  - Schibsted Grotesk 400/500/600: names, section rails, headings, small data. Fallback `"Helvetica Neue", Arial, sans-serif`.
  - Newsreader (optical sizes, roman + italic 400/500): body text and wall labels. Fallback `"Iowan Old Style", Georgia, serif`.
  - In Next.js use `next/font/google` (`Schibsted_Grotesk`, `Newsreader` with `axes: ["opsz"]`) and set `--sans` / `--serif` from the generated class names.
- **Wall labels** follow museum convention: catalogue number, *title in italics*, year, technique, size as height × width in cm, then a short concept.
- **Artworks are never cropped**: `.frame > img` uses `object-fit: contain` on a neutral ground. Keep it that way (product promise: we never alter the work).
- **Sheets**: every `<section class="sheet">` is one block. On screen they stack as paper sheets on a grey wall (max 940px). On phones (≤720px) they go full width and the left rail stacks above the content.

## Print / PDF

`@page` is A4 with 18/17/20 mm margins and page numbers (`@bottom-right`, Chrome 131+). Cover and contact use the named page `full` (no margins, full bleed, one page each). Every sheet starts a new page; works, CV rows, people and table rows never split; headings keep with the next block; `orphans/widows: 3`.

Export with the browser (Print → Save as PDF, "Background graphics" on) or headless:

```js
await page.pdf({ path: "dossier.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
```

Wait for fonts before printing (`await page.evaluate(() => document.fonts.ready)`). Sections still in `pending`, hints and empty slots are left out of the PDF automatically, so exporting mid-interview gives a clean partial dossier.

## Progressive build: states

Every section carries `data-section="<name>"` and `data-state`:

| `data-state` | Look | Use |
|---|---|---|
| `pending` | Skeleton bars, `.hint` visible ("Cuéntame de dónde viene tu trabajo…") | Nothing known yet |
| `filling` | Empty slots breathe gently, filled ones show | The AI is writing this section now |
| `ready` | Empty slots disappear | Section complete |

Rules the CSS gives you for free:

- Any element with `data-slot` that is **empty** renders as a placeholder bar. Paragraphs and headings render as a stack of lines: set `style="--lines:3"`; set width with `--skw` (for example `--skw: 8ch`).
- A `.frame` with no children shows a dashed frame with its `data-hint` text ("Haz una foto de la obra").
- Add the class `just-filled` to a slot when its value arrives for one short lichen wash (re-trigger by removing it, forcing a reflow, adding it again). Motion is off under `prefers-reduced-motion`.
- In React the empty state is simply rendering the same component with empty strings: `<p data-slot="profile.tagline" style={{"--lines": 2}}>{profile.tagline ?? ""}</p>`. Do not render placeholder text; leave it empty.

The app flow is the one in `progressive.html`: for each AI patch `{section, slot, value}`, set the section to `filling`, write the value, and set it to `ready` when the extractor says it is done.

## Data shape

`data-slot` attributes in the HTML use these paths, so the templates double as a field map.

### Creator (`profile.kind === "creator"`)

```ts
type CreatorDossier = {
  meta: { date: string };                  // "Noviembre 2026"
  profile: {
    name: string;                          // cover + contact
    discipline: string;                    // "Pintura y obra sobre papel"
    city: string;                          // "A Coruña"
    tagline: string;                       // one-line statement on the cover
    statement: string[];                   // paragraphs; first renders as .lead
    coverWork?: { imageUrl: string; caption: string };  // defaults to first work
  };
  series: Array<{
    id: string;                            // "marea-baixa", used by variants
    title: string;
    years: string;                         // "2023–2025" (en dash)
    description: string;
    works: Array<{
      id: string;
      title: string;                       // rendered in <cite> (italic)
      year: string;
      technique: string;                   // "Óleo sobre lino"
      size: string;                        // "130 × 97 cm" (height × width, × not x)
      concept: string;                     // 1–2 sentences
      imageUrl: string;                    // straightened/cropped photo, never retouched
    }>;
  }>;
  cv: {                                    // each group hidden when empty
    education: CvItem[];                   // Formación
    soloShows: CvItem[];                   // Exposiciones individuales
    groupShows: CvItem[];                  // Exposiciones colectivas
    awards: CvItem[];                      // Premios y becas
    residencies: CvItem[];                 // Residencias
    collections?: CvItem[];                // Obra en colecciones
  };
  contact: { email: string; phone?: string; web?: string; instagram?: string; studio?: string };
};
type CvItem = { year: string; text: string; place?: string };  // place renders in granite
```

Catalogue numbers (`Cat. n`) are computed in render order across all series, not stored.

### Business (`profile.kind === "business"`)

```ts
type BusinessDossier = {
  meta: { date: string };
  company: {
    name: string;                          // "Obradoiro Nordés"
    activityShort: string;                 // "Carpintería y mobiliario a medida"
    city: string;                          // "Betanzos, A Coruña"
    tagline: string;
    coverImageUrl?: string;                // workshop or flagship project
    activity: string[];                    // paragraphs; first is .lead
    services: Array<{ name: string; text: string }>;
    legalName: string;                     // "Obradoiro Nordés, S.L."
    taxId: string;                         // NIF
    founded: string;
    cnae: string;                          // "3109. Fabricación de otros muebles"
    address: string;
    area: string;                          // geographic scope
    certifications?: string;
  };
  team: Array<{ name: string; role: string; bio: string }>;   // key people
  teamSize: number;                        // rail shows "4 de 6 personas"
  projects: Array<{
    client: string; title: string; year: string;
    scope: string;                         // "Diseño, fabricación y montaje"
    figure: string;                        // one measurable fact: "38 m lineales, 9 semanas"
    summary: string; imageUrl: string;
  }>;
  figures: {
    years: string[];                       // column headers, oldest first
    rows: Array<{ label: string; values: string[] }>;  // pre-formatted es-ES: "312.900 €", "78 %"
    note?: string;                         // "2025: previsión de cierre…"
  };
  contact: { person?: string; email: string; phone?: string; web?: string };
};
```

Format numbers with `Intl.NumberFormat("es-ES")` and keep a non-breaking space before `€` and `%`.

## Call-specific variants

A variant is a pure transform on the data before rendering; the templates stay the same. `creator.html` demonstrates it statically through the query string:

```
creator.html?call=Bolsas%20de%20creación%202026&ref=BDNS%20000000&order=lousa,marea-baixa&max=3
```

```ts
type DossierVariant = {
  callName: string;          // "Bolsas de creación 2026, Deputación da Coruña"
  callRef?: string;          // BDNS id or expediente
  seriesOrder?: string[];    // series ids first, in this order; the rest keep their order
  maxImages?: number;        // total works across all series
  maxImageBytes?: number;    // e.g. 5 * 1024 * 1024: re-encode JPEG on export
};
```

1. **Call header**: render `.call-header` (the first child of the cover, hidden by default) with `variant.callName` and `variant.callRef`. It prints as a lichen band at the top of the cover page: "Dossier para: …".
2. **Reorder series**: sort `series` by `seriesOrder`, then render. Section order is the DOM order, so nothing else changes.
3. **Limit images**: walk works in the new order and keep the first `maxImages`; drop series left with no works. Renumber `Cat. n` after trimming and update the rail "Serie n de N".
4. **File size**: done at export (image re-encode), not in CSS.

Keep the full dossier as the source of truth and derive variants; never edit the base dossier for a call.

## Porting to React / Next.js

- Import `dossier.css` once (global stylesheet). The class names are flat and low specificity, so they do not fight Tailwind if it is scoped to app chrome.
- Suggested components: `<Dossier kind>`, `<Cover>`, `<Statement>`, `<Series>` + `<Work>`, `<Cv>`, `<Contact>`; business adds `<Activity>`, `<Team>`, `<Projects>` (reuses `<Work>` markup), `<Figures>`, `<CompanyFacts>`. Each takes `state: "pending" | "filling" | "ready"` and maps it to `data-state`.
- The SVG `<filter>` block at the top of each HTML file is only for the placeholder artworks; drop it when real photos are used.
- For the PDF route, render the same components server side into a page and print with Playwright using the snippet above.
