---
name: OpenCrawl Night
description: A shared dark operations console with Geist type and the OpenCrawl mark's periwinkle actions.
colors:
  bg: "#000"
  surface: "#0a090c"
  surface-subtle: "#131118"
  surface-raised: "#17151d"
  text: "#f7f5f6"
  strong: "#fff"
  muted: "#b9b4c0"
  quiet: "#8a8492"
  line: "#24212b"
  line-strong: "#353140"
  control-line: "#3d3949"
  brand-face: "#7d82ff"
  brand-face-hover: "#959aff"
  brand-coral: "#ff6268"
  brand-cobalt: "#164bff"
  brand-ink: "#0c0d2a"
  accent: "#a3a6ff"
  accent-hover: "#c5c7ff"
  secondary: "color-mix(in srgb, #7d82ff 22%, #050510)"
  secondary-hover: "color-mix(in srgb, #7d82ff 32%, #050510)"
  secondary-line: "color-mix(in srgb, #7d82ff 50%, #000)"
  on-secondary: "#e4e5ff"
  wash: "color-mix(in srgb, #7d82ff 12%, transparent)"
  selection: "color-mix(in srgb, #7d82ff 40%, transparent)"
  success: "#8fe0a8"
  success-wash: "#10261a"
  pending: "#f0c47e"
  pending-wash: "#2c2212"
  danger: "#ff8a95"
  danger-strong: "#ff6268"
  danger-wash: "#2d1217"
  backdrop: "rgb(0 0 0 / .72)"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-.04em"
  console-heading:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.025em"
  console-heading-compact:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.025em"
  heading:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-.025em"
  title:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".9375rem"
    lineHeight: 1.5
  ui:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".875rem"
    lineHeight: 1.5
  control:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".875rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".8125rem"
    fontWeight: 500
    lineHeight: 1.5
  metadata:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".75rem"
    lineHeight: 1.5
  mono:
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: ".8125rem"
  metric:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  badge: "4px"
  control: "6px"
  panel: "12px"
spacing:
  '1': "4px"
  '2': "8px"
  '3': "12px"
  '4': "16px"
  '5': "20px"
  '6': "24px"
  '8': "32px"
  '10': "40px"
  '12': "48px"
  '16': "64px"
components:
  button-primary:
    backgroundColor: "{colors.brand-face}"
    textColor: "{colors.brand-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-face-hover}"
    textColor: "{colors.brand-ink}"
  button-secondary:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-quiet:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-plain:
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  navigation-item:
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  navigation-item-active-mobile:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.accent}"
  badge:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  inset:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "24px"
    width: "min(520px, calc(100vw - 32px))"
  workspace-sidebar:
    backgroundColor: "{colors.surface}"
    padding: "16px 8px 0"
    width: "256px"
---

# Design System: OpenCrawl Night

## Overview

**Creative North Star: "Night"**

Night is the getopencrawl.com identity: a plain black canvas, near-black surfaces
with hairline boundaries, Geist type, and periwinkle actions drawn from the
OpenCrawl mark. The console applies that identity to compact, readable operational
work. Hierarchy comes from type, spacing, rows and sections; color identifies
interaction and meaningful status.

Core owns the shared visual system for hosted and single-tenant deployments.
`web/tokens.css` remains the canonical palette, fonts, spacing, radii and elevation
source. `web-v2/src/design/tokens.css` extends it with console dimensions and focus
constants; `web-v2/src/design/styles.css` owns the React layout and component
presentation. The frontmatter records their approved values; update the owning
CSS and this document together. Color aliases are resolved here without changing
the source color format. The sidecar carries motion, depth and component previews.

Authentication outcomes, organization selection and provider handoffs use React's
shared focused frame and controls; workspace destinations use Page. Servers send inert
page data into the same application bundle; they never render feature HTML.
Setup is the permanent first sidebar destination at `/setup`, using the same
workspace Page and controls as other product screens. It tracks CLI installation,
native client verification and optional history without blocking navigation.
The older focused onboarding components and their stylesheet remain for
compatibility; they do not define the current entry flow.
Use the existing self-hosted fonts, OC marks, provider logos and shared SVG icons.
The font license remains at `web/assets/Geist-OFL.txt`.

