import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import type { TripSummary } from '../types/travel'
import { MapPinned, Plus, MapPin, Calendar, DollarSign, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<TripSummary[]>('/trips')
      .then((r) => setTrips(r.data))
      .catch(() => toast.error('Failed to load trips'))
      .finally(() => setLoading(false))
  }, [])

  const statusColor = (s: string) => ({
    Draft: 'bg-gray-100 text-gray-600',
    Confirmed: 'bg-blue-100 text-blue-700',
    InProgress: 'bg-green-100 text-green-700',
    Completed: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-red-100 text-red-600',
  }[s] ?? 'bg-gray-100 text-gray-600')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <img src="/logo.avif" alt="TravelEngine" className="h-8 w-8 rounded-full object-cover" />
          <span className="font-bold text-gray-800 text-lg">TravelEngine</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="text-sm text-gray-500 truncate max-w-[140px] sm:max-w-xs hidden sm:block">
            {user?.displayName ?? user?.email}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition shrink-0"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header row — stacks on very small screens */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">My Trips</h1>
            <p className="text-gray-500 text-sm mt-0.5">Plan your next adventure</p>
          </div>
          <Link
            to="/plan"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl px-4 sm:px-5 py-2.5 transition shrink-0 text-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Plan New Trip
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm animate-pulse h-40" aria-hidden="true" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4">
            <div className="bg-indigo-50 rounded-full p-6 mb-4" aria-hidden="true">
              <MapPinned className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No trips yet</h2>
            <p className="text-gray-400 mb-6 max-w-sm">Tell our planner where you want to go and we'll build your itinerary.</p>
            <Link
              to="/plan"
              className="bg-indigo-600 text-white rounded-xl px-6 py-3 font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition"
            >
              Plan Your First Trip
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {trips.map((trip) => (
              <Link
                key={trip.id}
                to={`/trips/${trip.id}`}
                className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md active:shadow-sm transition border border-gray-100 flex flex-col gap-3"
                aria-label={`View trip to ${trip.destination}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800 line-clamp-1 flex-1">{trip.title}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColor(trip.status)}`}>
                    {trip.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <MapPin className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{trip.destination}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
                  {trip.startDate} → {trip.endDate}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <DollarSign className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
                  Est. ${trip.estimatedCostUsd?.toFixed(0) ?? '—'} / Budget ${trip.budgetUsd.toFixed(0)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
