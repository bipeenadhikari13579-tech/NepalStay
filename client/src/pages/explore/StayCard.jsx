import { Link } from 'react-router-dom'
import { BadgeCheck, Heart, Star } from 'lucide-react'
import { price } from '../../lib/format.js'

/** One stay in the grid: photo, heart, title, rating, place and nightly price. */
export default function StayCard({ stay, currency, saved, onToggleSaved }) {
  const main = price(stay, currency)
  const other = price(stay, currency === 'NPR' ? 'USD' : 'NPR')

  return (
    <article className="ex-card">
      <div className="ex-card__photo">
        <Link to={`/stays/${stay.id}`} aria-label={stay.title}>
          {stay.image ? <img src={stay.image} alt="" loading="lazy" /> : <span className="ex-card__nophoto" />}
        </Link>
        {stay.stayType && <span className="ex-card__badge">{stay.stayType}</span>}
        {stay.highlight && <span className="ex-card__chip">{stay.highlight}</span>}
        <button
          type="button"
          className={`ex-card__heart ${saved ? 'is-saved' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${stay.title} from saved` : `Save ${stay.title}`}
          onClick={() => onToggleSaved(stay.id)}
        >
          <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <Link to={`/stays/${stay.id}`} className="ex-card__body">
        <div className="ex-card__head">
          <h3>{stay.title}</h3>
          {stay.rating != null && (
            <span className="ex-card__rating">
              <Star size={12} fill="currentColor" /> {stay.rating.toFixed(2)} <small>({stay.reviewsCount})</small>
            </span>
          )}
        </div>
        <p>{[stay.location, stay.region].filter(Boolean).join(' • ')}</p>
        <p>
          Up to {stay.maxGuests} {stay.maxGuests === 1 ? 'guest' : 'guests'}
          {stay.hostName ? ` • Host: ${stay.hostName}` : ''}
          {stay.hostVerified && (
            <span className="ex-verified" title="Identity and business checked by Nepal Stay">
              <BadgeCheck size={12} /> Verified
            </span>
          )}
        </p>
        <p className="ex-card__price">
          <strong>{main}</strong> <small>{other} / night</small>
        </p>
      </Link>
    </article>
  )
}
