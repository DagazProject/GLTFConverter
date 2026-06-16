import { create } from 'zustand'
import type { Engine } from '../engine/Engine.ts'

interface EngineState {
  engine: Engine | null
  setEngine: (engine: Engine | null) => void
}

/** Holds the live Engine instance so non-viewport panels can drive it. */
export const useEngineStore = create<EngineState>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
}))
