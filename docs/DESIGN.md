# Design system: Invite referral list

Extracted from the final source in `web/src/styles.css` and `web/src/components/`, confirmed
against Chromium renders at 320–1280 px (see `docs/validation.md`). The acceptance criteria ask
for this file at the repository root; that path is outside this assignment's write scope, so it
lives here.

## Overview

A single utilitarian page for people testing an on-chain referral toy on Sepolia. The character is
calm and document-like: a warm off-white page, white cards with hairline borders, one indigo accent
used only for the primary action in each section and for links, and a system sans-serif. Nothing
decorates; every colored surface carries a meaning (notice, wrong network, done step, error).

Hierarchy is carried by spacing and a small type scale, not by lines. The page is one column of
cards in task order: wallet → join → link → credit → referrals → list stats → contracts →
maintenance. Density is moderate: 16 px body, 14 px UI text, 13 px captions, 16–24 px card padding.

System-wide rules are the tokens and components below. The card order and the two-step
approve/join layout are this page's arrangement, not a rule for other pages.

## Colors

Notation is hex. Primitives are named by hue and never used in components; components reference
semantic tokens only. All in `web/src/styles.css` `:root`.

| Role token | Value (primitive) | Use |
| --- | --- | --- |
| `--color-bg-page` | `#f8f7f4` (`--neutral-50`) | body background |
| `--color-bg-surface` | `#ffffff` (`--neutral-0`) | cards, inputs, secondary buttons, pill |
| `--color-bg-subtle` | `#f0eeea` (`--neutral-100`) | notes, list rows, read-only inputs, disabled buttons, hover on secondary/quiet buttons |
| `--color-border` | `#e2dfd9` (`--neutral-200`) | card and step borders, footer rule (structure only, decorative contrast) |
| `--color-border-strong` | `#958e84` (`--neutral-300`) | input and secondary-button borders, skip link (3.24:1 on white) |
| `--color-text` | `#1f1d1a` (`--neutral-900`) | body and headings (16.8:1) |
| `--color-text-secondary` | `#45413b` (`--neutral-700`) | tagline, status lines, quiet buttons (10.1:1) |
| `--color-text-muted` | `#6b665f` (`--neutral-500`) | hints, captions, `dt` labels, blockers (5.7:1 on white, 4.9:1 on subtle) |
| `--color-accent-solid` / `-hover` | `#3b4fd8` / `#2f3fb0` (`--accent-600`/`-700`) | primary button fill (white text 6.4:1 / 8.5:1) |
| `--color-accent-subtle` | `#e7eafc` (`--accent-100`) | the "test toy" notice banner |
| `--color-link` | `#2f3fb0` (`--accent-700`) | links (8.5:1 on white) |
| `--color-focus` | `#4c5fe0` (`--accent-500`) | focus ring (5.2:1 on white) |
| `--color-success-bg` / `-text` | `#e2f4e8` / `#1c6b3a` | completed step, confirmation check, connected dot (5.7:1) |
| `--color-danger-bg` / `-text` | `#fce9e7` / `#a1261e` | error alerts, invalid input border (6.4:1) |
| `--color-warning-bg` / `-text` | `#fff1cf` / `#6e4400` | wrong-network banner (7.5:1) |

Ratios were measured (script and rendered) for these pairs; see the validation record. There is no
dark theme and no second accent. Do not add a status ramp unless a component renders it.

## Typography

- Families: `--font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
  sans-serif`; `--font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`
  for addresses, hashes, link input and identifiers (`.mono`, 0.9375em). No font files ship.
- Scale (`--text-*`): xs 13 px captions and `dt` labels; sm 14 px UI text, buttons, hints, banners,
  footer; base 16 px body and inputs; lg 18 px `h2`; xl 24 px `h1` under 40 em; 2xl 28 px `h1` from
  40 em.
- Weights: 400 body, 500 captions/`dt`, 600 `h2`/`h3`/buttons/labels, 650 `h1`. Nothing lighter
  than 400.
- Line-height: body 1.5, `h1` 1.15, `h2` 1.25, `h3` 1.3, buttons 1.2. Letter-spacing `-0.01em` on
  `h1`, `+0.01em` on `dt` labels.
- Wrapping: `text-wrap: balance` on headings, `pretty` on paragraphs, `overflow-wrap: break-word`
  on body and `anywhere` on `dd` values; `.num` = `font-variant-numeric: tabular-nums` on every
  changing value; measure capped at `--measure: 65ch` for paragraphs.
- Inputs are 16 px at all widths (`.input`), so iOS does not zoom.

## Layout

- Column: `.site-header`, `.page`, `.site-footer` share `width: min(100% - 2 * var(--space-4), 44rem)`
  and `margin-inline: auto`. Backgrounds are the page color; nothing bleeds.