**Key Characteristics:**

- Dark-only Night palette and inherited brand assets.
- One React workspace shell with a persistent left sidebar on every workspace route.
- Quiet default controls, visible keyboard focus and explicit operational states.
- Permanent nonblocking Setup inside the workspace shell; focused authentication uses the same design system.

## Colors

The palette places a restrained periwinkle accent against black and near-black
neutrals. The frontmatter preserves the current CSS values, including mixed colors.

### Primary

`brand-face` is the plain lavender/periwinkle primary action face; `brand-ink`
provides its dark text. `brand-face-hover` brightens the face. `accent` and
`accent-hover` serve links, active navigation and focus. Coral and cobalt belong
to the existing OC mark and the primary button's narrow hover layers.

### Neutral

`bg` is the canvas. `surface` supports the navigation drawer, fields and legacy onboarding panel;
`surface-subtle` separates insets, quiet hover states and secondary controls;
`surface-raised` supports dialogs and neutral badges. `strong` is heading text,
`text` is primary content, `muted` is supporting copy and `quiet` is metadata.
`line` divides sections; `line-strong` and `control-line` strengthen interactive
boundaries. Selection and active navigation use the existing periwinkle washes.

### Status

Success, pending and danger each pair a text color with a dark wash. Status badges
and notices always carry a readable label; color alone does not explain state.
Danger colors identify destructive actions and actionable errors. The legacy
muted-indigo secondary tokens remain available to the earlier shared controls;
React console secondary buttons use the neutral surface treatment documented below.

**The Shared Palette Rule.** Feature pages use the canonical Night tokens; a new
reusable visual value belongs in the core design system, never a page-local palette.

## Typography

Geist supplies headings, UI and prose; Geist Mono supplies identifiers, commands
and technical content. Keep the self-hosted font assets and their fallbacks.

Every sidebar destination uses one 32px, 600-weight H1 with 1.25 line height and
-.025em tracking (`console-heading`), reducing to 28px (`console-heading-compact`)
at 800px and below. Section headings use `heading`; smaller content headings use `title`.
The interface uses `ui`, descriptions use `body`, labels use `label`, and metadata
uses `metadata`. Technical text uses `mono`. Metrics and tables use tabular numerals;
metric values use the `metric` role. Prose is bounded to 75 characters where possible.

The earlier large display role remains available to its established surfaces.
Legacy focused onboarding retains its heading scale and responsive stylesheet
for compatibility. The current Setup sidebar page uses the console page heading.

## Layout

`AppShell` is the only workspace shell. One route registry drives the left sidebar
and page routing through the shared router. Setup appears first, followed by
Usage, Sessions, Memories, Integrations, Diagnostics, Team and hosted Billing.
Deployment adapters supply only their supported routes; the shared shell does not imply hosted capabilities in the
single-tenant adapter.

The desktop sidebar is 256px wide and spans the viewport. Its static mark and
lowercase `opencrawl` wordmark come from Brand. The account footer is a full-width bottom row separated by a rule. It follows the
supplied reference: rounded-square workspace icon, person name above workspace,
and one trailing chevron for the whole account menu. Workspace and
management links form separate groups. Links have padded 44px targets and the
current page uses a lavender wash. The sidebar scrolls on short viewports.
The brand, navigation and account rows share a 32px leading column,
12px gap and aligned text edge. Rows use 8px horizontal insets inside the 8px sidebar gutter. The footer
uses 16px insets, preserving the same icon and label alignment. Navigation targets are 44px tall with 4px between rows; distinct
groups retain the same 4px row spacing, without extra grouping space or a navigation divider. Keep the mark and wordmark optically aligned, and dock the identity row to the sidebar edges rather than floating it as a card.

