# ui_kits/app — 译栈 LingoStack 应用界面套件

An applied interface kit that replays the real LingoStack main-window shell —
macOS traffic-light titlebar, fixed icon sidebar, multi-panel body, mono
statusbar — and fills it with working, token-bound components.

## Structure

The kit ships an `index.html` launcher plus one component page per category.
Each page binds `../../tokens.css` and `kit.css`; the launcher also loads
`colors_and_type.css`. Copy any page (or the whole folder) into your app's
`components/` directory and adjust the relative token paths.

| File | Role |
| --- | --- |
| `index.html` | 概览 launcher — brand, token summary, links to every category |
| `kit.css` | shared shell + component library (linked by every page) |
| `translation-panel.html` | signature surface: split-pane + streaming |
| `buttons.html` · `surfaces.html` · `forms.html` · `navigation.html` · `overlays.html` | focused component pages |

## Components

The kit composes these elements (named for porting into a React/Vue build):

| Element | Where | What |
| --- | --- | --- |
| **App** | every page | the window shell: titlebar + sidebar + panel + statusbar |
| **Sidebar** | every page | 188px fixed left nav with active hairline indicator |
| **InputBar** | `translation-panel.html` | source-text input area with live char count |
| **PreviewCard** | `index.html` | overview tiles linking to each category |

## Usage

1. **Open** `index.html` and use the Sidebar to switch categories.
2. **Copy** the panel markup you need (e.g. the translation split-pane) into your screen.
3. **Import** `kit.css` + `tokens.css` so the component classes resolve.
4. **Compose** new panels from the button / surface / form primitives — class names match the source prototypes, so porting is mechanical.
5. **Build** production screens by reusing the window shell rather than restyling.

## Design Notes

- **Based on** the source `main-window.html` shell — same titlebar dots, sidebar hairline, statusbar mono microcopy.
- **Layout:** 200px sidebar grid + scrollable panel; collapses to a horizontal icon strip ≤ 760px.
- **Colors & typography:** all values are tokens (`--surface`, `--accent`, `--info`, Inter × JetBrains Mono) — no hard-coded hex in components.
- **Tokens:** bind `../../tokens.css`; override identity tokens there to re-skin the whole kit.

## Source

Every component traces to a copied prototype — `translation-panel.html` mirrors
`main-window.html` (streaming split-pane), `overlays.html` mirrors
`translation-popup.html` + `term-explanation.html` + `selection-bar.html`. See
`../../context/provenance.md` for the full evidence map.