- Spacing scale (`--space-1..8`): 4, 8, 12, 16, 24, 32, 48 px. Intra-group 4–8 px, inter-group
  16 px (cards) rising to 24 px from 40 em. Cards use 16 px padding, 24 px from 40 em.
- One breakpoint from content: `40em` (640 px) raises `h1`, header padding and page gap. Everything
  else is fluid: `.stats` is `grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr))` with
  `.stat-wide` spanning all columns; `.step`, `.banner`, `.row`, `.list-row`, `.connect-list` and
  the header are wrapping flex rows.
- Logical properties throughout (`inset-inline-start`, `margin-inline`, `padding-inline-start`,
  `border-inline-end`), `dir="ltr"` on the document.
- Observed: no horizontal overflow at 320, 600, 768, 1024 or 1280 px; the header's connect control
  wraps under the title below ~600 px; stats collapse to one column at 320 px.

## Elevation & depth

Flat with one soft layer. Cards: 1 px `--color-border` plus
`--shadow-surface: 0 1px 2px rgb(31 29 26 / .04), 0 1px 1px rgb(31 29 26 / .03)`. Nothing else
casts a shadow; banners, notes and list rows are tonal (`subtle`, status backgrounds). Focus is a
2 px outline offset 2 px; on primary buttons a 2 px white `box-shadow` halo separates ring from fill.
There are no overlays or stacking contexts beyond the skip link (`z-index: 10`).

## Shapes

- `--radius-sm` 6 px: skip link, list rows, error boxes, summary hit area.
- `--radius-md` 8 px: buttons, inputs, steps, banners, notes.
- `--radius-lg` 12 px: cards. The connected-wallet pill is `999px`.
- Borders are 1 px. The disclosure chevron is a rotated 8 px square with 2 px borders.

## Components (`web/src/components/`)

- **Button** (`ui.tsx`): `variant` `primary` (accent fill, one per section) | `secondary` (white,
  strong border, default) | `quiet` (transparent, secondary text); `busy` shows the spinner beside
  the original label and disables; `disabled` renders flat subtle/muted. States: hover (darker
  fill / subtle bg, pointer devices only), active `scale: .96`, focus-visible ring. Min height
  40 px, 44 px on coarse pointers. Labels start with a verb.
- **Card** (`ui.tsx`): `section` with `aria-labelledby` `h2`, optional `meta` slot (e.g. a count).
  `MaintenanceSection` uses the same `.card` class on a `details` (`.disclosure`).
- **Field** (`ui.tsx`): `label for` + control + `.field-hint` or `.field-error` (`role="alert"`).
  Callers wire `aria-describedby` to `${id}-hint`/`${id}-error` and set `aria-invalid`.
- **TxStatus** (`ui.tsx`): always-rendered polite `role="status"` line for simulating / signing /
  pending / confirmed (with explorer link) and a separate `role="alert"` `.tx-error` on failure.
- **Value** (`ui.tsx`): tabular value or a loading placeholder with visually hidden "Loading".
- **AddressLink / TxLink** (`ui.tsx`): mono explorer links with a visually hidden "opens … in a new
  tab" suffix.
- **ConnectControl**: wallet buttons (EIP-6963 list or "Connect wallet"), connected pill + quiet
  Disconnect, or the no-wallet sentence.
- **NetworkBanner**: warning banner with one primary "Switch to <chain>" control and status/alert lines.
- **Steps** (`JoinSection.tsx`, `.steps > .step`): numbered `h3` rows with body text, blocker
  reason and one button; `.is-done` turns the row success-tinted and appends "✓ done".
- **Stats** (`dl.stats > .stat > dt + dd`): the label/value grid used by wallet, credit, list,
  contracts and maintenance.

## Do's and don'ts

- Start a new page with `.site-header` / `main.page` / `.site-footer` and stack `Card`s; keep the
  44rem column.
- One primary button per card; everything else secondary or quiet. Put color on the fill, never on
  the label alone.
- A disabled transaction control must have its reason rendered beside it and referenced by
  `aria-describedby`; disable only for wallet/chain/eligibility prerequisites, validate format on
  submit.
- Use semantic tokens; never a primitive or a raw hex in a component. Add a role token if a role is
  missing rather than borrowing `--color-border` for text.
- Changing numbers get `.num`; addresses and hashes get `.mono` and an explorer link.
- Keep motion to the 150 ms property transitions and the reduced-motion-gated spinner.
- Recipe for another page: copy `index.html` head (viewport, `color-scheme`, favicon), import
  `styles.css`, render `<a class="skip-link">`, a `.site-header` with an `h1` + `.tagline`, then
  `Card`s containing `dl.stats`, `Field`s and `Button`s; wrap chain actions in `useTxAction` and
  show `TxStatus`.
