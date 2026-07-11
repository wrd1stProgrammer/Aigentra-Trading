# Aigentra Trading Design System

## 1. Atmosphere & Identity

A dark trading command center: compact, live, and operational, with enough calm spacing that dense data does not feel panicked. The signature is a grid-lit market terminal with restrained emerald status cues, paper-trading safety labels, and tabular numbers that make changing state easy to scan.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | --app-bg | #F3F4F6 | #080B0A | Page background |
| Surface/subtle | --app-bg-subtle | #EEF0F3 | #0F1412 | Header and page wash |
| Surface/card | --surface | #FFFFFF | #111614 | Panels, forms, cards |
| Surface/muted | --surface-muted | #F7F8FA | #171D1A | Nested rows, metric cells |
| Surface/raised | --surface-raised | #FFFFFF | #151B18 | Elevated panels |
| Text/primary | --ink | #111827 | #F4F7F5 | Main body and headings |
| Text/secondary | --ink-muted | #667085 | #A7B0AB | Supporting labels |
| Text/tertiary | --ink-soft | #98A2B3 | #76827B | Muted metadata |
| Border/default | --border | rgba(15,23,42,0.10) | rgba(244,247,245,0.12) | Panel boundaries |
| Border/strong | --border-strong | rgba(15,23,42,0.18) | rgba(244,247,245,0.22) | Active boundaries |
| Accent/primary | --accent | #0F766E | #2DD4BF | Active controls, live status |
| Accent/strong | --accent-strong | #115E59 | #5EEAD4 | Hover/focus accent |
| Status/success | --good | #047857 | #34D399 | Profit, long, connected |
| Status/error | --bad | #DC2626 | #FB7185 | Loss, short, failure |
| Status/warning | --warn | #B45309 | #FBBF24 | Pending, caution |
| Status/info | --info | #2563EB | #60A5FA | Informational state |
| Focus | --focus | #14B8A6 | #5EEAD4 | Keyboard focus |

### Rules

- Emerald is for active/live/confirmed states, not decoration.
- Red and green always map to loss/short and profit/long semantics.
- Use black-tinted terminal surfaces only for live trading panels; standard account and legal surfaces use the tokenized card system.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | 40px | 700 | 1.1 | 0 | Landing and main page titles |
| H1 | 32px | 700 | 1.2 | 0 | Dashboard page titles |
| H2 | 22px | 600 | 1.3 | 0 | Panel titles |
| H3 | 18px | 600 | 1.35 | 0 | Card titles |
| Body | 16px | 400 | 1.6 | 0 | Long-form text |
| Body/sm | 14px | 400 | 1.55 | 0 | Dashboard copy |
| Caption | 12px | 500 | 1.4 | 0 | Metadata and small labels |
| Overline | 11px | 700 | 1.3 | 0.08em | Terminal labels |

### Font Stack

- Primary: `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`
- Mono: `var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace`

### Rules

- Data-heavy rows use tabular figures.
- Korean labels should use `break-keep` only when the container can still wrap safely on mobile.
- Buttons and compact cells should keep text at 12px or above unless they are metadata badges.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a 4px base.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Icon gap, tight badges |
| --space-2 | 8px | Compact row padding |
| --space-3 | 12px | Form controls, chips |
| --space-4 | 16px | Mobile panel padding |
| --space-5 | 20px | Card padding |
| --space-6 | 24px | Standard panel padding |
| --space-8 | 32px | Page section gap |
| --space-10 | 40px | Major dashboard separation |

### Grid

- Max app content width: 1760px.
- Dashboard pages use responsive one-column mobile layouts, then split to data/sidebar grids at large breakpoints.
- Mobile gutters start at 8px for app chrome pages so dense trading panels get more usable width. Dense terminal sections may use internal horizontal scroll only when the data cannot be meaningfully summarized.

### Rules

- Mobile must not require reading a 900px table as the primary experience. Provide a card summary first, keep the table for desktop or advanced horizontal inspection.
- Fixed-width data grids need `min-w-0` on all parents.
- Live panels may scroll internally, but body-level horizontal overflow is a bug.

## 5. Components

### App Shell

- **Structure**: sticky header, compact icon nav, language toggle, profile drawer.
- **States**: active route is filled; inactive route is muted; focus ring uses `--focus`.
- **Mobile**: nav can scroll horizontally and labels are visually hidden until medium width.

### Trading Panel

- **Structure**: title/status row, chart or stream body, optional footer controls.
- **Spacing**: 16px mobile, 24px desktop.
- **Mobile**: replace dense rows with stacked cards before showing wide tables.

### Data Card

- **Structure**: tonal surface, 1px token border, 14-22px radius depending on outer/inner role.
- **States**: hover border shift is subtle; no dramatic shadows.

### Trade Classification Badge

- **Structure**: one compact tokenized chip combining localized holding horizon and strategy family as `horizon · strategy`.
- **Placement**: follow side and leverage in leaderboard exposure rows; sit immediately after `Perp` in desktop and mobile position symbols.
- **Rules**: use muted surface/border tokens, remain visually secondary to LONG/SHORT, never introduce page-level horizontal overflow, and hide only when no valid frozen-plan or trader fallback classification exists.

### Alert/Review Row

- **Structure**: time, trader identity, decision summary, optional severity dot.
- **Mobile**: stack time/trader above summary; keep the whole row tappable.

### Live Race Board

- **Structure**: one compact header strip with the current period, three live metrics, and a five-card race lane derived from the existing leaderboard bundle. Avoid split hero layouts that leave unused space.
- **Data priority**: rank, trader, favorable 24h movement, live exposure state, and side/leverage badges. Negative 24h movement is a fallback signal, not the main race; it should be strongly deprioritized unless there are not enough active or positive movers. Omit broad portfolio totals and narrative snippets here because the ranking table and detail panel already own them.
- **States**: active movers use emerald for favorable movement, rose for slipping, amber for pending exposure, and neutral for watch-only traders. Loading uses the existing page loading policy rather than an internal spinner.
- **Mobile**: keep the board short with a horizontally swipeable race lane inside the card. The lead card uses status, side/leverage, mood, and return only; hide trader name, profile mark, and rank there to avoid a tall hero card. Avoid page-level horizontal overflow and keep Korean copy within compact phrases.
- **Performance**: render from already loaded standings, summaries, and exposures. No overview-review fetch, narrative snippet, infinite scroll, chart sparkline, or additional initial request.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | ease-out | Button press, active tabs |
| Standard | 200-300ms | ease-in-out | Drawer, hover surface |
| Emphasis | 500ms | cubic-bezier(0.16, 1, 0.3, 1) | Page entry |

### Rules

- Animate opacity and transform first.
- Every icon-only control needs an accessible label.
- Important mobile controls should be at least 36px tall.

## 7. Depth & Surface

### Strategy

Mixed, but constrained: terminal sections use tonal dark surfaces with subtle borders; standard panels use token borders and minimal shadows. Avoid decorative blobs, oversized gradients, and unrelated hero-like ornament inside dashboards.
