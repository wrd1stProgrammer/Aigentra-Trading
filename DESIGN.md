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
| Terminal/background | --terminal-bg | #070908 | #070908 | AI decision terminal |
| Terminal/text | --terminal-ink | #F4F7F5 | #F4F7F5 | Terminal primary copy |

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

### Admin Growth Dashboard

- **Structure**: a compact Supabase-inspired operations surface with one bordered header rail, a four-metric KST daily funnel, a seven-day activity strip, then operational lists and the read-only table browser. The first scan path is unique visitors → signups → paid conversions → signup conversion rate.
- **Metric context**: every daily value includes an explicit previous-day comparison. Visitor counts are deduplicated by a privacy-safe daily identifier; signups deduplicate emails across account sources; paid conversions deduplicate successful checkout emails.
- **Surface**: use the existing near-black and emerald tokens. Depth comes from nested tonal surfaces and border hierarchy, not shadows or decorative grids. Green remains a status and positive-delta signal rather than a large fill.
- **Typography**: labels use the mono overline voice, values use tabular figures, and supporting definitions remain visible at 12px or above.
- **Responsive behavior**: the funnel is one column on small screens, two columns at tablet width, and four columns on desktop. Operational panels collapse to one column; tables retain contained horizontal scrolling.
- **Accessibility**: trends include text deltas rather than color alone, charts expose a text summary, refresh controls retain visible focus and disabled states, and no KPI relies on hover-only explanations.

### Trade Classification Badge

- **Structure**: one compact tokenized chip combining localized holding horizon and strategy family as `horizon · strategy`.
- **Placement**: leaderboard exposure rows show only the localized strategy family after side and leverage, on the same unbroken row; trader-detail position symbols retain the full `horizon · strategy` label immediately after `Perp`.
- **Rules**: use muted surface/border tokens, remain visually secondary to LONG/SHORT, never introduce page-level horizontal overflow, and hide only when no valid frozen-plan or trader fallback classification exists.

### Alert/Review Row

- **Structure**: time, trader identity, decision summary, optional severity dot.
- **Mobile**: stack time/trader above summary; keep the whole row tappable.

### AI Decision Terminal

- **Structure**: the leaderboard begins with one compact terminal stream of recent AI entry decisions and execution outcomes. Its single header row holds the terminal label and live state on the left and the stream explanation on the right. Each event row shows localized relative time, event type, localized trader identity, one ellipsized AI judgment line, and only the relevant side, price, non-zero PnL, or confidence facts. The repeated market symbol stays out of the right-side facts.
- **Event scope**: show only entry approval, pending entry, confirmed entry, take profit, stop loss, breakeven exit, and generic position close. Exclude hold reviews, stop adjustments, funding, canceled orders, and unrelated scanner chatter.
- **Cycle clarity**: keep position, order, and plan IDs out of the visual stream. A close followed by a new position remains separate through its event order, timestamp, and event badge even when trader, symbol, and side match.
- **Interaction**: no chart, replay, scrubber, autoplay, or decorative motion. The stream owns a `260px` maximum-height scroll region; reaching its lower edge requests the next bounded page. Rows may link to the trader detail page and must have keyboard-visible focus.
- **States**: emerald maps to approvals, confirmed entries, and profit; rose to stop loss; amber to pending entry; blue-neutral to breakeven; zinc to generic close. Confirmed entries use the localized second-stage review headline rather than a price confirmation sentence. Loading and locked previews preserve the terminal footprint without exposing private execution data.
- **Mobile**: stack time and event tag above trader, judgment, and facts. Preserve terminal density without body-level horizontal overflow.
- **Performance**: fetch event and review windows in parallel in 20-record pages only after subscriber access resolves, cache for at least one minute, and request later pages only when the user reaches the stream edge. Do not fetch candles or initialize charting code.

### Blog Editorial Card

