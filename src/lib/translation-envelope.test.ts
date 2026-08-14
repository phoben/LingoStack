import { describe, expect, it } from "vitest";
import { TERMS_SENTINEL, TranslationEnvelopeParser } from "./translation-envelope";

const source = "Copilot memory and Ollama in GitHub Copilot for JetBrains";
const body = "GitHub Copilot 中的 Copilot memory 与 Ollama";
const metadata = '[{"term":"GitHub Copilot","category":"product","explanation":"AI 编程助手"}]';

describe("TranslationEnvelopeParser", () => {
  it("hides arbitrarily split protocol fragments and publishes valid terms", () => {
    const parser = new TranslationEnvelopeParser();
    const envelope = `${body}\n${TERMS_SENTINEL}\n${metadata}`;
    for (const char of envelope) parser.push(char);
    expect(parser.finish(source)).toEqual({
      output: body,
      terms: [{ term: "GitHub Copilot", category: "product", explanation: "AI 编程助手" }],
      diagnostic: null,
    });
  });

  it("preserves normal translation when the sentinel is absent or metadata is broken", () => {
    const plain = new TranslationEnvelopeParser();
    plain.push(body);
    expect(plain.finish(source).output).toBe(body);
    const broken = new TranslationEnvelopeParser();
    broken.push(`${body}\n${TERMS_SENTINEL}\nnot-json`);
    expect(broken.finish(source)).toMatchObject({ output: body, terms: [] });
  });

  it("filters invalid and duplicate entries, then keeps at most five valid terms", () => {
    const parser = new TranslationEnvelopeParser();
    const extendedSource = `${source} with Rust, Tauri, and TypeScript`;
    parser.push(`${body}\n${TERMS_SENTINEL}\n${JSON.stringify([
      { term: "Copilot", category: "product", explanation: "one" },
      { term: "copilot", category: "product", explanation: "duplicate" },
      { term: "missing", category: "product", explanation: "not in context" },
      { term: "Ollama", category: "product", explanation: "two" },
      { term: "GitHub", category: "product", explanation: "three" },
      { term: "JetBrains", category: "product", explanation: "four" },
      { term: "Rust", category: "programming", explanation: "five" },
      { term: "Tauri", category: "technology", explanation: "six" },
      { term: "TypeScript", category: "wrong", explanation: "invalid category" },
    ])}`);
    expect(parser.finish(extendedSource).terms.map((term) => term.term)).toEqual([
      "Copilot",
      "Ollama",
      "GitHub",
      "JetBrains",
      "Rust",
    ]);
  });

  it("drops a partial protocol suffix when a stream fails", () => {
    const parser = new TranslationEnvelopeParser();
    parser.push(`${body}\n<<<LINGOSTACK_`);
    expect(parser.finish(source, true).output).toBe(body);
  });
});
