import { LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { deskLabel, homeFor } from '../lib/roles.js'

/**
 * Top bar of the opening page. It only holds the account controls, so it is shown
 * to logged-in visitors only; everyone else uses the Get Started button on the page.
 */
export default function Navbar() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <header className="nav">
      <div className="nav__account">
        {deskLabel(user) && (
          <Link to={homeFor(user)} className="nav__desk">
            {deskLabel(user)}
          </Link>
        )}
        <span className="nav__user" title={`${user.name} · ${user.role}`} aria-hidden="true">
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="nav__who">
          <strong>{user.name.split(' ')[0]}</strong>
          <small>{user.role}</small>
        </span>
        <button type="button" className="nav__logout" onClick={logout} aria-label="Log out" title="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )
}
