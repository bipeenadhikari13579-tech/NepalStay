import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Search } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'
import { deskLabel, homeFor } from '../../lib/roles.js'
import './explore.css'

function readCurrency() {
  try {
    return localStorage.getItem('ns_currency') === 'USD' ? 'USD' : 'NPR'
  } catch {
    return 'NPR'
  }
}

/** Shell for the traveler pages: top bar, footer, and shared currency + saved-stays state. */
export default function ExploreLayout() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [currency, setCurrencyState] = useState(readCurrency)
  const [saved, setSaved] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!user) return
    api('/me/saved')
      .then((d) => setSaved(d.saved))
      .catch(() => {})
  }, [user])

  const setCurrency = useCallback((next) => {
    setCurrencyState(next)
    try {
      localStorage.setItem('ns_currency', next)
    } catch {
      // Private mode: the choice just will not be remembered.
    }
  }, [])

  const toggleSaved = useCallback(async (id) => {
    // Update the heart straight away, then confirm with the server.
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    try {
      setSaved((await api(`/me/saved/${id}`, { method: 'POST' })).saved)
    } catch {
      setSaved((await api('/me/saved').catch(() => ({ saved: [] }))).saved)
    }
  }, [])

  if (loading) return <div className="ex-loading">Loading…</div>
  if (!user) return <Navigate to="/auth" replace />

  function handleSearch(e) {
    e.preventDefault()
    navigate(`/explore?q=${encodeURIComponent(search.trim())}`)
  }

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="ex">
      <header className="ex-nav">
        <Link to="/explore" className="ex-nav__brand">
          <img src="/logo-mark.png" alt="" width="40" height="40" />
          <span>Nepal Stay</span>
        </Link>

        <form className="ex-nav__search" onSubmit={handleSearch} role="search">
          <input
            type="search"
            placeholder="Search any Himalayan valley"
            aria-label="Search stays"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" aria-label="Search">
            <Search size={15} />
          </button>
        </form>

        <nav className="ex-nav__links" aria-label="Sections">
          {user.role !== 'traveler' && <Link to={homeFor(user)}>{deskLabel(user)}</Link>}
          <Link to="/explore#destinations">Destinations</Link>
          <Link to="/trips">My trips</Link>
        </nav>

        <div className="ex-nav__right">
          <div className="ex-currency" role="group" aria-label="Currency">
            {['NPR', 'USD'].map((c) => (
              <button
                key={c}
                type="button"
                className={currency === c ? 'is-active' : ''}
                aria-pressed={currency === c}
                onClick={() => setCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="ex-avatar" title={`${user.name} · ${user.role}`}>
            {user.name.charAt(0).toUpperCase()}
          </span>
          <button type="button" className="ex-nav__logout" onClick={handleLogout} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <Outlet context={{ currency, saved, toggleSaved }} />

      <footer className="ex-footer">
        <p className="ex-footer__legal">© {new Date().getFullYear()} Nepal Stay</p>
      </footer>
    </div>
  )
}
