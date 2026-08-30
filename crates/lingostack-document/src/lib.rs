//! Rust-owned document records and versioned SQLite translation generations.
#![forbid(unsafe_code)]

use std::path::Path;

use futures::future::BoxFuture;
use lingostack_docparse::{
    parse_document, BlockKind, DocParseError, ParseLimits, ParsedDocument, Segment,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const SCHEMA_VERSION: i64 = 5;

#[derive(Debug, thiserror::Error)]
pub enum DocumentError {
    #[error(transparent)]
    Parse(#[from] DocParseError),
    #[error("document storage error")]
    Storage(#[from] rusqlite::Error),
    #[error("document translation protocol error: {0}")]
    Protocol(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentStatus {
    Parsing,
    Translating,
    Pausing,
    Paused,
    PartialFailed,
    Completed,
    Unsupported,
    Failed,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentSnapshot {
    pub id: String,
    pub file_name: String,
    pub status: DocumentStatus,
    pub block_count: u32,
    pub translated_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ImportOutcome {
    Imported { data: DocumentSnapshot },
    OpenExisting { data: DocumentSnapshot },
    Rejected { message: String },
}
/// The only reader modes exposed beyond the document module.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentView {
    Source,
    Translation,
}

/// One continuous Markdown document, assembled from internal execution parts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentContent {
    pub markdown: String,
    pub complete: bool,
    pub missing_parts: u32,
}

/// A normalized terminology item scoped to a legacy translation generation.
#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentTerm {
    pub term: String,
    pub category: String,
    pub explanation: String,
}
/// One normalized Markdown document supplied to the LLM adapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentTranslationRequest {
    pub source: String,
}
/// The app owns providers and secrets. This module owns validation and durable state.
pub trait DocumentTranslationPort {
    fn translate<'a>(
        &'a mut self,
        request: DocumentTranslationRequest,
    ) -> BoxFuture<'a, Result<String, String>>;
}
/// Transactional SQLite facade. It never stores source paths or source bytes.
pub struct DocumentModule {
    conn: Connection,
    limits: ParseLimits,
}

impl DocumentModule {
    pub fn open(path: impl AsRef<Path>, limits: ParseLimits) -> Result<Self, DocumentError> {
        let mut conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        migrate(&mut conn)?;
        Ok(Self { conn, limits })
    }
    pub fn import_bytes(
        &mut self,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<ImportOutcome, DocumentError> {
        let hash = hex_digest(bytes);
        if let Some(snapshot) = self.find_by_hash(&hash)? {
            return Ok(ImportOutcome::OpenExisting { data: snapshot });
        }
        let parsed = match parse_document(Path::new(file_name), bytes, self.limits) {
            Ok(value) => value,
            Err(error @ DocParseError::OcrRequired)
            | Err(error @ DocParseError::UnsupportedFormat) => {
                return Ok(ImportOutcome::Rejected {
                    message: error.to_string(),
                })
            }
            Err(error) => return Err(error.into()),
        };
        let id = Uuid::new_v4().to_string();
        let tx = self.conn.transaction()?;
        tx.execute("INSERT INTO documents (id, content_hash, file_name, status, created_at) VALUES (?1, ?2, ?3, 'paused', unixepoch())", params![id, hash, safe_name(file_name)])?;
        insert_blocks(&tx, &id, &parsed)?;
        tx.commit()?;
        Ok(ImportOutcome::Imported {
            data: self.snapshot(&id)?.expect("inserted document"),
        })
    }
    pub fn list(&self) -> Result<Vec<DocumentSnapshot>, DocumentError> {
        let mut statement = self.conn.prepare(&snapshot_query(""))?;
        let snapshots = statement
            .query_map([], snapshot_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DocumentError::Storage)?;
        Ok(snapshots)
    }
    /// A completed document receives a fresh working generation while its active generation stays readable.
    pub fn begin_translation(&mut self, document_id: &str) -> Result<(), DocumentError> {
        let tx = self.conn.transaction()?;
        let working: Option<String> = tx
            .query_row(
                "SELECT working_generation_id FROM documents WHERE id = ?1",
                [document_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let generation_id = working.unwrap_or_else(|| Uuid::new_v4().to_string());
        if tx
            .query_row(
                "SELECT 1 FROM generations WHERE id = ?1",
                [&generation_id],
                |_| Ok(()),
            )
            .optional()?
            .is_none()
        {
            tx.execute("INSERT INTO generations (id, document_id, status, created_at) VALUES (?1, ?2, 'working', unixepoch())", params![generation_id, document_id])?;
        } else {
            tx.execute(
                "UPDATE generations SET status = 'working' WHERE id = ?1",
                [&generation_id],
            )?;
        }
        tx.execute(
            "UPDATE documents SET status = 'translating', working_generation_id = ?2, error_message = NULL WHERE id = ?1",
            params![document_id, generation_id],
        )?;
        tx.commit()?;
        Ok(())
    }
    /// Legacy block scheduler retained only for read-migration tests. New
    /// translation jobs must use [`Self::document_translation_request`].
    #[cfg(test)]
    fn next_pending_block(
        &self,
        document_id: &str,
    ) -> Result<Option<DocumentTranslationRequest>, DocumentError> {
        let generation_id: Option<String> = self
            .conn
            .query_row(
                "SELECT working_generation_id FROM documents WHERE id = ?1",
                [document_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let Some(generation_id) = generation_id else {
            return Ok(None);
        };
        let row = self.conn.query_row("SELECT b.ordinal, b.source_template FROM blocks b LEFT JOIN block_results r ON r.generation_id = ?2 AND r.ordinal = b.ordinal WHERE b.document_id = ?1 AND COALESCE(r.status, 'pending') != 'succeeded' ORDER BY b.ordinal LIMIT 1", params![document_id, generation_id], |row| Ok((row.get::<_, u32>(0)?, row.get::<_, String>(1)?))).optional()?;
        let Some((_ordinal, source)) = row else {
            return Ok(None);
        };
        Ok(Some(DocumentTranslationRequest { source }))
    }
    /// New jobs submit exactly one normalized Markdown document. Parser blocks
    /// remain internal normalization data and are never scheduling units.
    pub fn document_translation_request(
        &self,
        document_id: &str,
    ) -> Result<Option<DocumentTranslationRequest>, DocumentError> {
        let working: Option<String> = self
            .conn
            .query_row(
                "SELECT working_generation_id FROM documents WHERE id = ?1",
                [document_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if working.is_none() {
            return Ok(None);
        }
        Ok(Some(DocumentTranslationRequest {
            source: self
                .document_content(document_id, DocumentView::Source)?
                .markdown,
        }))
    }
    pub fn save_document_translation(
        &mut self,
        document_id: &str,
        translation: &str,
    ) -> Result<(), DocumentError> {
        if translation.trim().is_empty() {
            return Err(DocumentError::Protocol("translation is empty".into()));
        }
        let tx = self.conn.transaction()?;
        let generation_id = working_generation(&tx, document_id)?;
        tx.execute(
            "INSERT INTO document_results (generation_id, translation) VALUES (?1, ?2) ON CONFLICT(generation_id) DO UPDATE SET translation = excluded.translation",
            params![generation_id, translation],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn mark_document_failed(
        &mut self,
        document_id: &str,
        error_message: &str,
    ) -> Result<(), DocumentError> {
        let tx = self.conn.transaction()?;
        let working: Option<String> = tx
            .query_row(
                "SELECT working_generation_id FROM documents WHERE id = ?1",
                [document_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let generation_id = working.unwrap_or_else(|| Uuid::new_v4().to_string());
        if tx
            .query_row(
                "SELECT 1 FROM generations WHERE id = ?1",
                [&generation_id],
                |_| Ok(()),
            )
            .optional()?
            .is_none()
        {
            tx.execute(
                "INSERT INTO generations (id, document_id, status, created_at) VALUES (?1, ?2, 'failed', unixepoch())",
                params![generation_id, document_id],
            )?;
        }
        tx.execute(
            "UPDATE generations SET status = 'failed' WHERE id = ?1",
            [&generation_id],
        )?;
        tx.execute(
            "UPDATE documents SET status = 'failed', working_generation_id = ?2, error_message = ?3 WHERE id = ?1",
            params![document_id, generation_id, error_message],
        )?;
        tx.commit()?;
        Ok(())
    }
    /// Validate an LLM response, restore protected content, and save terms atomically.
    #[cfg(test)]
    fn save_block_translation(
        &mut self,
        document_id: &str,
        ordinal: u32,
        raw_response: &str,
    ) -> Result<(), DocumentError> {
        let tx = self.conn.transaction()?;
        let generation_id = working_generation(&tx, document_id)?;
        let (template, protected_json): (String, String) = tx.query_row("SELECT source_template, protected_json FROM blocks WHERE document_id = ?1 AND ordinal = ?2", params![document_id, ordinal], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let response = parse_response(raw_response, &block_id(ordinal))?;
        let protected: Vec<String> = serde_json::from_str(&protected_json)
            .map_err(|_| DocumentError::Protocol("stored protected content is invalid".into()))?;
        let translation = restore_protected(&response.translation, &protected)?;
        if translation.trim().is_empty() {
            return Err(DocumentError::Protocol("translation is empty".into()));
        }
        tx.execute("INSERT INTO block_results (generation_id, ordinal, translation, status) VALUES (?1, ?2, ?3, 'succeeded') ON CONFLICT(generation_id, ordinal) DO UPDATE SET translation = excluded.translation, status = 'succeeded'", params![generation_id, ordinal, translation])?;
        for term in normalize_terms(response.terms, &template, &translation) {
            tx.execute("INSERT INTO terms (generation_id, normalized_term, term, category, explanation) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(generation_id, normalized_term) DO NOTHING", params![generation_id, normalize_term(&term.term), term.term, term.category, term.explanation])?;
        }
        tx.execute(
            "UPDATE documents SET status = 'translating' WHERE id = ?1",
            [document_id],
        )?;
        tx.commit()?;
        Ok(())
    }
    #[cfg(test)]
    fn mark_block_failed(&mut self, document_id: &str, ordinal: u32) -> Result<(), DocumentError> {
        let tx = self.conn.transaction()?;
        let generation_id = working_generation(&tx, document_id)?;
        tx.execute("INSERT INTO block_results (generation_id, ordinal, status) VALUES (?1, ?2, 'failed') ON CONFLICT(generation_id, ordinal) DO UPDATE SET status = 'failed'", params![generation_id, ordinal])?;
        tx.execute(
            "UPDATE generations SET status = 'partial_failed' WHERE id = ?1",
            [&generation_id],
        )?;
        tx.execute(
            "UPDATE documents SET status = 'partial_failed' WHERE id = ?1",
            [document_id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn mark_completed(&mut self, document_id: &str) -> Result<(), DocumentError> {
        self.finish_translation(document_id).map(|_| ())
    }
    /// Promote only a fully successful working generation in the same transaction.
    pub fn finish_translation(
        &mut self,
        document_id: &str,
    ) -> Result<DocumentStatus, DocumentError> {
        let tx = self.conn.transaction()?;
        let generation_id = working_generation(&tx, document_id)?;
        let whole_result: Option<String> = tx
            .query_row(
                "SELECT translation FROM document_results WHERE generation_id = ?1",
                [&generation_id],
                |row| row.get(0),
            )
            .optional()?;
        if whole_result.is_some() {
            tx.execute(
                "UPDATE generations SET status = 'completed' WHERE id = ?1",
                [&generation_id],
            )?;
            tx.execute("UPDATE documents SET active_generation_id = ?2, working_generation_id = NULL, status = 'completed', error_message = NULL WHERE id = ?1", params![document_id, generation_id])?;
            tx.commit()?;
            return Ok(DocumentStatus::Completed);
        }
        let missing: u32 = tx.query_row("SELECT COUNT(*) FROM blocks b LEFT JOIN block_results r ON r.generation_id = ?2 AND r.ordinal = b.ordinal WHERE b.document_id = ?1 AND COALESCE(r.status, 'pending') != 'succeeded'", params![document_id, generation_id], |row| row.get(0))?;
        if missing != 0 {
            return Err(DocumentError::Protocol(
                "cannot promote an incomplete generation".into(),
            ));
        }
        tx.execute(
            "UPDATE generations SET status = 'completed' WHERE id = ?1",
            [&generation_id],
        )?;
        tx.execute("UPDATE documents SET active_generation_id = ?2, working_generation_id = NULL, status = 'completed', error_message = NULL WHERE id = ?1", params![document_id, generation_id])?;
        tx.commit()?;
        Ok(DocumentStatus::Completed)
    }
    pub fn pause(&mut self, document_id: &str) -> Result<(), DocumentError> {
        self.conn.execute(
            "UPDATE documents SET status = 'paused', error_message = NULL WHERE id = ?1",
            [document_id],
        )?;
        Ok(())
    }
    pub fn pause_active_jobs(&mut self) -> Result<(), DocumentError> {
        self.conn.execute("UPDATE documents SET status = 'paused', error_message = NULL WHERE status IN ('parsing', 'translating', 'pausing')", [])?;
        Ok(())
    }
    pub fn delete(&mut self, document_id: &str) -> Result<(), DocumentError> {
        self.conn
            .execute("DELETE FROM documents WHERE id = ?1", [document_id])?;
        Ok(())
    }
    /// Reconstruct a continuous Markdown reader document without exposing
    /// execution blocks, terminology, or generation internals to callers.
    pub fn document_content(
        &self,
        document_id: &str,
        view: DocumentView,
    ) -> Result<DocumentContent, DocumentError> {
        if matches!(view, DocumentView::Translation) {
            let whole: Option<String> = self.conn.query_row(
                "SELECT dr.translation FROM documents d JOIN document_results dr ON dr.generation_id = d.active_generation_id WHERE d.id = ?1",
                [document_id],
                |row| row.get(0),
            ).optional()?;
            if let Some(markdown) = whole {
                return Ok(DocumentContent {
                    markdown,
                    complete: true,
                    missing_parts: 0,
                });
            }
            // v1-v3 records have per-block results only. They remain readable
            // iff their *active completed* generation is complete. A working,
            // failed, paused, or partial legacy generation must not leak source
            // fragments or `[未翻译]` markers into the reader.
            if let Some(markdown) = self.complete_legacy_translation(document_id)? {
                return Ok(DocumentContent {
                    markdown,
                    complete: true,
                    missing_parts: 0,
                });
            }
            return Ok(DocumentContent {
                markdown: String::new(),
                complete: false,
                missing_parts: 1,
            });
        }
        let mut statement = self.conn.prepare(
            "SELECT markdown_kind, source_text FROM blocks WHERE document_id = ?1 ORDER BY ordinal",
        )?;
        let rows = statement
            .query_map([document_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let parts = rows
            .into_iter()
            .map(|(markdown_kind, markdown)| MarkdownPart {
                markdown_kind,
                markdown,
                missing: false,
            })
            .collect::<Vec<_>>();
        let markdown = assemble_markdown(parts);
        Ok(DocumentContent {
            markdown,
            complete: true,
            missing_parts: 0,
        })
    }
    pub fn snapshot_by_id(&self, id: &str) -> Result<Option<DocumentSnapshot>, DocumentError> {
        self.snapshot(id)
    }
    fn complete_legacy_translation(
        &self,
        document_id: &str,
    ) -> Result<Option<String>, DocumentError> {
        let generation_id: Option<String> = self
            .conn
            .query_row(
                "SELECT d.active_generation_id FROM documents d JOIN generations g ON g.id = d.active_generation_id WHERE d.id = ?1 AND g.status = 'completed'",
                [document_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        let Some(generation_id) = generation_id else {
            return Ok(None);
        };
        let mut statement = self.conn.prepare("SELECT b.markdown_kind, r.translation, r.status FROM blocks b LEFT JOIN block_results r ON r.generation_id = ?2 AND r.ordinal = b.ordinal WHERE b.document_id = ?1 ORDER BY b.ordinal")?;
        let rows = statement
            .query_map(params![document_id, generation_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        if rows.is_empty()
            || rows.iter().any(|(_, translation, status)| {
                status != "succeeded" || translation.as_deref().map_or(true, str::is_empty)
            })
        {
            return Ok(None);
        }
        Ok(Some(assemble_markdown(
            rows.into_iter()
                .map(|(markdown_kind, translation, _)| MarkdownPart {
                    markdown_kind,
                    markdown: translation.expect("validated above"),
                    missing: false,
                })
                .collect(),
        )))
    }
    fn find_by_hash(&self, hash: &str) -> Result<Option<DocumentSnapshot>, DocumentError> {
        self.conn
            .query_row(
                "SELECT id FROM documents WHERE content_hash = ?1",
                [hash],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|id| self.snapshot(&id))
            .transpose()
            .map(|x| x.flatten())
    }
    fn snapshot(&self, id: &str) -> Result<Option<DocumentSnapshot>, DocumentError> {
        self.conn
            .query_row(&snapshot_query("WHERE d.id = ?1"), [id], snapshot_row)
            .optional()
            .map_err(Into::into)
    }
}

struct MarkdownPart {
    markdown_kind: String,
    markdown: String,
    missing: bool,
}
fn assemble_markdown(parts: Vec<MarkdownPart>) -> String {
    let mut sections = Vec::new();
    let mut index = 0;
    while index < parts.len() {
        if parts[index].markdown_kind != "table_row" {
            sections.push(parts[index].markdown.clone());
            index += 1;
            continue;
        }
        let end = parts[index..]
            .iter()
            .position(|part| part.markdown_kind != "table_row")
            .map_or(parts.len(), |offset| index + offset);
        let table_parts = &parts[index..end];
        if table_parts.iter().any(|part| part.missing) {
            // A blockquote marker is not valid inside a GFM table. Keep every
            // missing part explicit and outside table syntax rather than
            // silently fabricating a translated cell.
            sections.extend(table_parts.iter().map(|part| part.markdown.clone()));
        } else {
            sections.push(gfm_table(table_parts));
        }
        index = end;
    }
    sections.join("\n\n")
}
fn gfm_table(parts: &[MarkdownPart]) -> String {
    let header = parts
        .first()
        .map(|part| part.markdown.as_str())
        .unwrap_or_default();
    let columns = header.trim_matches('|').split('|').count().max(1);
    let divider = format!("| {} |", vec!["---"; columns].join(" | "));
    std::iter::once(header.to_owned())
        .chain(std::iter::once(divider))
        .chain(parts.iter().skip(1).map(|part| part.markdown.clone()))
        .collect::<Vec<_>>()
        .join("\n")
}

fn snapshot_query(filter: &str) -> String {
    format!("SELECT d.id, d.file_name, d.status, COUNT(b.ordinal), CASE WHEN EXISTS (SELECT 1 FROM document_results dr WHERE dr.generation_id = d.active_generation_id) THEN COUNT(b.ordinal) ELSE COALESCE(SUM(CASE WHEN r.status = 'succeeded' THEN 1 ELSE 0 END), 0) END, d.error_message FROM documents d LEFT JOIN blocks b ON b.document_id = d.id LEFT JOIN block_results r ON r.generation_id = COALESCE(d.active_generation_id, d.working_generation_id) AND r.ordinal = b.ordinal {filter} GROUP BY d.id ORDER BY d.created_at DESC")
}
fn snapshot_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSnapshot> {
    Ok(DocumentSnapshot {
        id: row.get(0)?,
        file_name: row.get(1)?,
        status: status_from_db(&row.get::<_, String>(2)?),
        block_count: row.get(3)?,
        translated_count: row.get(4)?,
        error_message: row.get(5)?,
    })
}
fn migrate(conn: &mut Connection) -> Result<(), DocumentError> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(DocumentError::Protocol(
            "database schema is newer than this application".into(),
        ));
    }
    if version == SCHEMA_VERSION {
        return Ok(());
    }
    let tx = conn.transaction()?;
    if version == 0 {
        create_v3_schema(&tx)?;
    } else if version == 1 {
        migrate_v1_to_v2(&tx)?;
        migrate_v2_to_v3(&tx)?;
        migrate_v3_to_v4(&tx)?;
        migrate_v4_to_v5(&tx)?;
    } else if version == 2 {
        migrate_v2_to_v3(&tx)?;
        migrate_v3_to_v4(&tx)?;
        migrate_v4_to_v5(&tx)?;
    } else if version == 3 {
        migrate_v3_to_v4(&tx)?;
        migrate_v4_to_v5(&tx)?;
    } else if version == 4 {
        migrate_v4_to_v5(&tx)?;
    } else {
        return Err(DocumentError::Protocol(
            "unsupported document database schema".into(),
        ));
    }
    tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))?;
    tx.commit()?;
    Ok(())
}
fn create_v3_schema(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch("CREATE TABLE documents (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, active_generation_id TEXT, working_generation_id TEXT, error_message TEXT); CREATE TABLE blocks (document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, source_text TEXT NOT NULL, source_template TEXT NOT NULL, protected_json TEXT NOT NULL DEFAULT '[]', markdown_kind TEXT NOT NULL DEFAULT 'paragraph', PRIMARY KEY (document_id, ordinal)); CREATE TABLE generations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE document_results (generation_id TEXT PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE, translation TEXT NOT NULL); CREATE TABLE block_results (generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, translation TEXT, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (generation_id, ordinal)); CREATE TABLE terms (generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, normalized_term TEXT NOT NULL, term TEXT NOT NULL, category TEXT NOT NULL, explanation TEXT NOT NULL, PRIMARY KEY (generation_id, normalized_term));")
}
fn migrate_v1_to_v2(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch("ALTER TABLE block_results RENAME TO block_results_v1; ALTER TABLE terms RENAME TO terms_v1; ALTER TABLE documents ADD COLUMN active_generation_id TEXT; ALTER TABLE documents ADD COLUMN working_generation_id TEXT; ALTER TABLE blocks ADD COLUMN source_template TEXT; ALTER TABLE blocks ADD COLUMN protected_json TEXT; UPDATE blocks SET source_template = source_text, protected_json = '[]'; CREATE TABLE generations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE block_results (generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, translation TEXT, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (generation_id, ordinal)); CREATE TABLE terms (generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, normalized_term TEXT NOT NULL, term TEXT NOT NULL, category TEXT NOT NULL, explanation TEXT NOT NULL, PRIMARY KEY (generation_id, normalized_term));")?;
    let ids = {
        let mut statement = tx.prepare("SELECT id FROM documents")?;
        let ids = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        ids
    };
    for id in ids {
        let generation = Uuid::new_v4().to_string();
        tx.execute("INSERT INTO generations (id, document_id, status, created_at) VALUES (?1, ?2, 'completed', unixepoch())", params![generation, id])?;
        tx.execute("INSERT INTO block_results (generation_id, ordinal, translation, status) SELECT ?1, ordinal, translation, status FROM block_results_v1 WHERE document_id = ?2", params![generation, id])?;
        tx.execute("INSERT OR IGNORE INTO terms (generation_id, normalized_term, term, category, explanation) SELECT ?1, lower(trim(term)), term, 'technology', explanation FROM terms_v1 WHERE document_id = ?2", params![generation, id])?;
        tx.execute(
            "UPDATE documents SET active_generation_id = ?2 WHERE id = ?1",
            params![id, generation],
        )?;
    }
    tx.execute_batch("DROP TABLE block_results_v1; DROP TABLE terms_v1;")
}
fn migrate_v2_to_v3(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch(
        "ALTER TABLE blocks ADD COLUMN markdown_kind TEXT NOT NULL DEFAULT 'paragraph';",
    )
}
fn migrate_v3_to_v4(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch("CREATE TABLE document_results (generation_id TEXT PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE, translation TEXT NOT NULL);")
}
fn migrate_v4_to_v5(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch("ALTER TABLE documents ADD COLUMN error_message TEXT;")
}
fn insert_blocks(tx: &Transaction<'_>, id: &str, parsed: &ParsedDocument) -> rusqlite::Result<()> {
    for (ordinal, block) in parsed.blocks.iter().enumerate() {
        let mut source = String::new();
        let mut template = String::new();
        let mut protected = Vec::new();
        for segment in &block.segments {
            match segment {
                Segment::Translatable(text) => {
                    source.push_str(text);
                    template.push_str(text);
                }
                Segment::Protected(text) => {
                    source.push_str(text);
                    let marker = format!("<<<LINGOSTACK_PROTECTED_{}>>>", protected.len());
                    template.push_str(&marker);
                    protected.push(text);
                }
            }
        }
        let markdown_kind = markdown_kind(&block.kind);
        let source = markdown_fragment(&block.kind, &source);
        let template = markdown_fragment(&block.kind, &template);
        tx.execute("INSERT INTO blocks (document_id, ordinal, source_text, source_template, protected_json, markdown_kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![id, ordinal as u32, source, template, serde_json::to_string(&protected).expect("string serialization"), markdown_kind])?;
    }
    Ok(())
}
fn markdown_kind(kind: &BlockKind) -> String {
    match kind {
        BlockKind::Heading { level } => format!("heading:{level}"),
        BlockKind::Paragraph => "paragraph".into(),
        BlockKind::ListItem => "list_item".into(),
        BlockKind::Quote => "quote".into(),
        BlockKind::Code => "code".into(),
        BlockKind::TableRow => "table_row".into(),
        BlockKind::TableCell => "table_cell".into(),
    }
}
fn markdown_fragment(kind: &BlockKind, text: &str) -> String {
    match kind {
        BlockKind::Heading { level } => format!("{} {}", "#".repeat((*level).into()), text.trim()),
        BlockKind::Paragraph | BlockKind::TableCell => text.trim().to_owned(),
        BlockKind::ListItem => format!("- {}", text.trim()),
        BlockKind::Quote => text
            .lines()
            .map(|line| format!("> {line}"))
            .collect::<Vec<_>>()
            .join("\n"),
        BlockKind::Code => format!("```\n{}\n```", text.trim_end()),
        BlockKind::TableRow => format!(
            "| {} |",
            text.split('\t')
                .map(str::trim)
                .collect::<Vec<_>>()
                .join(" | ")
        ),
    }
}
#[cfg(test)]
#[derive(Deserialize)]
struct RawResponse {
    id: String,
    translation: String,
    #[serde(default)]
    terms: Vec<DocumentTerm>,
}
#[cfg(test)]
fn parse_response(raw: &str, expected_id: &str) -> Result<RawResponse, DocumentError> {
    let value: RawResponse = serde_json::from_str(raw)
        .map_err(|_| DocumentError::Protocol("response must be JSON object".into()))?;
    if value.id != expected_id {
        return Err(DocumentError::Protocol(
            "response block id does not match requested block".into(),
        ));
    }
    Ok(value)
}
#[cfg(test)]
fn restore_protected(translation: &str, protected: &[String]) -> Result<String, DocumentError> {
    let mut result = translation.to_owned();
    for (index, value) in protected.iter().enumerate() {
        let marker = format!("<<<LINGOSTACK_PROTECTED_{index}>>>");
        if result.matches(&marker).count() != 1 {
            return Err(DocumentError::Protocol(
                "protected placeholder was changed or duplicated".into(),
            ));
        }
        result = result.replace(&marker, value);
    }
    if result.contains("<<<LINGOSTACK_PROTECTED_") {
        return Err(DocumentError::Protocol(
            "unknown protected placeholder".into(),
        ));
    }
    Ok(result)
}
#[cfg(test)]
fn normalize_terms(terms: Vec<DocumentTerm>, source: &str, translation: &str) -> Vec<DocumentTerm> {
    let haystack = format!("{source}\n{translation}").to_lowercase();
    let mut seen = std::collections::HashSet::new();
    terms
        .into_iter()
        .filter_map(|term| {
            let normalized = normalize_term(&term.term);
            let valid = !normalized.is_empty()
                && !term.explanation.trim().is_empty()
                && matches!(
                    term.category.as_str(),
                    "technology" | "programming" | "product"
                )
                && haystack.contains(&normalized)
                && seen.insert(normalized);
            valid.then(|| DocumentTerm {
                term: term.term.trim().to_owned(),
                category: term.category,
                explanation: term.explanation.trim().to_owned(),
            })
        })
        .take(5)
        .collect()
}
#[cfg(test)]
fn normalize_term(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
fn working_generation(tx: &Transaction<'_>, document_id: &str) -> Result<String, DocumentError> {
    tx.query_row(
        "SELECT working_generation_id FROM documents WHERE id = ?1",
        [document_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()?
    .flatten()
    .ok_or_else(|| DocumentError::Protocol("no active working generation".into()))
}
#[cfg(test)]
fn block_id(ordinal: u32) -> String {
    format!("block-{}", ordinal + 1)
}
fn safe_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document")
        .to_owned()
}
fn hex_digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn status_from_db(value: &str) -> DocumentStatus {
    match value {
        "parsing" => DocumentStatus::Parsing,
        "translating" => DocumentStatus::Translating,
        "pausing" => DocumentStatus::Pausing,
        "partial_failed" => DocumentStatus::PartialFailed,
        "completed" => DocumentStatus::Completed,
        "unsupported" => DocumentStatus::Unsupported,
        "failed" => DocumentStatus::Failed,
        _ => DocumentStatus::Paused,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn module() -> (tempfile::NamedTempFile, DocumentModule) {
        let file = tempfile::NamedTempFile::new().unwrap();
        let module = DocumentModule::open(file.path(), ParseLimits::default()).unwrap();
        (file, module)
    }
    fn imported(module: &mut DocumentModule) -> DocumentSnapshot {
        match module
            .import_bytes("a.md", b"Use `cargo test`.\n\nsecond")
            .unwrap()
        {
            ImportOutcome::Imported { data: value } => value,
            _ => panic!("import"),
        }
    }
    fn imported_table(module: &mut DocumentModule) -> DocumentSnapshot {
        match module
            .import_bytes(
                "table.md",
                b"| Name | Value |\n| --- | --- |\n| source | value |\n",
            )
            .unwrap()
        {
            ImportOutcome::Imported { data: value } => value,
            _ => panic!("import"),
        }
    }
    fn response(id: &str, translation: &str) -> String {
        serde_json::json!({"id": id, "translation": translation, "terms": []}).to_string()
    }
    #[test]
    fn import_is_deduped_by_content_not_filename_and_does_not_store_path() {
        let (_file, mut module) = module();
        let first = match module
            .import_bytes("C:/private/one.md", b"# Heading")
            .unwrap()
        {
            ImportOutcome::Imported { data: value } => value,
            _ => panic!(),
        };
        assert_eq!(first.file_name, "one.md");
        assert!(matches!(
            module.import_bytes("different.md", b"# Heading").unwrap(),
            ImportOutcome::OpenExisting { .. }
        ));
    }
    #[test]
    fn import_outcome_serializes_success_snapshot_under_data() {
        let outcome = ImportOutcome::Imported {
            data: DocumentSnapshot {
                id: "doc-1".into(),
                file_name: "example.md".into(),
                status: DocumentStatus::Paused,
                block_count: 2,
                translated_count: 0,
                error_message: None,
            },
        };
        let value = serde_json::to_value(outcome).unwrap();
        assert_eq!(value["type"], "imported");
        assert_eq!(value["data"]["id"], "doc-1");
        assert_eq!(value["data"]["file_name"], "example.md");
        let rejected = serde_json::to_value(ImportOutcome::Rejected {
            message: "OCR is required".into(),
        })
        .unwrap();
        assert_eq!(
            rejected,
            serde_json::json!({"type":"rejected","message":"OCR is required"})
        );
    }
    #[test]
    fn reader_contract_serializes_exactly_for_tauri_typescript_mirror() {
        assert_eq!(
            serde_json::to_string(&DocumentView::Translation).unwrap(),
            r#""translation""#
        );
        assert_eq!(
            serde_json::to_string(&DocumentContent {
                markdown: "# 已翻译".into(),
                complete: false,
                missing_parts: 2,
            })
            .unwrap(),
            r##"{"markdown":"# 已翻译","complete":false,"missing_parts":2}"##
        );
    }
    #[test]
    fn markdown_fragments_keep_each_parser_kind_semantic() {
        assert_eq!(
            markdown_fragment(&BlockKind::Heading { level: 2 }, "Title"),
            "## Title"
        );
        assert_eq!(markdown_fragment(&BlockKind::Paragraph, "body"), "body");
        assert_eq!(markdown_fragment(&BlockKind::ListItem, "item"), "- item");
        assert_eq!(
            markdown_fragment(&BlockKind::Quote, "one\ntwo"),
            "> one\n> two"
        );
        assert_eq!(
            markdown_fragment(&BlockKind::Code, "let x = 1;"),
            "```\nlet x = 1;\n```"
        );
        assert_eq!(
            markdown_fragment(&BlockKind::TableRow, "left\tright"),
            "| left | right |"
        );
        assert_eq!(markdown_fragment(&BlockKind::TableCell, "cell"), "cell");
    }
    #[test]
    fn legacy_partial_translation_is_never_exposed_in_reader() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        assert!(module
            .save_block_translation(
                &doc.id,
                0,
                &response("wrong", "Use <<<LINGOSTACK_PROTECTED_0>>>.")
            )
            .is_err());
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "使用 <<<LINGOSTACK_PROTECTED_0>>>。"),
            )
            .unwrap();
        assert!(module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap()
            .markdown
            .is_empty());
    }
    #[test]
    fn reader_content_hides_incomplete_legacy_translation() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "使用 <<<LINGOSTACK_PROTECTED_0>>>。"),
            )
            .unwrap();
        let source = module
            .document_content(&doc.id, DocumentView::Source)
            .unwrap();
        let translation = module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap();
        assert_eq!(source.markdown, "Use `cargo test`.\n\nsecond");
        assert!(translation.markdown.is_empty());
        assert!(!translation.complete);
        assert_eq!(translation.missing_parts, 1);
    }
    #[test]
    fn whole_document_translation_is_saved_and_revealed_only_after_completion() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        let request = module
            .document_translation_request(&doc.id)
            .unwrap()
            .unwrap();
        assert_eq!(request.source, "Use `cargo test`.\n\nsecond");
        assert!(module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap()
            .markdown
            .is_empty());
        module
            .save_document_translation(&doc.id, "使用 `cargo test`。\n\n第二段")
            .unwrap();
        module.finish_translation(&doc.id).unwrap();
        let translation = module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap();
        assert_eq!(translation.markdown, "使用 `cargo test`。\n\n第二段");
        assert!(translation.complete);
        let snapshot = module.snapshot_by_id(&doc.id).unwrap().unwrap();
        assert_eq!(snapshot.translated_count, snapshot.block_count);
    }
    #[test]
    fn failed_translation_reason_is_durable_and_retry_clears_it() {
        let (file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        module
            .mark_document_failed(&doc.id, "provider rejected this request")
            .unwrap();
        assert_eq!(
            module
                .snapshot_by_id(&doc.id)
                .unwrap()
                .unwrap()
                .error_message,
            Some("provider rejected this request".into())
        );

        drop(module);
        let mut reopened = DocumentModule::open(file.path(), ParseLimits::default()).unwrap();
        assert_eq!(
            reopened
                .snapshot_by_id(&doc.id)
                .unwrap()
                .unwrap()
                .error_message,
            Some("provider rejected this request".into())
        );
        reopened.begin_translation(&doc.id).unwrap();
        assert_eq!(
            reopened
                .snapshot_by_id(&doc.id)
                .unwrap()
                .unwrap()
                .error_message,
            None
        );
    }
    #[test]
    fn table_rows_assemble_as_gfm_and_translation_keeps_source_order() {
        let (_file, mut module) = module();
        let doc = imported_table(&mut module);
        let source = module
            .document_content(&doc.id, DocumentView::Source)
            .unwrap();
        assert_eq!(
            source.markdown,
            "| Name | Value |\n| --- | --- |\n| source | value |"
        );
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(&doc.id, 0, &response("block-1", "| 名称 | 值 |"))
            .unwrap();
        module
            .save_block_translation(&doc.id, 1, &response("block-2", "| 来源 | 内容 |"))
            .unwrap();
        module.finish_translation(&doc.id).unwrap();
        let translation = module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap();
        assert_eq!(
            translation.markdown,
            "| 名称 | 值 |\n| --- | --- |\n| 来源 | 内容 |"
        );
        assert!(translation.complete);
    }
    #[test]
    fn term_protocol_is_normalized_deduped_and_reused_by_later_blocks() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        let raw = serde_json::json!({"id":"block-1","translation":"使用 <<<LINGOSTACK_PROTECTED_0>>>。","terms":[{"term":" Cargo   Test ","category":"technology","explanation":"命令"},{"term":"cargo test","category":"technology","explanation":"重复"}]}).to_string();
        module.save_block_translation(&doc.id, 0, &raw).unwrap();
        let next = module.next_pending_block(&doc.id).unwrap().unwrap();
        assert_eq!(next.source, "second");
    }
    #[test]
    fn successful_retranslation_promotes_atomically() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "old one <<<LINGOSTACK_PROTECTED_0>>>"),
            )
            .unwrap();
        module
            .save_block_translation(&doc.id, 1, &response("block-2", "old two"))
            .unwrap();
        module.finish_translation(&doc.id).unwrap();
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "new one <<<LINGOSTACK_PROTECTED_0>>>"),
            )
            .unwrap();
        assert!(module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap()
            .markdown
            .contains("old one"));
        module
            .save_block_translation(&doc.id, 1, &response("block-2", "new two"))
            .unwrap();
        module.finish_translation(&doc.id).unwrap();
        let output = module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap();
        assert!(output.markdown.contains("new one") && !output.markdown.contains("old one"));
    }
    #[test]
    fn failed_retranslation_retains_old_active_generation_and_new_progress() {
        let (_file, mut module) = module();
        let doc = imported(&mut module);
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "old <<<LINGOSTACK_PROTECTED_0>>>"),
            )
            .unwrap();
        module
            .save_block_translation(&doc.id, 1, &response("block-2", "old second"))
            .unwrap();
        module.finish_translation(&doc.id).unwrap();
        module.begin_translation(&doc.id).unwrap();
        module
            .save_block_translation(
                &doc.id,
                0,
                &response("block-1", "new <<<LINGOSTACK_PROTECTED_0>>>"),
            )
            .unwrap();
        module.mark_block_failed(&doc.id, 1).unwrap();
        assert!(module
            .document_content(&doc.id, DocumentView::Translation)
            .unwrap()
            .markdown
            .contains("old second"));
        assert_eq!(
            module.next_pending_block(&doc.id).unwrap().unwrap().source,
            "second"
        );
    }
    #[test]
    fn v1_migration_preserves_visible_translation() {
        let file = tempfile::NamedTempFile::new().unwrap();
        {
            let conn = Connection::open(file.path()).unwrap();
            conn.execute_batch("CREATE TABLE documents (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE blocks (document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, source_text TEXT NOT NULL, PRIMARY KEY (document_id, ordinal)); CREATE TABLE block_results (document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, translation TEXT, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (document_id, ordinal)); CREATE TABLE terms (document_id TEXT NOT NULL, term TEXT NOT NULL, explanation TEXT NOT NULL, PRIMARY KEY (document_id, term)); INSERT INTO documents VALUES ('d', 'h', 'a.md', 'completed', 0); INSERT INTO blocks VALUES ('d', 0, 'source'); INSERT INTO block_results VALUES ('d', 0, 'legacy', 'succeeded'); PRAGMA user_version = 1;").unwrap();
        }
        let module = DocumentModule::open(file.path(), ParseLimits::default()).unwrap();
        assert!(module
            .document_content("d", DocumentView::Translation)
            .unwrap()
            .markdown
            .contains("legacy"));
    }
    #[test]
    fn v2_migration_defaults_existing_records_to_paragraph_markdown() {
        let file = tempfile::NamedTempFile::new().unwrap();
        {
            let conn = Connection::open(file.path()).unwrap();
            conn.execute_batch("CREATE TABLE documents (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, active_generation_id TEXT, working_generation_id TEXT); CREATE TABLE blocks (document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, source_text TEXT NOT NULL, source_template TEXT NOT NULL, protected_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (document_id, ordinal)); CREATE TABLE generations (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE block_results (generation_id TEXT NOT NULL, ordinal INTEGER NOT NULL, translation TEXT, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (generation_id, ordinal)); CREATE TABLE terms (generation_id TEXT NOT NULL, normalized_term TEXT NOT NULL, term TEXT NOT NULL, category TEXT NOT NULL, explanation TEXT NOT NULL, PRIMARY KEY (generation_id, normalized_term)); INSERT INTO documents VALUES ('d', 'h', 'a.md', 'completed', 0, 'g', NULL); INSERT INTO generations VALUES ('g', 'd', 'completed', 0); INSERT INTO blocks VALUES ('d', 0, 'legacy source', 'legacy source', '[]'); INSERT INTO block_results VALUES ('g', 0, 'legacy translation', 'succeeded'); PRAGMA user_version = 2;").unwrap();
        }
        let module = DocumentModule::open(file.path(), ParseLimits::default()).unwrap();
        assert_eq!(
            module
                .document_content("d", DocumentView::Source)
                .unwrap()
                .markdown,
            "legacy source"
        );
        assert_eq!(
            module
                .document_content("d", DocumentView::Translation)
                .unwrap()
                .markdown,
            "legacy translation"
        );
        assert_eq!(
            module
                .conn
                .query_row(
                    "SELECT markdown_kind FROM blocks WHERE document_id = 'd'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "paragraph"
        );
    }
    #[test]
    fn v4_failed_record_keeps_a_null_reason_for_the_localized_ui_fallback() {
        let file = tempfile::NamedTempFile::new().unwrap();
        {
            let conn = Connection::open(file.path()).unwrap();
            conn.execute_batch("CREATE TABLE documents (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, active_generation_id TEXT, working_generation_id TEXT); CREATE TABLE blocks (document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, source_text TEXT NOT NULL, source_template TEXT NOT NULL, protected_json TEXT NOT NULL DEFAULT '[]', markdown_kind TEXT NOT NULL DEFAULT 'paragraph', PRIMARY KEY (document_id, ordinal)); CREATE TABLE block_results (generation_id TEXT NOT NULL, ordinal INTEGER NOT NULL, translation TEXT, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY (generation_id, ordinal)); CREATE TABLE document_results (generation_id TEXT PRIMARY KEY, translation TEXT NOT NULL); INSERT INTO documents VALUES ('d', 'h', 'failed.md', 'failed', 0, NULL, NULL); INSERT INTO blocks VALUES ('d', 0, 'source', 'source', '[]', 'paragraph'); PRAGMA user_version = 4;").unwrap();
        }
        let module = DocumentModule::open(file.path(), ParseLimits::default()).unwrap();
        assert_eq!(
            module.snapshot_by_id("d").unwrap().unwrap().error_message,
            None
        );
    }
}
