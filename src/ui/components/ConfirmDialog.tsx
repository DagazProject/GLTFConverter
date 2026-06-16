import { useEffect } from 'react'
import { useConfirmStore } from '../../state/useConfirmStore.ts'

/** Modal rendered once at the app root; driven by useConfirmStore. */
export function ConfirmDialog() {
  const pending = useConfirmStore((s) => s.pending)
  const resolve = useConfirmStore((s) => s.resolve)

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(false)
      if (e.key === 'Enter') resolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, resolve])

  if (!pending) return null

  return (
    <div className="modal-backdrop" onClick={() => resolve(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{pending.title}</h2>
        {pending.message && <p>{pending.message}</p>}
        <div className="modal-actions">
          <button onClick={() => resolve(false)}>
            {pending.cancelLabel ?? 'Отмена'}
          </button>
          <button
            className={pending.danger ? 'danger' : 'primary'}
            onClick={() => resolve(true)}
          >
            {pending.confirmLabel ?? 'Да'}
          </button>
        </div>
      </div>
    </div>
  )
}
