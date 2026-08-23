import { useEffect, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-ink-950/25"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-xl rounded-2xl bg-white p-8 shadow-panel"
      >
        <h2 id="confirm-dialog-title" className="font-display text-2xl font-bold text-ink-900">
          {title}
        </h2>
        {description ? <div className="mt-4 text-base leading-relaxed text-ink-600">{description}</div> : null}
        {error ? <p className="mt-4 text-sm text-rose-500">{error}</p> : null}
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" className="btn-ghost px-5 py-2.5" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Удаление…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
