import { create } from "zustand";
import type { DocumentSnapshot } from "@/lib/document-types";
import {
  cancelDocument,
  deleteDocument,
  importDocument,
  listDocuments,
  translateDocument,
} from "@/lib/ipc";
import { sortDocuments } from "@/lib/document-utils";

interface DocumentState {
  documents: DocumentSnapshot[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  importBytes: (fileName: string, content: Uint8Array) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  start: (id: string) => Promise<boolean>;
  cancel: (id: string) => Promise<void>;
  applyProgress: (document: DocumentSnapshot) => void;
  select: (id: string) => void;
  /** Clears an import error after the caller has presented its transient result. */
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  selectedId: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const documents = sortDocuments(await listDocuments());
      const current = get().selectedId;
      set({
        documents,
        selectedId:
          current && documents.some((document) => document.id === current)
            ? current
            : (documents[0]?.id ?? null),
      });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },
  importBytes: async (fileName, content) => {
    set({ loading: true, error: null });
    try {
      const outcome = await importDocument(fileName, content);
      if (outcome.type === "rejected") throw new Error(outcome.message);
      if (outcome.type === "imported") {
        try {
          await translateDocument(outcome.data.id);
        } catch {
          // The backend has persisted and broadcast the durable failure snapshot.
          // Refresh it rather than replacing the page-level reason with a toast.
          await get().load();
          set({ selectedId: outcome.data.id });
          return false;
        }
      }
      await get().load();
      set({ selectedId: outcome.data.id });
      return true;
    } catch (error) {
      set({ error: String(error) });
      // Keep an individual import failure observable to callers. In a batch,
      // other files must keep importing/translating rather than being coupled
      // to this file's outcome.
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  remove: async (id) => {
    await deleteDocument(id);
    set((state) => {
      const index = state.documents.findIndex((document) => document.id === id);
      const documents = state.documents.filter(
        (document) => document.id !== id,
      );
      return {
        documents,
        selectedId:
          state.selectedId === id
            ? (documents[index]?.id ?? documents[index - 1]?.id ?? null)
            : state.selectedId,
      };
    });
  },
  start: async (id) => {
    try {
      await translateDocument(id);
      return true;
    } catch {
      // Synchronous setup failures are persisted by Rust as a failed snapshot.
      await get().load();
      set({ selectedId: id });
      return false;
    }
  },
  cancel: async (id) => {
    await cancelDocument(id);
  },
  applyProgress: (document) =>
    set((state) => ({
      documents: sortDocuments(
        state.documents.map((item) =>
          item.id === document.id ? document : item,
        ),
      ),
    })),
  select: (selectedId) => set({ selectedId }),
  clearError: () => set({ error: null }),
}));
