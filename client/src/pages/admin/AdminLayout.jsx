import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  ChevronRight,
  IdCard,
  LayoutGrid,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'
import './admin.css'

const NAV = [
  {
    group: 'Operations Core',
    items: [
      { to: '/admin', end: true, icon: LayoutGrid, label: 'Overview' },
      { to: '/admin/verification', icon: BadgeCheck, label: 'Verification Queue', badge: 'pendingListings' },
      { to: '/admin/kyc', icon: IdCard, label: 'KYC Verification', badge: 'pendingKyc' },
    ],
  },
  {
    group: 'System Governance',
    items: [{ to: '/admin/audit', icon: ShieldCheck, label: 'Audits & 2FA' }],
  },
]

const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.label])))

export default function AdminLayout() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState({})
  const [online, setOnline] = useState(true)

  const isAdmin = user?.role === 'admin'

  const refreshSummary = useCallback(() => {
    api('/admin/summary')
      .then((data) => {
        setSummary((s) => ({ ...s, ...data }))
        setOnline(true)
      })
      .catch((err) => setOnline(err.status !== undefined))
  }, [])

  useEffect(() => {
    if (isAdmin) refreshSummary()
  }, [isAdmin, refreshSummary, location.pathname])

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [location.pathname])

  if (loading) return <div className="adm-loading">Loading…</div>
  if (!isAdmin) return <Navigate to="/auth" replace />

  const section =
    TITLES[location.pathname] ??
    (location.pathname.startsWith('/admin/listings')
      ? 'Verification Queue'
      : location.pathname.startsWith('/admin/kyc')
        ? 'KYC Verification'
        : 'Command Center')

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="adm">
      <aside className={`adm-side ${open ? 'is-open' : ''}`}>
        <div className="adm-side__brand">
          <Link to="/" title="Back to the public site">
            <img src="/logo-mark.png" alt="" width="40" height="40" />
          </Link>
          <div>
            <strong>Nepal Stay</strong>
            <small>Admin Console</small>
          </div>
          <button type="button" className="adm-side__close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="adm-nav" aria-label="Admin">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="adm-nav__group">{g.group}</p>
              {g.items.map(({ to, end, icon: Icon, label, badge }) => (
                <NavLink key={to} to={to} end={end} className="adm-nav__link">
                  <Icon size={17} />
                  <span>{label}</span>
                  {badge && summary[badge] > 0 && <b className="adm-nav__badge">{summary[badge]}</b>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="adm-side__hq">
          <div>
            <strong>Kathmandu HQ</strong>
            <small>NPT: UTC+5:45</small>
          </div>
          <span className={online ? 'ok' : 'bad'}>
            <i /> {online ? 'Operational' : 'Offline'}
          </span>
        </div>
      </aside>
      {open && <div className="adm-scrim" onClick={() => setOpen(false)} />}

      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="adm-top__menu" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <p className="adm-top__crumb">
            <span>Admin Portal</span>
            <ChevronRight size={14} />
            <strong>{section === 'Overview' ? 'Command Center' : section}</strong>
          </p>
          <span className={`adm-top__status ${online ? '' : 'is-bad'}`}>
            <i /> {online ? 'Server online' : 'Server unreachable'}
          </span>
          <div className="adm-top__user">
            <div>
              <strong>{user.name}</strong>
              <small>Super Admin • KTM</small>
            </div>
            <span className="adm-avatar">{user.name.charAt(0).toUpperCase()}</span>
            <button type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="adm-content">
          <Outlet context={{ summary, refreshSummary }} />
        </main>
      </div>
    </div>
  )
}