Content is centered at 1200px within the remaining area, with 32px side insets,
48px top padding and 64px bottom padding. At 800px and below, the same navigation
tree becomes a focus-managed drawer bounded by 300px and the viewport minus 48px.
The mobile header retains Brand and its navigation control. Background content
becomes inert while the drawer is open; Escape, the backdrop and selecting a
page dismiss it. Content padding becomes 32px, 16px and 40px. There is no alternate
page-specific sidebar or navigation implementation.

Compose shared stacks, rows, action groups, split rows, two-column form grids,
metric lists and data rows. Forms collapse to one column at the mobile breakpoint.
Source rows and search forms stack at 600px. Tables retain their columns inside
a horizontal scroll region, with a scroll hint when they overflow. Section
boundaries and vertical rhythm organize content without wrapping every group in
a card. Page headers reserve a consistent description and action area.

### Workspace page contract

Use `Page` for every sidebar destination. `AppShell` owns the centered 1200px
content frame, 32px horizontal insets, 48px top inset and 64px bottom inset.
At 800px and below these insets become 16px horizontally, 32px above and 40px below.
The workspace document reserves its scrollbar gutter so short and long pages do
not shift; retained legacy focused surfaces keep their original geometry.
Feature wrappers add no width, centering, top padding or page-title typography.

`Page` owns one `PageHeader` followed by its body. Every H1 starts on the same
left edge and top baseline. Descriptions use 15px body text, 1.5 line height,
muted text, a 75ch maximum and an 8px gap below the title. The header ends 32px
before the body. Let descriptions wrap naturally; do not force equal heights
or add empty description placeholders. Page-level actions belong in the header,
aligned at the top on desktop, wrapping below when space runs out and occupying
a separate row at 600px and below. Contextual actions stay with their section.
Use H2 for sections and H3 within them; use the shared 24px section padding and
48px report-section separation. Tabs and filters start the body, before results.

All sidebar destinations use the same full-width page grid, bounded to 1200px.
This includes Setup, Usage, Sessions, Memories, Integrations, Diagnostics, Team,
and hosted Billing. The page header, section frames, tables and
lists share both edges. A route change must not create a narrower content column.

Readable measure belongs inside the grid: prose stays within 75ch, and individual
form rows use `oc-form-measure`, bounded to 640px and the space available. Keep
form labels, fields and submit actions together. Source cards, member rosters and
billing sections span the page; their inputs do not need to stretch with them.
Tables retain their own horizontal overflow region. Use `bodyClassName` for
existing body patterns and the default Page body for every sidebar destination:

`<Page title="Team" description="People and access for your workspace."><form className="oc-form-measure">…</form></Page>`

The legacy `bodyWidth="narrow"` prop remains compatible for earlier consumers,
but feature-page architecture checks reject it. New sidebar pages use one grid.

Loading, empty, failed and current states retain this same frame. Keep the page
heading focus target for SPA navigation and exactly one H1 per destination.
Library detail views may use compact document titles beneath their back link;
legacy focused onboarding retains its compatibility presentation. The legacy
`PageHeader` report prop is accepted for compatibility but no longer changes
its appearance. Raw feature-page H1s are rejected by the architecture guard;
browser regressions measure every sidebar destination across the responsive range.

Current Setup belongs inside `AppShell`; it is not a focused wizard or a gate
before the workspace. The retained `FocusedFrame`/`OnboardingShell` composition
is compatibility UI, with its existing 640px panel and mobile rules. Do not reuse
its back/next gates for the permanent Setup page.

**The One Shell Rule.** Pages own their content; core owns workspace navigation,
responsive chrome and shared layout. Internal links use the router and preserve
history without document reloads. Full navigation is for external authorization,
authentication and deployment boundaries.

## Elevation & Depth

Tonal surfaces and hairline borders provide most depth. The existing paper shadow
adds a restrained inset highlight to the legacy onboarding panel. The floating and dialog
shadows are inherited tokens for elevated surfaces; the React dialog uses the
dialog shadow with the shared dark backdrop. Their exact values are recorded in
`.impeccable/design.json`, alongside breakpoint metadata and component focus states.

