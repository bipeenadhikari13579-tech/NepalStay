/**
 * Where a booking sits in time, from the traveler's point of view.
 * `today` is today's date in Nepal as YYYY-MM-DD (sent by the server).
 */
export function tripPhase(trip, today) {
  if (trip.status === 'cancelled' || trip.status === 'declined') return 'cancelled'
  if (trip.status === 'completed' || trip.checkOut < today) return 'past'
  if (trip.status === 'confirmed' && trip.checkIn <= today) return 'current'
  return 'upcoming'
}

export const TRIP_NOTE = {
  pending: 'Waiting for the host to confirm',
  confirmed: 'Confirmed by the host',
  declined: 'The host could not accept this request',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
