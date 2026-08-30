export type DocumentStatus =
  | "parsing"
  | "translating"
  | "pausing"
  | "paused"
  | "partial_failed"
  | "completed"
  | "unsupported"
  | "failed";
/** User-facing continuous document views. Internal execution fragments never cross this boundary. */
export type DocumentView = "source" | "translation";

export interface DocumentSnapshot {
  id: string;
  file_name: string;
  status: DocumentStatus;
  block_count: number;
  translated_count: number;
  /** Present only for a durable failed/partial-failed translation. */
  error_message?: string;
}
export interface DocumentContent {
  markdown: string;
  complete: boolean;
  missing_parts: number;
}
/** Process-stable values derived from document-limit environment variables at app startup. */
export interface DocumentLimits {
  max_input_bytes: number;
  max_text_chars: number;
}
export type ImportOutcome =
  | { type: "imported"; data: DocumentSnapshot }
  | { type: "open_existing"; data: DocumentSnapshot }
  | { type: "rejected"; message: string };
