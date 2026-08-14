/** Provider-neutral incremental parser for the translation/term text envelope. */

export const TERMS_SENTINEL = "<<<LINGOSTACK_TERMS_V1>>>";
const DELIMITER = `\n${TERMS_SENTINEL}\n`;

export type TranslationTermCategory = "technology" | "programming" | "product";

export interface TranslationTerm {
  term: string;
  category: TranslationTermCategory;
  explanation: string;
}

export interface EnvelopeResult {
  output: string;
  terms: TranslationTerm[];
  diagnostic: string | null;
}

function validateTerms(raw: unknown, source: string, translation: string): TranslationTerm[] | null {
  if (!Array.isArray(raw)) return null;
  const haystack = `${source}\n${translation}`.toLocaleLowerCase();
  const seen = new Set<string>();
  const terms: TranslationTerm[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { term, category, explanation } = item as Record<string, unknown>;
    if (
      typeof term !== "string" || !term.trim() ||
      typeof explanation !== "string" || !explanation.trim() ||
      (category !== "technology" && category !== "programming" && category !== "product")
    ) continue;
    const normalized = term.trim().toLocaleLowerCase();
    if (!haystack.includes(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push({ term: term.trim(), category, explanation: explanation.trim() });
    if (terms.length === 5) break;
  }
  return terms;
}

/**
 * Buffers only a possible delimiter suffix while streaming. This makes every
 * confirmed prose character visible immediately while protocol fragments never
 * enter the visible translation.
 */
export class TranslationEnvelopeParser {
  private prose = "";
  private candidate = "";
  private metadata = "";
  private inMetadata = false;

  push(delta: string): string {
    if (this.inMetadata) {
      this.metadata += delta;
      return this.prose;
    }
    for (const char of delta) {
      if (this.inMetadata) {
        this.metadata += char;
        continue;
      }
      this.candidate += char;
      while (!DELIMITER.startsWith(this.candidate)) {
        this.prose += this.candidate[0];
        this.candidate = this.candidate.slice(1);
      }
      if (this.candidate === DELIMITER) {
        this.inMetadata = true;
        this.candidate = "";
      }
    }
    return this.prose;
  }

  finish(source: string, discardPendingProtocol = false): EnvelopeResult {
    if (!this.inMetadata) {
      if (!discardPendingProtocol) this.prose += this.candidate;
      this.candidate = "";
      return { output: this.prose, terms: [], diagnostic: null };
    }
    try {
      const terms = validateTerms(JSON.parse(this.metadata), source, this.prose);
      if (terms === null) throw new Error("invalid terms");
      return { output: this.prose, terms, diagnostic: null };
    } catch {
      return { output: this.prose, terms: [], diagnostic: "术语元数据无效，已保留译文。" };
    }
  }
}
