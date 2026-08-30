---
status: accepted
---

# Keep document translation state in Rust-owned SQLite

Document translation must continue while the React view is unmounted or hidden and must atomically preserve internal-fragment progress, deduplication, terminology, pause/resume, deletion, and replacement translations across process restarts. Store this state behind the `lingostack-document` module in a local SQLite database owned by Rust, rather than extending the renderer's IndexedDB or writing large JSON snapshots; only the content hash, normalized Markdown fragments, translations, terms, and lifecycle metadata are retained, never the source binary or absolute path. The renderer receives only a continuous source or translation Markdown document, so persistence and retry mechanics cannot dictate the reading layout. This adds a native dependency and migration responsibility, but makes the background job and transaction contract testable and keeps a future terminology module from depending on a live renderer.
