---
name: lingostack-design
description: Generate 译栈 LingoStack surfaces — a dark developer-tool translation studio with a single coral accent and a sky-blue operational signal. Read before building any LingoStack screen.
user-invocable: true
---

# Skill · 译栈 LingoStack surfaces

Use when building or extending any LingoStack interface: the main window, the
selection action bar, the translation popup, the term-explanation modal,
favorites, or settings. LingoStack is a Tauri 2 desktop translation tool for
non-native-English developers. The visual language is **dark, dense, quiet, and
precise** — a local command-palette, not a consumer app.

## What's inside

A reusable package grounded in five source prototypes copied into the project:

- **Tokens:** `tokens.css` (canonical, paste `:root` verbatim), `colors_and_type.css` (color + type foundations).
- **Prose:** `DESIGN.md` (visual contract), `context/provenance.md` (evidence trail).
- **Assets:** `assets/brand-mark.svg`, `logo-lingostack.svg`, `app-icon.svg`.
- **Build:** `build/icons.svg` (24×24 icon sprite, stroke 1.7).
- **Preview:** `preview/*.html` focused cards (colors, typography, spacing, components, brand, applied UI).
- **UI kit:** `ui_kits/app/` — a working main-window shell with component pages.

## Source context

Distilled from Open Design source project "Web Prototype" (`668f52f0…`), linked
to the LingoStack repo. Every token, pattern, icon path, and copy
string traces to the five copied HTML prototypes — no color is invented. See
`context/provenance.md` for the per-token evidence map.

## When to use

Use when generating or revising LingoStack **prototypes, mockups, interfaces, or
production artifacts** — any Tauri desktop screen in this product family. Also
fits adjacent developer tools that share the dark command-palette mood. Skip for
marketing landing pages or print (declared exemptions in `manifest.json`).

## How to use

1. Read `DESIGN.md` for the visual contract and `SKILL.md` (this file) for the workflow.
2. Paste the `:root` block from `tokens.css` into the first `<style>`; load Inter + JetBrains Mono.
3. Copy component shapes from `ui_kits/app/` (e.g. `translation-panel.html`) and bind tokens — do not hard-code hex.
4. Pull icons from `build/icons.svg`, brand marks from `assets/`.
5. Review against the focused `preview/` cards before shipping.

## Design-system highlights

- **Colors:** three neutral dark surfaces (`#07080a / #101111 / #161719`), one coral accent `#FF6363`, sky-blue signal `hsl(202,100%,67%)`. One accent per screen.
- **Typography:** Inter (display + body, utilitarian single-family) + JetBrains Mono (code, terms, kbd, meta).
- **Spacing & layout:** 4px grid; 188px sidebar + panel + statusbar shell; `--container-max: 1120px`.
- **Radius & shadows:** 6 / 12 / 16 / pill; signature double-ring `--elev-ring`.
- **Icons:** lucide-style 24×24, stroke 1.7, `currentColor`.
- **Interaction:** hover brightens background (never grays text); every focusable element has a `:focus-visible` ring.

---

## 1. Bind tokens before any layout

Paste the full `:root` from `tokens.css` into the first `<style>`. Load fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Never invent hex values. Never introduce a second accent. The only hues are:
neutral dark surfaces/text, coral `--accent` (brand + conflict), and sky-blue
`--info` (the operational signal — streaming, keep-terms, focus, links).

## 2. Base reset (copy verbatim)

```css
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-body);
  font-size:var(--text-base);line-height:var(--leading-body);letter-spacing:.005em;
  -webkit-font-smoothing:antialiased;font-feature-settings:"calt","kern","liga","ss03"}
h1,h2,h3,h4{font-family:var(--font-display);margin:0;letter-spacing:var(--tracking-display);
  font-weight:600;text-wrap:balance}
p{margin:0;text-wrap:pretty}
::selection{background:hsla(202,100%,67%,.3)}
:focus-visible{outline:2px solid var(--info);outline-offset:2px}
```

For window shells, add the radial top wash:
`background:radial-gradient(120% 70% at 50% -10%, color-mix(in oklch,var(--surface) 50%,var(--bg)) 0%, var(--bg) 55%)`.

## 3. Signature patterns (use them — they are the identity)

- **Window shell:** macOS red-light titlebar (3× 11px dots = `color-mix(in oklch, var(--meta) 50%, var(--bg))`) → body → mono statusbar. Shell `border-radius:14px`, `box-shadow:var(--elev-ring), rgba(0,0,0,.6) 0 40px 90px -30px`, `border:1px solid var(--border)`.
- **Sidebar nav:** 188px fixed left rail; `.nav-item` idle `--muted`, hover `rgba(255,255,255,.04)` + `--fg-2`, active `rgba(255,255,255,.07)` + `--fg` **and a 2px left hairline**.
- **Primary button:** `background:hsla(0,0%,100%,.9); color:var(--bg); radius:var(--radius-pill); font-weight:600`. Hover → `hsla(0,0%,100%,1)`. Secondary = transparent + `rgba(255,255,255,.12)` border. **One primary action per viewport.**
- **Inputs:** `background:var(--bg)`; `border:1px solid rgba(255,255,255,.08)`. On focus hide outline and show `box-shadow:var(--focus-ring), 0 0 0 1px hsla(202,100%,67%,.4)`.
- **Cards:** `background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--elev-ring)`. Hover lifts border to `.14–.16`.
- **Streaming output:** render incrementally with a 1px×1.05em `--info` blinking caret. Keep preserved terms in `<span class="keep">` → mono, `--info`, `rgba(85,179,255,.1)` chip.
- **Mono is semantic:** variable names, model ids, versions, hotkeys, phonetics, stats, and all `--meta` microcopy are JetBrains Mono.
- **Eyebrow:** `font:var(--font-mono); text-transform:uppercase; letter-spacing:.16em; color:var(--accent)` — the only recurring place coral appears besides the brand mark.
- **Toast:** bottom-center pill, `--surface`, success dot, 1.5–1.6s.

## 4. Interaction-state contract (hard rule)

Hover/focus/active **never** move text toward the background. Move the
*background* lighter (`rgba(255,255,255,.04–.09)`) or brighten the border.
Every focusable element needs a visible `:focus-visible` ring. Disabled is the
only state allowed to drop contrast. Respect `prefers-reduced-motion`.

## 5. Layout integrity

- No accidental overlaps; no clipped/overflowing text.
- Panel titles ≥ 24px, page H1 ≥ 40px; body ≥ 14px; meta ≥ 12px.
- Touch targets ≥ 44px; icon buttons 30–40px in dense chrome.
- ≤760px collapses sidebar to a horizontal icon strip and stacks splits.

## 6. Copy & voice

Chinese-first UI; preserve English technical terms verbatim (product names,
variable names, command names, API ids) — the product's core translation
philosophy. Numbers, versions, model ids are mono. No fabricated metrics.

## 7. Anti-patterns (do not ship)

- Second accent hue, purple gradient wash, gradients on every layer.
- Emoji as functional icons (use `build/icons.svg`).
- Hover that grays-out text; light-on-light or dark-on-dark pairs.
- Two primary buttons for one action in one viewport.
- Warm beige/cream backgrounds — LingoStack is cool near-black.
- Translating terms that must be preserved; designer-only control panels.
