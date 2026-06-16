import { create } from 'zustand'

export type AppView = 'dashboard' | 'editor'

interface AppState {
  view: AppView
  setView: (view: AppView) => void
}

/** Top-level navigation between the projects dashboard and the editor. */
export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
}))
