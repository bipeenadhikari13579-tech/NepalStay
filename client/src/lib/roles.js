/** Where a user lands after logging in. */
export function homeFor(user) {
  if (user?.role === 'admin') return '/admin'
  if (user?.role === 'host') return '/host'
  if (user?.role === 'traveler') return '/explore'
  return '/'
}

/** Name of that place, for links. null when nobody is logged in. */
export function deskLabel(user) {
  if (user?.role === 'admin') return 'Admin console'
  if (user?.role === 'host') return 'Host Desk'
  if (user?.role === 'traveler') return 'Explore stays'
  return null
}
