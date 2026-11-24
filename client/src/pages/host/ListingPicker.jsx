import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api.js'

/**
 * Loads the listings the user can manage and keeps the chosen one in the URL (?listing=id),
 * so Calendar and Pricing open on the same listing.
 * Returns { listings, listingId, picker } where `picker` is the element to render.
 */
export function useListingPicker(scope) {
  const [params, setParams] = useSearchParams()
  const [listings, setListings] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/${scope}/listings`)
      .then((d) => setListings(d.listings))
      .catch((err) => setError(err.message))
  }, [scope])

  const wanted = params.get('listing')
  const listingId = listings?.some((l) => l._id === wanted) ? wanted : (listings?.[0]?._id ?? null)

  const picker = error ? (
    <p className="adm-error">{error}</p>
  ) : !listings ? (
    <p className="adm-muted">Loading listings…</p>
  ) : listings.length === 0 ? (
    <p className="adm-empty">
      There are no listings yet. <Link to={`/${scope}/listings/new`}>Add a listing</Link> first.
    </p>
  ) : (
    <label className="adm-picker">
      <span>Listing</span>
      <select
        value={listingId}
        onChange={(e) => {
          const next = new URLSearchParams(params)
          next.set('listing', e.target.value)
          setParams(next, { replace: true })
        }}
      >
        {listings.map((l) => (
          <option key={l._id} value={l._id}>
            {l.title} ({l.status === 'pending' ? 'in review' : l.status})
          </option>
        ))}
      </select>
    </label>
  )

  return { listings, listingId, picker }
}
