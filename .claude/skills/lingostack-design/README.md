# 译栈 LingoStack · Design System

A dark, developer-focused design system distilled from the five LingoStack
Tauri prototypes copied into this workspace. Near-black surfaces, a single coral
accent, a sky-blue operational signal, and an Inter + JetBrains Mono type
pairing. Built for desktop app / command-palette / translation surfaces.

## Product Overview

译栈（LingoStack）是一款面向非英语母语开发者的桌面翻译工作站，构建在 Tauri 2 / Rust 之上，常驻系统托盘。这款 app 覆盖一条完整的翻译链路：划词即译、变量命名、文档对照阅读、术语解释，并支持多 LLM 提供商并存（DeepSeek / Anthropic / Gemini / Ollama，仅用用户自己的 API Key）。它提供逐字流式渲染、保留产品名与变量名的「开发行业语言」、热键冲突检测、收藏与 JSON 导入导出等核心能力，设计上强调零遥测与 MIT 开源带来的可信感。本设计系统是所有译栈界面的唯一视觉契约。

The product is **built** on Tauri 2 / Rust and **provides** four primary surfaces — selection translation, variable naming, document side-by-side reading, and term explanation. It **features** streaming rendering, multi-LLM provider support (DeepSeek / Anthropic / Gemini / Ollama), hotkey conflict detection, and favorites import/export, and **includes** a privacy-first zero-telemetry promise.

- **Surface:** desktop web · Tauri 2 app
- **Category:** Project Design System
- **One-line:** 三层中性深表面 + 单一珊瑚强调 + 天蓝操作信号，Inter × JetBrains Mono。

## Source Context

Distilled from Open Design source project **"Web Prototype"** (`668f52f0-eb3c-47cc-b459-7ea9df5830ba`),
linked to the LingoStack repository. All tokens, patterns,
and copy are read verbatim from the five copied HTML prototypes — no color is
invented. The per-token evidence map lives in `context/provenance.md`, and the
source-project handoff notes are in `context/source-context.md`.

## Quick start

1. Open `preview/index.html` for the review gallery.
2. For any new LingoStack artifact, paste the `:root` block from `tokens.css`
   into the first `<style>`, load Inter + JetBrains Mono from Google Fonts,
   and follow `DESIGN.md` for composition and components.

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  /* paste tokens.css :root verbatim here */
</style>
```

## Package Contents

- `DESIGN.md` — canonical design prose (read first).
- `tokens.css` — canonical compiled tokens; `colors_and_type.css` — color + type foundations.
- `design-tokens.json` — tokens as JSON; `manifest.json` — project manifest.
- `README.md`, `SKILL.md` — package guide + agent workflow.
- `components.html` — standalone single-page component fixture.
- `preview/` — focused review cards (see Preview Manifest below).
- `ui_kits/app/` — applied interface kit (working main-window shell + component pages).
- `context/` — source-project handoff + provenance evidence.
- Source prototypes (read-only evidence): `main-window.html`, `index.html`, `selection-bar.html`, `translation-popup.html`, `term-explanation.html`.

## Preserved Assets

Real source-backed artifacts are preserved, not stubbed:

- `assets/brand-mark.svg`, `assets/logo-lingostack.svg`, `assets/app-icon.svg` — brand mark, wordmark, and runtime app/tray icon (re-drawn in SVG from the source CSS).
- `build/icons.svg` — 22-glyph application icon sprite (24×24, stroke 1.7, traced from the prototypes).
- No font binaries ship — the source loads Inter + JetBrains Mono from Google Fonts, so fonts are referenced by link rather than vendored.

## Preview Manifest

Focused review cards in `preview/` (open `preview/index.html` for the gallery):

- `preview/colors-primary.html` — color palette: surfaces, accent, signal, state
- `preview/typography-specimens.html` — type scale, families, keep-chip, kbd
- `preview/spacing-tokens.html` — 4px spacing grid + applied rhythm
- `preview/radius-elevation.html` — radius scale + elev-ring + focus ring
- `preview/components-buttons.html` — buttons + interaction states
- `preview/components-surfaces.html` — cards, pills, inputs, nav, statusbar
- `preview/brand-assets.html` — loads the SVG assets + icon sprite
- `preview/applied-surfaces.html` — real product surfaces (split-pane, popbar, modal)

## Review Workflow

1. **Start** at `preview/index.html` to survey the whole system.
2. **Inspect** foundations: `preview/colors-primary.html`, `preview/typography-specimens.html`.
3. **Open** real surfaces: `preview/applied-surfaces.html` and `ui_kits/app/translation-panel.html`.
4. **Copy** a component from `ui_kits/app/` and bind `tokens.css` — do not hard-code hex.
5. **Cross-check** against `DESIGN.md` §9 anti-patterns before shipping.

## File structure

```
.
├── DESIGN.md                  ← canonical design prose
├── tokens.css                 ← canonical compiled tokens
├── colors_and_type.css        ← color + type foundations
├── design-tokens.json         ← tokens as JSON
├── manifest.json              ← design-system project manifest
├── README.md · SKILL.md       ← package guide + agent workflow
├── components.html            ← standalone component fixture
├── context/
│   ├── source-context.md      ← source-project handoff
│   └── provenance.md          ← token / pattern / asset provenance
├── assets/                    ← brand-mark · logo · app-icon (SVG)
├── build/                     ← icons.svg sprite + README
├── preview/                   ← 8 focused cards + index
├── ui_kits/app/               ← applied interface kit (index + 6 pages + kit.css)
└── (source prototypes)        ← main-window / index / selection-bar / … (evidence)
```

## What to inspect first

| Reviewer interest | Open |
| --- | --- |
| Whole system at a glance | `preview/index.html` |
| Color + type foundations | `preview/colors-primary.html`, `preview/typography-specimens.html` |
| Real product surfaces | `preview/applied-surfaces.html`, `ui_kits/app/translation-panel.html` |
| Brand assets (loads SVGs) | `preview/brand-assets.html` |
| Generation rules | `SKILL.md` |