- **Structure**: image-free white editorial card with localized category/date metadata, article number, title, excerpt, reading time, and arrow affordance. Cards link to canonical `/blog/[slug]` article URLs.
- **Tone**: the page surface is clean and white for readability. A restrained top rule, mono metadata, and terminal-green interaction states carry the Aigentra identity without simulated thumbnails or decorative artwork.
- **Home layout**: use the landing page's `1240px` content width, `16px / 40px / 64px` responsive gutters, a centered heading no larger than `48px`, and three equal cards on desktop. Text-only cards keep a stable minimum height so varying localized titles do not shift the row.
- **Index layout**: use the same card primitive and content width. Cards become two columns at tablet width and three columns only when the copy remains readable.
- **SEO/content**: every visible title, excerpt, article body, CTA, and related-post label must come from locale-aware blog content, not hard-coded English.
- **Mobile**: stack cards in one column with `16px` gutters. Keep metadata and reading-time actions visible; article text must remain readable without horizontal overflow.

### Blog Article

- **Structure**: one uninterrupted editorial column inspired by the supplied BullGPT reference: back link, metadata, left-aligned title and deck, key takeaways, divider, long-form sections, FAQ, share row, product CTA, related articles, then the standard footer.
- **Reading width**: article prose is capped at `800px`; surrounding CTA and related content may expand to `1040px`. The article is a full-width white band rather than a card inside the page shell.
- **Typography**: desktop title is `48px / 1.1 / 800`, mobile title is `34-36px / 1.12`; section headings are `26px / 1.33 / 700`; long-form body is `16px / 28px / 400`. Tracking stays at `0` in accordance with the global type system.
- **Rhythm**: title-to-deck `16px`, deck-to-takeaways `64px`, heading-to-body `24px`, paragraph gap `20px`, major section gap `48px`. Lists use clear bullets and do not become detached side cards.
- **Localization**: use natural CJK wrapping. `break-keep` is allowed for headings and compact metadata, but long Korean body copy must use normal word wrapping so the reading column does not overflow.

### Blog Article CTA

- **Structure**: dark rounded terminal panel with a subtle grid texture, green bracket eyebrow, concise headline, body copy, and one leaderboard CTA. It sits below the share row and above related posts, following the supplied article reference.
- **Dimensions**: up to `1040px` wide with `40-56px` padding and a `16px` radius. It remains visually distinct from the white article without becoming a nested card composition.
- **Rules**: keep the CTA action educational and product-directed. Do not imply profit, live execution, or investment advice.

### Knowledge Hub Card & Concept Note

- **Structure**: reuse the Blog Editorial Card and Blog Article primitives so `/learn` reads as the educational sibling of `/blog`. Cards add an English term above the localized concept name; concept notes use definition, importance, formula/example, interpretation, misconception, risk, source, and related-reading sections.
- **Home placement**: the knowledge preview follows the blog preview and precedes the standard landing footer. It shows three foundational concepts and one hub CTA without introducing a new visual band.
- **SEO/content**: publish only reviewed concepts with a distinct search intent. Each detail page includes a canonical URL, `DefinedTerm` and `BreadcrumbList` data, a real source, and contextual links to concepts and blog guides.
- **Mobile**: preserve the same single-column editorial flow as blog pages. Formulas may wrap naturally and no page may introduce body-level horizontal overflow.

### Editorial Navigation & Action Panel

- **Home link**: `/blog`, `/blog/[slug]`, `/learn`, and `/learn/[slug]` begin with one compact outlined Home pill at the left edge of their content rail. It remains visually secondary to the page title and uses the shared focus treatment.
- **Action panel**: every blog article and knowledge note uses the same dark grid-backed `[ TAKE ACTION ]` panel between the article and related reading. Copy may be localized by content type, but the sole action routes to the public leaderboard and must retain the educational, non-advisory framing.
- **Footer brand**: the Aigentra mark and wordmark form one keyboard-focusable link to `/`; the tagline remains outside the link.

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
