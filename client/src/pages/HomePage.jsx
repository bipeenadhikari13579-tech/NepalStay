import Navbar from '../components/Navbar.jsx'
import Hero from '../components/Hero.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function HomePage() {
  const { user } = useAuth()
  return (
    // Without the top bar (logged-out visitors) the hero fills the whole screen.
    <div className={user ? undefined : 'no-nav'}>
      <Navbar />
      <main>
        <Hero />
      </main>
    </div>
  )
}
