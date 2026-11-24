import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the httpOnly cookie on first load.
  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (fields) => {
    // Admins get { code: 'ADMIN_CODE_REQUIRED', sentTo, delivery } instead of a user.
    const data = await api('/auth/login', { method: 'POST', body: fields })
    if (data.user) setUser(data.user)
    return data
  }, [])

  const requestReset = useCallback(
    (identifier) => api('/auth/forgot-password', { method: 'POST', body: { identifier } }),
    [],
  )

  const resetPassword = useCallback(async (fields) => {
    const data = await api('/auth/reset-password', { method: 'POST', body: fields })
    setUser(data.user)
    return data.user
  }, [])

  const googleLogin = useCallback(async (accessToken, role) => {
    const data = await api('/auth/google', { method: 'POST', body: { accessToken, role } })
    setUser(data.user)
    return data.user
  }, [])

  const adminVerify = useCallback(async (username, code) => {
    const data = await api('/auth/admin-verify', { method: 'POST', body: { username, code } })
    setUser(data.user)
    return data.user
  }, [])

  const signup = useCallback(async (fields) => {
    // Sign-up does not log in: it returns { needsVerification, email, delivery }.
    return api('/auth/signup', { method: 'POST', body: fields })
  }, [])

  const verifyEmail = useCallback(async (email, code) => {
    const data = await api('/auth/verify-email', { method: 'POST', body: { email, code } })
    setUser(data.user)
    return data.user
  }, [])

  const resendCode = useCallback(
    (email) => api('/auth/resend-code', { method: 'POST', body: { email } }),
    [],
  )

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      signup,
      verifyEmail,
      resendCode,
      adminVerify,
      googleLogin,
      requestReset,
      resetPassword,
      logout,
    }),
    [
      user,
      loading,
      login,
      signup,
      verifyEmail,
      resendCode,
      adminVerify,
      googleLogin,
      requestReset,
      resetPassword,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
