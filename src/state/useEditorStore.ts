import { create } from 'zustand'
import type { TransformMode } from '../engine/gizmos/TransformGizmo.ts'
import type { SubObjectMode } from '../engine/subobject/SubObjectMode.ts'
import type { NodeId } from '../domain/scene/ids.ts'

interface EditorState {
  selectedId: NodeId | null
  transformMode: TransformMode
  subObjectMode: SubObjectMode
  status: string
  busy: boolean
  /** Vertex indices selected in the UV editor (driven by model clicks too). */
  uvSelection: number[]

  select: (id: NodeId | null) => void
  setUvSelection: (indices: number[]) => void
  setTransformMode: (mode: TransformMode) => void
  setSubObjectMode: (mode: SubObjectMode) => void
  setStatus: (status: string) => void
  setBusy: (busy: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedId: null,
  transformMode: 'translate',
  subObjectMode: 'object',
  status: '',
  busy: false,
  uvSelection: [],

  select: (id) => set({ selectedId: id }),
  setUvSelection: (uvSelection) => set({ uvSelection }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setSubObjectMode: (mode) => set({ subObjectMode: mode }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),
}))
