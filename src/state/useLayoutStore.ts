import { create } from 'zustand'

export type PanelId = 'scene' | 'inspector' | 'assets'
export type Side = 'left' | 'right'

interface LayoutState {
  order: Record<Side, PanelId[]>
  collapsed: Record<PanelId, boolean>
  hidden: Record<PanelId, boolean>

  move: (id: PanelId, side: Side, beforeId: PanelId | null) => void
  toggleCollapse: (id: PanelId) => void
  toggleHidden: (id: PanelId) => void
}

const without = (arr: PanelId[], id: PanelId) => arr.filter((x) => x !== id)

export const useLayoutStore = create<LayoutState>((set) => ({
  order: { left: ['scene'], right: ['inspector', 'assets'] },
  collapsed: { scene: false, inspector: false, assets: false },
  hidden: { scene: false, inspector: false, assets: false },

  move: (id, side, beforeId) =>
    set((s) => {
      const order: Record<Side, PanelId[]> = {
        left: without(s.order.left, id),
        right: without(s.order.right, id),
      }
      const target = order[side]
      const idx = beforeId ? target.indexOf(beforeId) : -1
      if (idx >= 0) target.splice(idx, 0, id)
      else target.push(id)
      return { order }
    }),

  toggleCollapse: (id) =>
    set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),

  toggleHidden: (id) =>
    set((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })),
}))
