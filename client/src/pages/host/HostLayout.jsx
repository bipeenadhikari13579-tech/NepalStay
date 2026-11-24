import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Home,
  IdCard,
  LayoutGrid,
  LogOut,
  Menu,
  MessagesSquare,
  Tags,
  TicketCheck,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'
import '../admin/admin.css'

const NAV = [
  {
    group: 'Host Desk',
    items: [
      { to: '/host', end: true, icon: LayoutGrid, label: 'Overview' },
      { to: '/host/listings', icon: Home, label: 'My Listings' },
      { to: '/host/reservations', icon: TicketCheck, label: 'Reservations', badge: 'pendingBookings' },
      { to: '/host/messaging', icon: MessagesSquare, label: 'Guest Messaging', badge: 'unreadMessages' },
      { to: '/host/calendar', icon: CalendarDays, label: 'Calendar & Availability' },
      { to: '/host/pricing', icon: Tags, label: 'Pricing & Discounts' },
      { to: '/host/kyc', icon: IdCard, label: 'KYC Verification', dot: 'kycTodo' },
    ],
  },
]

const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.to, i.label])))

export default function HostLayout() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState({})
  const [copied, setCopied] = useState(false)

  const isHost = user?.role === 'host'
  const verified = summary.kycStatus === 'approved'
  // Not submitted yet, or rejected: the host has something to do.
  const kycTodo = summary.kycStatus === 'none' || summary.kycStatus === 'rejected'

  const refreshSummary = useCallback(() => {
    api('/host/summary')
      .then((d) => setSummary((s) => ({ ...s, ...d })))
      .catch(() => {})
    api('/messages/threads')
      .then((d) => setSummary((s) => ({ ...s, unreadMessages: d.unread })))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isHost) refreshSummary()
  }, [isHost, refreshSummary, location.pathname])

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [location.pathname])

  if (loading) return <div className="adm-loading">Loading…</div>
  if (!isHost) return <Navigate to="/auth" replace />

  const section =
    TITLES[location.pathname] ??
    (location.pathname.startsWith('/host/listings')
      ? 'My Listings'
      : location.pathname.startsWith('/host/reservations')
        ? 'Reservations'
        : 'Overview')

  async function copyHostId() {
    try {
      await navigator.clipboard.writeText(user.hostId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable: the ID is visible on screen anyway.
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="adm adm--host">
      <aside className={`adm-side ${open ? 'is-open' : ''}`}>
        <div className="adm-side__brand">
          <Link to="/" title="Back to the public site">
            <img src="/logo-mark.png" alt="" width="40" height="40" />
          </Link>
          <div>
            <strong>Nepal Stay</strong>
            <small>Host Desk</small>
          </div>
          <button type="button" className="adm-side__close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="adm-nav" aria-label="Host">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="adm-nav__group">{g.group}</p>
              {g.items.map(({ to, end, icon: Icon, label, badge, dot }) => (
                <NavLink key={to} to={to} end={end} className="adm-nav__link">
                  <Icon size={17} />
                  <span>{label}</span>
                  {badge && summary[badge] > 0 && <b className="adm-nav__badge">{summary[badge]}</b>}
                  {dot && kycTodo && <i className="adm-nav__dot" aria-label="Needs your attention" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="adm-side__hq">
          <div>
            <strong>Host Guild Partner</strong>
            <small>100% of stay fees go to you</small>
          </div>
        </div>
      </aside>
      {open && <div className="adm-scrim" onClick={() => setOpen(false)} />}

      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="adm-top__menu" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <p className="adm-top__crumb">
            <span>Host Desk</span>
            <ChevronRight size={14} />
            <strong>{section}</strong>
          </p>
          {user.hostId && (
            <button type="button" className="adm-hostid" onClick={copyHostId} title="Copy your Host ID">
              {user.hostId} {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          {verified && (
            <span className="adm-verified" title="Identity and business checked by Nepal Stay">
              <BadgeCheck size={14} /> Verified
            </span>
          )}
          <div className="adm-top__user">
            <div>
              <strong>{user.name}</strong>
              <small>Homestay Host</small>
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
