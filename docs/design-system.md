# Mecena design system

Light, monochrome, warm grays, generous whitespace. Inter everywhere (self-hosted, `src/app/_fonts/`, SIL OFL).
The only colour moment is the gradient orb, reserved for voice/agent moments. No glass, no dark backgrounds,
no gradient text, no noise, no italics. The artist's dossier document (`src/features/dossier/ui/dossier.css`,
`DossierDocument.tsx`, `FreeLayoutDocument.tsx`, the PDF and its fonts) keeps its own look and is not part of this.

## Tokens (`src/app/globals.css`, `:root`)

| Group | Tokens |
| --- | --- |
| Grays | `--gray-25` #FDFCFC, `-50` #FAF8F8, `-100` #F5F3F1, `-200` #EBE8E4, `-300` #D7D2CC, `-400` #A59F97, `-500` #777169, `-600` #59544F, `-700` #44403B, `-800` #292524, `-900` #1C1917, `-950` #0C0A09 |
| Surfaces | `--bg` (gray-25), `--surface` (#FFF), `--surface-2` (gray-50), `--surface-3` (gray-100) |
| Text | `--text-1` (#000), `--text-2` (gray-600), `--text-3` (gray-500) |
| Lines | `--border` (gray-200), `--border-strong` (gray-300) |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| Radii | `--radius-card` 16px, `--radius-card-sm` 12px, `--radius-input` 12px, `--radius-pill` 9999px |
| Status (soft tints) | `--ok-bg/-fg`, `--warn-bg/-fg`, `--err-bg/-fg`, `--info-bg/-fg` |
| Other | `--focus` #2B7FFF (1.5px outline, 2px offset), `--font-sans`, `--font-mono`, `--ease-out`, `--orb` |

Legacy names (`--g-ink*`, `--g-glass*`, `--g-line*`, `--g-accent*`, `--paper*`, `--ink*`, `--line`, `--accent*`,
`--ok`, `--warn`, `--radius`, `--serif`, `--sans`) still exist, remapped to the light palette. New CSS uses the
names above.

Type: headings are light (300), `-0.03em`, line-height 1.05-1.1 (h1 36-48px, h2 28-40px, h3 22-28px). Body
15-16px/1.6. Labels 14px `--text-2`. Kicker (`.kicker`) 13px medium `--text-3`.

## Global classes

`.card` (`.card-sm`), `.btn` + `.btn-primary` (black pill) / `.btn-secondary` (white, hairline) / `.btn-ghost`
(transparent, hairline) / `.btn-quiet` (text only) / `.btn-sm` / `.btn-icon` (circle), `.input`, `.tag` +
`.tag-ok|-warn|-err|-info|-accent`, `.kicker`, `.page-title`, `.sheet` + `.sheet-scrim`, `.mode-switch`
(segmented: gray-100 track, white active pill), `.app-header`, `.brand`, `.bottom-nav`, `.orb`, `.skeleton`,
`.visually-hidden`.

## Primitives (`@/components/ui`)

`Button` (`variant`: primary | secondary | ghost | quiet, `size`: sm | md), `IconButton`, `Card` (`size`),
`Tag` (`tone`: neutral | ok | warn | err | info | accent), `PageTitle`, `Spinner` (label stays in the DOM), `Orb`,
`Pending`.

### Skeletons

Prefer a skeleton shaped like the content over a spinner for anything that takes more than a moment.

```tsx
<LoadingRegion label="Cargando tus obras…">
  <SkeletonList count={4}>
    <SkeletonCard media={180} lines={1} />
  </SkeletonList>
</LoadingRegion>
```

`Skeleton({ width, height, radius })`, `SkeletonText({ lines = 3 })`, `SkeletonCircle({ size = 40 })`,
`SkeletonCard({ lines, media })`, `SkeletonList({ count = 3, children })`, `LoadingRegion({ label = "Cargando…" })`
(role=status, aria-busy, visually hidden label). Shimmer goes gray-100 -> gray-50 and stops under
`prefers-reduced-motion`.

## Idempotency

Every mutation can be retried safely.

- Client: `apiSend(url, body, method, signal, { idempotencyKey })` always sends `Idempotency-Key` (a fresh one if not
  given), retries once with the same key on a network `TypeError` (never after an abort), and coalesces identical
  concurrent calls without a signal. `newIdempotencyKey()` and `IDEMPOTENCY_HEADER` are exported.
- Hooks: `useAction((key, ...args) => apiSend(url, body, "POST", undefined, { idempotencyKey: key }))` returns
  `{ run, pending, error, reset }`; `run` is ignored while pending, reuses the key when the same args are retried
  after a failure and takes a new one after a success. Disable the button with `pending`.
- Server: `export const POST = route(idempotent(async (req: Request) => { ... }))` (`src/server/idempotency.ts`).
  Scope is the session (or bearer token, else IP) + method + path + key. Completed responses are replayed for 24 h
  with `Idempotent-Replayed: true`; a concurrent duplicate waits and gets the same response; the same key with
  another body is 409 «Esta petición ya se envió con otros datos.». 5xx, 429, thrown errors, >2 MB bodies,
  Set-Cookie responses and streams are not stored. Streams (`idempotent(fn, { stream: true })` or
  `text/event-stream`) only refuse concurrent duplicates with 409 «Esta acción ya está en marcha.». Requests
  without the header are untouched. In-memory LRU: valid because Fly runs a single machine.
