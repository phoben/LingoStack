import type { DocumentSnapshot, DocumentStatus } from "@/lib/document-types";

export type DocumentListFilter = "all" | "active" | "attention" | "completed";

const active = new Set<DocumentStatus>(["parsing", "translating", "pausing"]);
const attention = new Set<DocumentStatus>(["paused", "partial_failed", "unsupported", "failed"]);

export function matchesDocumentFilter(status: DocumentStatus, filter: DocumentListFilter) {
  return filter === "all" || (filter === "active" ? active.has(status) : filter === "attention" ? attention.has(status) : status === "completed");
}

/** Stable ordering avoids visual reshuffles as asynchronous progress arrives. */
export function sortDocuments(documents: DocumentSnapshot[]): DocumentSnapshot[] {
  return [...documents].sort((left, right) =>
    left.file_name.localeCompare(right.file_name) || left.id.localeCompare(right.id),
  );
}

export function missingBlockCount(document: Pick<DocumentSnapshot, "block_count" | "translated_count">) {
  return Math.max(0, document.block_count - document.translated_count);
}

export function formatByteLimit(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 ? 1 : 0)} MB` : `${bytes} B`;
}