Primary actions have no layers at rest. Hover brightens the face and reveals the
coral/cobalt layers at either side; pointer exit and press remove those layers.
Shared state transitions use `--motion-fast` (160ms ease-out). Pending indicators
use the existing rotation; reduced-motion rules suppress nonessential movement.
Legacy onboarding copy/reveal disclosures keep their immediate transitions; Setup uses the shared copy and disclosure controls.

## Shapes

Use the shared badge, control and panel radii. Controls and compact insets have
small corners; retained legacy panels and dialogs use the larger panel radius. Source
logos retain their original assets: compact slots in Usage and 44px icons in
Integrations. Identity initials
use compact square workspace avatars and circular user avatars. Dividers and
field borders are hairlines, with a stronger boundary only where interaction needs it.

## Components

### Ownership and composition

Consume `web-v2/src/design/components.tsx` through the public React package.
It owns Brand, Button, LinkButton, Field, Input, Select, Textarea, PageHeader, Section,
Notice, StatusBadge, EmptyState, LoadingState, Table, Dialog, CopyField and Tabs.
The shared icon set is in `src/design/icons.tsx`. Add a shared primitive only when
a real feature needs it. Hosted pages import the same controls, router and styles;
provider integration, membership and billing behavior remain in deployment adapters.

Strict TypeScript, shared native controls, a single router, token usage and the
absence of feature stylesheets or inline styles are enforced by architecture
checks. See `web-v2/AGENTS.md` for implementation and release rules. The retained
legacy onboarding stylesheet is a bounded compatibility exception; current Setup
uses shared console presentation.

### Buttons

Primary uses the mark's periwinkle face and dark ink, with the hover behavior above.
Console secondary uses `surface-subtle`, a `control-line` border and normal text;
hover raises the surface and strengthens its border. Quiet is transparent with
muted text; plain is transparent with normal text. Both reveal a subtle surface
on hover. Danger uses its semantic wash, outline and text. Disabled controls use
the quiet neutral treatment and remove layers. Busy buttons show the shared
spinner, expose busy state and prevent repeated submission.

Use 40px minimum desktop controls and 44px mobile/coarse-pointer targets. Icon-only
controls retain accessible names. Keyboard focus uses a 2px accent outline with
a 3px offset. LinkButton shares button presentation while preserving link semantics.
The secondary button remains part of the shared React design system. It is not the
React console secondary variant.

### Fields and copy controls

Field connects its visible label, hint or error to the shared native control.
Inputs use the surface, control border and control radius; invalid state uses
the danger border and an adjacent error. Disabled fields remain legible and
unavailable. Mobile text fields use 16px text. Textareas resize vertically.
CopyField keeps the value selectable and offers explicit clipboard feedback;
when copying fails, it selects the text for manual copying. Setup's installer
and agent handoff remain readable at narrow widths. The legacy split copy/reveal
control keeps its established timing only on retained compatibility surfaces.

### Navigation and tabs

Desktop navigation stays grouped at the right. Links have 40px padded targets
with 12px horizontal padding and 4px gaps, leaving vertical room inside the 72px
header. The active page uses bright text and a 2px accent stroke close beneath
the label, inside the target. Do not stretch the target to the header height or
move the stroke to the header bottom. Mobile navigation
links use muted text, a subtle hover surface and a periwinkle active wash.
Active links expose their current-page semantics. The mobile navigation drawer traps
focus while open, closes with Escape, restores the toggle's focus on dismissal
and makes underlying content inert. Internal page changes focus the new page
heading; the skip link remains available. Tabs are an in-page control with an
accent underline, 12px vertical and 16px horizontal label padding, 4px gaps,
roving focus, arrow-key navigation and Home/End support. The tab list owns the
single divider above its content; a following Section has no extra top border
or top padding. Do not stack two rules below the tabs.

### Sections, insets and tables

Section uses a top divider, heading, optional description/actions and consistent
vertical padding. An inset or code block is a subtle surface with control-radius
corners and shared padding, not an additional navigation frame. Source identity,
metadata, progress and actions use the shared connection-card patterns. Table owns the
labeled overflow region, spacing, separators and tabular numeral presentation.

### Feedback and dialogs

