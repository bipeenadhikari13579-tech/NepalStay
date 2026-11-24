import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * A password input with an eye button that shows or hides what was typed.
 * Takes the same props as a normal <input>; `type` is managed here.
 */
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <input {...props} type={visible ? 'text' : 'password'} spellCheck={false} />
      <button
        type="button"
        className="input__eye"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </>
  )
}
