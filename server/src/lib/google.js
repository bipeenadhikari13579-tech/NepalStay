// Verifies a Google access token obtained by the site's "Continue with Google" button
// and returns the Google account behind it.

export const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null

export class GoogleAuthError extends Error {}

async function getJson(url, init) {
  let res
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
  } catch {
    throw new GoogleAuthError('Could not reach Google. Please try again.')
  }
  if (!res.ok) throw new GoogleAuthError('Google sign-in was not accepted. Please try again.')
  return res.json()
}

/** Returns { googleId, email, name } or throws GoogleAuthError. */
export async function verifyGoogleToken(accessToken) {
  // 1. The token must have been issued to THIS site, not to some other app.
  const info = await getJson('https://oauth2.googleapis.com/tokeninfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken }),
  })
  if (info.aud !== googleClientId)
    throw new GoogleAuthError('Google sign-in was not accepted. Please try again.')

  // 2. Who is it?
  const profile = await getJson('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profile.sub || !profile.email || profile.email_verified !== true)
    throw new GoogleAuthError('Your Google account has no verified email address.')

  return {
    googleId: String(profile.sub),
    email: String(profile.email).toLowerCase(),
    name: String(profile.name || profile.email.split('@')[0]).slice(0, 80),
  }
}
