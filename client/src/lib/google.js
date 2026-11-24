let loading = null

/** Loads Google's sign-in script once and resolves with the global `google` object. */
export function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve(window.google)
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load Google sign-in.'))
    }
    document.head.appendChild(script)
  })
  return loading
}
