import { create } from "zustand";

interface ContentBlockEditState {
  edits: Record<string, string>;
  setEdit: (key: string, value: string) => void;
  resetEdit: (key: string) => void;
}

export const useContentBlockEdits = create<ContentBlockEditState>()((set) => ({
  edits: {},
  setEdit: (key, value) => set((state) => ({ edits: { ...state.edits, [key]: value } })),
  resetEdit: (key) =>
    set((state) => {
      const { [key]: _removed, ...edits } = state.edits;
      return { edits };
    }),
}));
