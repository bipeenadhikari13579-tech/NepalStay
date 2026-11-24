import { ArrowRight, Home, Mountain, ShieldCheck, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'

const PERKS = [
  { icon: Home, label: 'Authentic Village Homestays', tone: 'warm' },
  { icon: ShieldCheck, label: 'Verified 100% Host Payout', tone: 'green' },
  { icon: Sun, label: 'Alpine Solar Warmth & Heaters', tone: 'sand' },
]

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero__bg" aria-hidden="true" />
      <div className="hero__shade" aria-hidden="true" />

      <div className="hero__center">
        <div className="hero__logo">
          <img src="/logo-full.png" alt="Nepal Stay" />
        </div>

        <span className="pill pill--tag">
          <Mountain size={15} className="c-warm" />
          The Sacred Homestay Collective
        </span>

        <h1>
          Where High Peaks Meet
          <span className="grad">Warm Hospitality</span>
        </h1>

        <p className="hero__lede">
          Handcrafted alpine lodges, heritage Newari courtyards, and warm hearthside
          homestays nestled across the timeless Himalayan valleys.
        </p>

        <ul className="hero__perks">
          {PERKS.map(({ icon: Icon, label, tone }) => (
            <li key={label} className="pill pill--perk">
              <Icon size={16} className={`c-${tone}`} />
              {label}
            </li>
          ))}
        </ul>

        <Link className="cta" to="/auth">
          <span>
            <strong>Get Started</strong>
            <small>Explore 250+ Himalayan Sanctuaries</small>
          </span>
          <i className="cta__arrow">
            <ArrowRight size={20} strokeWidth={2.4} />
          </i>
        </Link>
      </div>
    </section>
  )
}