Notice and StatusBadge share semantic status pairs. EmptyState gives a direct
explanation and an available next action. LoadingState names the pending read.
Pages distinguish loading, empty, failed and current data, with actionable recovery;
client visibility never establishes authorization. Dialog uses the native modal
with an accessible title, optional description, close control and shared action
area. Preserve native focus behavior and Escape dismissal.

### Setup and the agent handoff

The CLI is the onboarding bootloader. It signs in before client changes, installs
selected native plugins, saves future-recording choices, and separately asks which
available histories to import. Detected supported choices start selected; saved
off choices remain off. Recording needs its plugin, but plugins may stay
search-only and history remains independent. The one-line history benefit is:
“Import past sessions so your agents can find previous decisions, fixes, and context.”
Approved import work runs in the background.

Setup is the first permanent sidebar item inside `AppShell`. Use the shared
`Page`, `Section`, `CopyField`, status rows and disclosures. Present the guarded
installer/setup command before the agent handoff. Group progress by machine and
client, with separate facts for native activation, hook trust, MCP, recording
proof and historical import. Preserve ordinary workspace navigation while any
of these are pending and keep the page available for later machines and clients.
Integrations and Team remain optional workspace destinations.

The agent guides human-required native trust, reload and MCP authentication one
step at a time in the current conversation where the harness permits it. Keep
one stable handoff rather than switching to a separate “test MCP” prompt. Use
`setup status --local --json` for saved installation identity and effective
choices; it must state that the server and current authentication were not
checked. Native MCP `installation_status` and `verify_installation` provide
current server evidence without requiring shell network access. Never require a
sandbox-policy change, credential copy or repeated questionnaire.

For recording clients, completion needs both a captured/searchable new-session
proof and native MCP call/result correlation (`verified` plus `authenticated`).
For search-only clients, preserve recording off and show `not_selected` with
observed authenticated transport instead of requesting capture. A local/server
choice mismatch stays pending until normally authorized resume reconciles it.
A `prepared` bundle is not native activation; a first searchable session does not
mean every client or history import has finished. Keep genuine server evidence
visible even if the CLI has not reported its latest activation observation.

Use labeled loading, empty, error and pending states with specific recovery.
Keep copy fallbacks selectable, keyboard focus visible and long commands bounded
on mobile. The Setup page has no Replicas enrollment action. Existing focused
onboarding components and receipt endpoints remain compatibility surfaces, not
current three-step admission gates. No fixture data or state controls ship in
the product. See [the behavior contract](docs/onboarding.md) and
[QA](docs/onboarding-qa.md).

## Do's and Don'ts

### Do:

- **Do** reuse the Night tokens, existing brand assets and self-hosted Geist fonts.
- **Do** compose each workspace page from the shared shell, layout and controls.
- **Do** show labeled loading, empty, error, busy and current states with recovery.
- **Do** keep Setup permanent and nonblocking, and preserve saved choices and compatibility receipts.
- **Do** verify keyboard focus, narrow layouts, internal navigation and Setup states.

### Don't:

- **Don't** create another workspace navigation, page-local palette or feature stylesheet.
- **Don't** substitute new illustrations, fonts or provider marks for the inherited assets.
- **Don't** use status color without explanatory text or make client visibility an authority check.
- **Don't** make setup, integrations or invitations a gate to the admitted workspace, or hide pending client evidence.

## Approved Usage organization

Preserve the original Usage screen's Night typography, source identities, cards
and quiet surfaces. The user's current refinement replaces its tabs with one
continuous page ordered **Agent sessions**, **Data sources**, then **Team**.
The source tiles show actual indexed document-type counts for each connection;
import breakdowns and Imported/Indexed labels are omitted. Missing breakdowns are unavailable,
never inferred from ingestion rows. Do not use progress or relative-size bars to
compare different index corpora.

Agent sessions groups captured sessions, messages, tool calls, machines, daily
activity and available tool/harness/surface breakdowns. Do not relabel messages
as turns without an independently measured turn count. Team is the per-person
leaderboard and session/tool-call highlights, without a Most sources connected tile; workspace membership administration stays
on the Team management route.

