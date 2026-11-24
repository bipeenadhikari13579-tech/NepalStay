import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import Overview from './pages/admin/Overview.jsx'
import Listings from './pages/admin/Listings.jsx'
import ListingForm from './pages/admin/ListingForm.jsx'
import Reservations from './pages/host/Reservations.jsx'
import AuditLog from './pages/admin/AuditLog.jsx'
import HostLayout from './pages/host/HostLayout.jsx'
import HostOverview from './pages/host/HostOverview.jsx'
import ExploreLayout from './pages/explore/ExploreLayout.jsx'
import ExplorePage from './pages/explore/ExplorePage.jsx'
import StayPage from './pages/explore/StayPage.jsx'
import TripsPage from './pages/explore/TripsPage.jsx'
import TripPage from './pages/explore/TripPage.jsx'
import ReservationPage from './pages/host/ReservationPage.jsx'
import InboxPage from './pages/host/InboxPage.jsx'
import CalendarPage from './pages/host/CalendarPage.jsx'
import KycList from './pages/admin/KycList.jsx'
import KycReview from './pages/admin/KycReview.jsx'
import KycPage from './pages/host/KycPage.jsx'
import PricingPage from './pages/host/PricingPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />

      {/* Traveler pages: ExploreLayout sends anyone who is not logged in to /auth. */}
      <Route element={<ExploreLayout />}>
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/stays/:id" element={<StayPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripPage />} />
      </Route>

      {/* Admin console: AdminLayout sends anyone who is not a System Admin to /auth. */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Overview />} />
        <Route path="verification" element={<Listings queue />} />
        {/* Opened from the Verification Queue to inspect a listing before approving it. */}
        <Route path="listings/:id" element={<ListingForm />} />
        <Route path="kyc" element={<KycList />} />
        <Route path="kyc/:id" element={<KycReview />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* Host Desk: HostLayout sends anyone who is not a host to /auth. */}
      <Route path="/host" element={<HostLayout />}>
        <Route index element={<HostOverview />} />
        <Route path="listings" element={<Listings scope="host" />} />
        <Route path="listings/new" element={<ListingForm key="new" scope="host" />} />
        <Route path="listings/:id" element={<ListingForm scope="host" />} />
        <Route path="reservations" element={<Reservations scope="host" />} />
        <Route path="reservations/:id" element={<ReservationPage scope="host" />} />
        <Route path="messaging" element={<InboxPage scope="host" />} />
        <Route path="calendar" element={<CalendarPage scope="host" />} />
        <Route path="pricing" element={<PricingPage scope="host" />} />
        <Route path="kyc" element={<KycPage />} />
        <Route path="*" element={<Navigate to="/host" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
