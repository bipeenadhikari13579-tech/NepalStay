/** Calls the Nepal Stay API. Throws an Error with .status, .code, .errors and .data on failure. */
export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      // A FormData body (file uploads) is sent as is; anything else as JSON.
      headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the Nepal Stay server. Check that it is running.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(
      data?.message ??
        (res.status >= 500
          ? 'Cannot reach the Nepal Stay server. Check that it is running.'
          : 'Request failed.'),
    )
    err.status = res.status
    err.errors = data?.errors
    err.code = data?.code
    err.data = data
    throw err
  }
  return data
}
