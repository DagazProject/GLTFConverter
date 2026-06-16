import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: boolean) => void
}

interface ConfirmState {
  pending: PendingConfirm | null
  ask: (options: ConfirmOptions) => Promise<boolean>
  resolve: (result: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => set({ pending: { ...options, resolve } })),
  resolve: (result) => {
    get().pending?.resolve(result)
    set({ pending: null })
  },
}))

/** Imperative helper usable outside React render. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().ask(options)
