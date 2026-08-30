import { describe, expect, it } from "vitest";
import { formatByteLimit, matchesDocumentFilter, missingBlockCount, sortDocuments } from "./document-utils";

describe("document reader helpers", () => {
  it("sorts predictably with an id tie-breaker", () => {
    expect(sortDocuments([{ id: "b", file_name: "same.md", status: "paused", block_count: 1, translated_count: 0 }, { id: "a", file_name: "same.md", status: "completed", block_count: 1, translated_count: 1 }]).map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("groups statuses and reports the exact incomplete count", () => {
    expect(matchesDocumentFilter("partial_failed", "attention")).toBe(true);
    expect(missingBlockCount({ block_count: 8, translated_count: 5 })).toBe(3);
    expect(formatByteLimit(52_428_800)).toBe("50 MB");
  });
});