Usage is the hosted home at `/`; `/usage` preserves query parameters when redirecting
to it. Old tab queries no longer hide sections. The same AppShell left sidebar is used
across every workspace route. Keep the remaining screen contents unchanged until
their individual review.

Shared report patterns include Page, PageHeader, dotted StatusBadge
pills, MetricGrid, ActivityChart and report sections. Nested report headings use
Section's level-three variant. Report panels use 24px padding and 12px corners;
metrics use 20px padding, 12px gaps and 32px figures. The page title follows the shared console heading.
Unavailable measurements stay distinct from measured zero, and tables scroll
inside their own container at narrow widths.

Main session overlap follows Daily agent sessions in its own report panel. The
shared DailyLineChart uses a solid lavender daily average and dashed green daily
peak, UTC day labels, and a zero-based session axis. Both series share one scale.
Keep the description concise, with date/value details and the partial current day
identified in hover titles. Do not add a data-table disclosure, persistent caption,
or explanatory notes. Unavailable data never becomes a zero line.
Session activity responses require overlap data. Failed overlap reads reject the
shared Usage query so its scoped cache retains the last complete report; never
replace the chart with a per-panel unavailable message on refresh.

## Integrations

Integrations uses an alphabetical, responsive grid of uniform connector cards.
Every collapsed card occupies the same space. Show the catalog-selected key metric,
or the highest valid count when no key metric is available, with an N more caret
button that expands the full list of stats. Keep real zero counts, per-stream
completion, and measured progress. Use 8px solid status dots without glow and
unframed provider icons. Search and state filters support a growing catalog.
Shared dialogs retain setup, sign-in recovery, sync retries and confirmed deletion.

The shared `oc-connector-*` patterns own the 226px collapsed cards and their
3/2/1-column grid. Expanding a card never stretches neighboring cards. The same
core component and shared Button, Dialog and Icon primitives serve hosted and
self-hosted adapters. Imported stats describe ingest progress, not Usage indexed
document counts. `/sources` and its `/integrations` alias share one page.

## Team management

Team uses the same full-width page grid as every sidebar destination. Form rows
use the shared 640px measure inside it.
The member roster is the primary content: initials, a name and email grouped as
one identity, with the role aligned at the right. Display the actual member
count beside the section heading, distinguishing active members from pending
invitations. Pending invitations belong in the same roster, with an explicit
Pending status in the row. Workspace membership is invite-only; keep invitation
controls below the roster.
Activity and rankings belong to the Usage report, not membership administration.

Use the shared `oc-management-*`, `oc-member-*` and `oc-invite-form` patterns
with existing Section, Field, Input and Button controls.
Only show actions supported by the server. Invitations have explicit busy,
success and failure feedback; a failed list refresh must not suggest that a
successful invitation should be sent again. Clear displayed team information
and privileged controls when membership or authentication is revoked.

Team updates automatically every 30 seconds while visible and when returning
to the page. Normal use has no Refresh button. Background updates preserve
input and focus, skip overlapping reads, pause during mutations and while hidden,
and stop on unmount. Keep a retry action for initial loading failures.

## Diagnostics forum

The topic index, individual thread and global stream retain the original forum
composition. Shared `ForumPanel` provides the bordered surface, shaded title band,
count strip and pagination footer. Shared `Table` supplies the compact Topic,
Posts and Latest post columns; the last column places the date above the author.
Shared `ForumPost` supplies the 190px author rail, timestamp/message-number header
and full, wrapping message body. On narrow screens the author sits above the
message. Use Night surfaces, Geist and the existing small control radius. Do not
add decorative avatars, truncation, topic cards or a normal-state Refresh button.
The All topics link sits above the topic panel at its left edge, outside the
title band. Use the shared left-arrow icon before its text and SPA navigation.

