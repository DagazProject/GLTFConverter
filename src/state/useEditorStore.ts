import { create } from 'zustand'
import type { TransformMode } from '../engine/gizmos/TransformGizmo.ts'
import type { SubObjectMode } from '../engine/subobject/SubObjectMode.ts'
import type { NodeId } from '../domain/scene/ids.ts'
import type { RGB } from '../domain/math/types.ts'
import { rgb } from '../domain/math/types.ts'

export interface PaintSettings {
  active: boolean
  mode: 'paint' | 'erase'
  color: RGB
  radius: number
  strength: number
  hardness: number
}

interface EditorState {
  selectedId: NodeId | null
  transformMode: TransformMode
  /** Lock scale handles to uniform (proportional) scaling. */
  uniformScale: boolean
  subObjectMode: SubObjectMode
  status: string
  busy: boolean
  /** Vertex indices selected in the UV editor (driven by model clicks too). */
  uvSelection: number[]
  paint: PaintSettings

  select: (id: NodeId | null) => void
  setUvSelection: (indices: number[]) => void
  setPaint: (patch: Partial<PaintSettings>) => void
  setTransformMode: (mode: TransformMode) => void
  setUniformScale: (on: boolean) => void
  setSubObjectMode: (mode: SubObjectMode) => void
  setStatus: (status: string) => void
  setBusy: (busy: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedId: null,
  transformMode: 'translate',
  uniformScale: false,
  subObjectMode: 'object',
  status: '',
  busy: false,
  uvSelection: [],
  paint: { active: false, mode: 'paint', color: rgb(0.9, 0.2, 0.2), radius: 0.5, strength: 0.6, hardness: 0 },

  select: (id) => set({ selectedId: id }),
  setUvSelection: (uvSelection) => set({ uvSelection }),
  setPaint: (patch) => set((s) => ({ paint: { ...s.paint, ...patch } })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setUniformScale: (on) => set({ uniformScale: on }),
  setSubObjectMode: (mode) => set({ subObjectMode: mode }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
}))
