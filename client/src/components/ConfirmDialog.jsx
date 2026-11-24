import { useCallback, useEffect, useRef, useState } from 'react'
import './confirm.css'

/**
 * An in-page "are you sure?" dialog. Used instead of window.confirm, which some
 * browsers and embedded views block, making the action silently do nothing.
 *
 *   const [ask, dialog] = useConfirm()
 *   if (!(await ask('Cancel this trip?', { confirmLabel: 'Yes, cancel trip' }))) return
 *   ...
 *   return <>{dialog} ...</>
 */
export function useConfirm() {
  const [state, setState] = useState(null) // { message, confirmLabel, cancelLabel, danger, resolve }
  const backRef = useRef(null)

  const ask = useCallback(
    (message, { confirmLabel = 'Confirm', cancelLabel = 'Go back', danger = true } = {}) =>
      new Promise((resolve) => setState({ message, confirmLabel, cancelLabel, danger, resolve })),
    [],
  )

  const close = useCallback(
    (answer) => {
      state?.resolve(answer)
      setState(null)
    },
    [state],
  )

  useEffect(() => {
    if (!state) return
    backRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  const dialog = state && (
    <div className="confirm" onClick={() => close(false)}>
      <div
        className="confirm__box"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-message">{state.message}</p>
        <div className="confirm__actions">
          <button type="button" ref={backRef} className="confirm__back" onClick={() => close(false)}>
            {state.cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm__ok ${state.danger ? 'is-danger' : ''}`}
            onClick={() => close(true)}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return [ask, dialog]
}