The count strip says “Showing N messages” for a paginated thread or stream.
Automatic updates reconnect a bounded staged chain to existing history before
prepending it. Each continuation verifies an overlapping boundary post. A normal
chunk reads at most five pages; a detected history reset discards cached/staged
posts and permits one additional fresh-head recovery read. Updates retain loaded
older messages and preserve the reading position
only after the reader has scrolled into the list. The beginning of the list
reveals new posts naturally. Topic navigation remains SPA history. Loading,
empty and error states keep the same title/panel frame. Access and unclassified
read failures discard board data; explicit server failures may retain confirmed
posts with visible retry status.

## Text separators

Centered-dot separators (U+00B7) are forbidden in every authored UI, including
metadata, browser titles, templates, HTML entities, and escaped Unicode forms.
Use natural punctuation, sentences, spacing, or separate lines. Do not replace
separator dots with decorative badges. Genuine status indicators and user/source
content remain intact. The shared architecture guard enforces this rule in core
and hosted React source.

The Usage report retains its top-level narrative above Agent sessions: imported
records and source count, measured indexed documents, and median query time. Use
`report-summary` with the original emphasized numeric spans. Never substitute zero
for unavailable measurements, and retain the accepted section order and per-source
indexed document types without reintroducing aggregate comparison bars.

Source tiles show only actual indexed document-type counts, with source identity
and sync metadata. Omit Imported/Indexed labels, import breakdowns and aggregate
totals so each card presents one content breakdown.


## React document ownership

All browser screens are client-rendered React, including focused authentication,
organization selection, provider handoffs, privacy and capture setup. The server
owns authorization, redirects and HTTP status; it emits the shared empty app
mount and escaped inert JSON only. Use the same controls and tokens as the console.
Hosted organization provisioning/selection and hosted legal content stay in shell;
reusable callbacks, authentication outcomes and capture setup stay in core.

## Memory documents

Memory documents use the shared Markdown reader: 15px prose at the 75ch measure,
semantic headings beneath the page title, spaced paragraphs and lists, monospace
code, and the existing overflow-aware Table for GFM tables. Keep prose on the page
surface and code on its inset surface. The separate Markdown source disclosure
retains the unchanged capture and keyboard-scrollable raw text.

## Diagnostic search inspection

Diagnostics is an administrative inspection surface, not the workspace's primary
search entry point. Its Search inspector tab leads directly to a compact query
form and short introduction; do not repeat the tab name as another heading.
Source-specific result rows use real titles, provider/harness, kind/role, available
channel/session/path context and valid timestamps. Body text uses the 15px prose
token with preserved line breaks. Highlight literal query text through React
nodes, never HTML strings. Full text, item metadata and the response JSON remain
intentional disclosures; closed disclosures do not render or serialize their
large payloads. Preserve server excerpt metadata and label excerpts as such,
never as the entire indexed document. Source links exist only for supplied absolute HTTP(S)
URLs without embedded credentials; do not manufacture provider links from IDs.

Returned rows are not total matches. Distinguish reported exact/lower-bound totals
from unknown totals, pending/unconfigured/unavailable sources, truncation,
timeouts and failed shards. An incomplete source response is not a complete empty
search. The self-host adapter preserves coverage and never turns window length
into a total. New or canceled queries, failures, adapter changes and unmounts
clear prior result data. Late responses cannot replace the latest submitted query.
Input edits remain separate from the displayed submitted query; Cancel restores
focus to the query field. Keep the approved workspace shell, tabs and forum intact.

Metric cards align labels and values at the top regardless of description length.
Report columns respond to the main pane width: below 900px, use two metric columns
and one column for paired panels, preserving legibility beside the sidebar.

The account footer matches the supplied person/workspace reference. Its 64px
row spans the sidebar below a full-width divider; a 32px outlined workspace icon
sits 16px from the edge. Person name uses 16px type above the 13px workspace name.
One trailing chevron opens the native account popover above the row. Keep the
workspace name here instead of repeating it beneath Brand. Outside clicks and
Escape close the account menu. Inside mobile navigation, the first Escape closes
account details and the second closes the drawer. Workspace-only adapters show
static footer context without an empty menu.

The sidebar starts 16px from the top. Keep the wordmark optically aligned with
the mark using its scoped 2px adjustment. Integrations uses the shared plug icon.
The footer divider remains the only persistent horizontal rule in navigation.
