import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ipc", () => ({
  listDocuments: vi.fn().mockResolvedValue([]),
  importDocument: vi.fn(),
  deleteDocument: vi.fn(),
  translateDocument: vi.fn().mockResolvedValue(undefined),
  cancelDocument: vi.fn().mockResolvedValue(undefined),
}));

import {
  deleteDocument,
  importDocument,
  listDocuments,
  translateDocument,
} from "@/lib/ipc";

import { useDocumentStore } from "./document-store";

describe("document store progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      documents: [
        {
          id: "a",
          file_name: "a.md",
          status: "translating",
          block_count: 2,
          translated_count: 0,
        },
      ],
      selectedId: "a",
      loading: false,
      error: null,
    });
  });

  it("replaces a durable snapshot received after DocsView unmounts", () => {
    useDocumentStore.getState().applyProgress({
      id: "a",
      file_name: "a.md",
      status: "paused",
      block_count: 2,
      translated_count: 1,
    });
    expect(useDocumentStore.getState().documents[0]).toMatchObject({
      status: "paused",
      translated_count: 1,
    });
  });

  it("opens a duplicate record without starting a destructive retranslation", async () => {
    vi.mocked(importDocument).mockResolvedValueOnce({
      type: "open_existing",
      data: {
        id: "a",
        file_name: "a.md",
        status: "completed",
        block_count: 2,
        translated_count: 2,
      },
    });
    await useDocumentStore
      .getState()
      .importBytes("duplicate.md", new Uint8Array());
    expect(translateDocument).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().selectedId).toBe("a");
  });

  it("consumes the real tagged import payload instead of flattened snapshot fields", async () => {
    const ipcPayload = JSON.parse(
      '{"type":"imported","data":{"id":"new","file_name":"new.md","status":"paused","block_count":1,"translated_count":0}}',
    );
    vi.mocked(importDocument).mockResolvedValueOnce(ipcPayload);
    await useDocumentStore.getState().importBytes("new.md", new Uint8Array());
    expect(translateDocument).toHaveBeenCalledWith("new");
    expect(useDocumentStore.getState().selectedId).toBe("new");
  });

  it("surfaces a rejected file to a batch caller without starting a translation", async () => {
    vi.mocked(importDocument).mockResolvedValueOnce({
      type: "rejected",
      message: "unsupported file",
    });

    await expect(
      useDocumentStore
        .getState()
        .importBytes("unsupported.exe", new Uint8Array()),
    ).rejects.toThrow("unsupported file");

    expect(translateDocument).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().error).toContain("unsupported file");
    useDocumentStore.getState().clearError();
    expect(useDocumentStore.getState().error).toBeNull();
  });

  it("refreshes the durable failure snapshot when starting a retry fails synchronously", async () => {
    vi.mocked(translateDocument).mockRejectedValueOnce(
      new Error("provider is not configured"),
    );
    vi.mocked(listDocuments).mockResolvedValueOnce([
      {
        id: "a",
        file_name: "a.md",
        status: "failed",
        block_count: 2,
        translated_count: 0,
        error_message: "provider is not configured",
      },
    ]);

    await expect(useDocumentStore.getState().start("a")).resolves.toBe(false);
    expect(useDocumentStore.getState().documents[0]).toMatchObject({
      status: "failed",
      error_message: "provider is not configured",
    });
    expect(useDocumentStore.getState().error).toBeNull();
  });

  it("removes the persisted record immediately and selects a nearby remaining document", async () => {
    useDocumentStore.setState({
      documents: [
        {
          id: "a",
          file_name: "a.md",
          status: "completed",
          block_count: 1,
          translated_count: 1,
        },
        {
          id: "b",
          file_name: "b.md",
          status: "completed",
          block_count: 1,
          translated_count: 1,
        },
      ],
      selectedId: "a",
    });

    await useDocumentStore.getState().remove("a");

    expect(deleteDocument).toHaveBeenCalledWith("a");
    expect(useDocumentStore.getState()).toMatchObject({
      documents: [expect.objectContaining({ id: "b" })],
      selectedId: "b",
    });
  });
});
