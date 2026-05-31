import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api'

const MAPS_LIBRARIES: Parameters<typeof useJsApiLoader>[0]['libraries'] = []
import api from '../lib/api'
import type { TripDetail, Activity, WeatherInfo } from '../types/travel'
import { useTripStream } from '../hooks/useTripStream'
import toast from 'react-hot-toast'
import {
  MapPin, Calendar, DollarSign, ChevronDown, ChevronUp,
  Clock, Tag, ExternalLink, ArrowLeft, CloudRain
} from 'lucide-react'

const DAY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍜', Sightseeing: '🏛️', Adventure: '🧗', Culture: '🎭',
  Shopping: '🛍️', Transport: '🚌', Accommodation: '🏨', Other: '📍',
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [weather, setWeather] = useState<WeatherInfo | null>(null)
  const [openDay, setOpenDay] = useState<number>(1)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 })
  const mapInstanceRef = useRef<google.maps.Map | null>(null)

  useTripStream(id)

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAPS_LIBRARIES,
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<TripDetail>(`/trips/${id}`),
      api.get<WeatherInfo>(`/trips/${id}/weather`).catch(() => ({ data: null })),
    ])
      .then(([tripRes, weatherRes]) => {
        setTrip(tripRes.data)
        setWeather(weatherRes.data)
        if (weatherRes.data?.hasAlert) {
          toast.custom((t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3 shadow-lg`}>
              <img src={weatherRes.data!.icon} className="w-10 h-10" alt="" />
              <div>
                <p className="font-semibold text-amber-800">Weather Alert</p>
                <p className="text-sm text-amber-700">{weatherRes.data!.alertDescription}</p>
              </div>
            </div>
          ), { duration: 8000 })
        }
      })
      .catch(() => toast.error('Failed to load trip'))
      .finally(() => setLoading(false))
  }, [id])

  // Geocode destination when maps are loaded and trip has no stored coordinates
  useEffect(() => {
    if (!mapsLoaded || !trip) return
    const allActs = trip.days.flatMap((d) => d.activities.filter((a) => a.latitude && a.longitude))
    if (trip.latitude && trip.longitude) {
      setMapCenter({ lat: trip.latitude, lng: trip.longitude })
    } else if (allActs.length > 0) {
      setMapCenter({ lat: allActs[0].latitude!, lng: allActs[0].longitude! })
    } else {
      // Geocode the destination name for a sensible map center
      const geocoder = new window.google.maps.Geocoder()
      geocoder.geocode({ address: trip.destination }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc = results[0].geometry.location
          const newCenter = { lat: loc.lat(), lng: loc.lng() }
          setMapCenter(newCenter)
          mapInstanceRef.current?.panTo(newCenter)
          mapInstanceRef.current?.setZoom(12)
        }
      })
    }
  }, [mapsLoaded, trip])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading trip…</div>
  if (!trip) return <div className="min-h-screen flex items-center justify-center text-red-400">Trip not found.</div>

  const routeForDay = (dayIdx: number) =>
    trip.days[dayIdx].activities
      .filter((a) => a.latitude && a.longitude)
      .map((a) => ({ lat: a.latitude!, lng: a.longitude! }))

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center gap-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-gray-700 transition mt-0.5 sm:mt-0 shrink-0"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-gray-800 line-clamp-1">{trip.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
              {trip.destination}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
              {trip.startDate} → {trip.endDate}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
              Est. ${trip.estimatedCostUsd.toFixed(0)} / ${trip.budgetUsd.toFixed(0)}
            </span>
          </div>
        </div>
        {weather && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 shrink-0">
            <img src={weather.icon} className="w-7 h-7 sm:w-8 sm:h-8" alt={weather.condition} />
            <div className="text-xs sm:text-sm">
              <p className="font-medium text-gray-700">{weather.tempCelsius.toFixed(1)}°C</p>
              <p className="text-gray-400 hidden sm:block">{weather.condition}</p>
            </div>
            {weather.hasAlert && <CloudRain className="w-4 h-4 text-amber-500 ml-1" aria-label="Weather alert" />}
          </div>
        )}
      </div>

      {/* On mobile: map on top (fixed height), itinerary below. On md+: side by side */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Map — on mobile shows first as a fixed-height strip */}
        <div className="h-56 sm:h-72 md:h-auto md:flex-1 relative order-first md:order-last">
          {mapsLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={12}
              options={{ disableDefaultUI: false, streetViewControl: false, mapTypeControl: false }}
              onLoad={(map) => { mapInstanceRef.current = map }}
            >
              {trip.days.map((day, dayIdx) => (
                <Polyline
                  key={day.id}
                  path={routeForDay(dayIdx)}
                  options={{ strokeColor: DAY_COLORS[dayIdx % DAY_COLORS.length], strokeWeight: 3, strokeOpacity: 0.7 }}
                />
              ))}
              {trip.days.map((day, dayIdx) =>
                day.activities.filter((a) => a.latitude && a.longitude).map((act) => (
                  <Marker
                    key={act.id}
                    position={{ lat: act.latitude!, lng: act.longitude! }}
                    onClick={() => setSelectedActivity(selectedActivity?.id === act.id ? null : act)}
                    label={{ text: String(act.orderIndex), color: '#fff', fontWeight: 'bold', fontSize: '11px' }}
                    icon={{
                      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                      fillColor: DAY_COLORS[dayIdx % DAY_COLORS.length],
                      fillOpacity: 1,
                      strokeWeight: 0,
                      scale: 1.6,
                      anchor: new window.google.maps.Point(12, 22),
                    }}
                  />
                ))
              )}
              {selectedActivity && selectedActivity.latitude && selectedActivity.longitude && (
                <InfoWindow
                  position={{ lat: selectedActivity.latitude, lng: selectedActivity.longitude }}
                  onCloseClick={() => setSelectedActivity(null)}
                >
                  <div className="max-w-[240px]">
                    <p className="font-bold text-sm">{selectedActivity.name}</p>
                    {selectedActivity.address && <p className="text-xs text-gray-500 mt-0.5">{selectedActivity.address}</p>}
                    {selectedActivity.description && <p className="text-xs text-gray-600 mt-1">{selectedActivity.description}</p>}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">Loading map…</div>
          )}
        </div>

        {/* Itinerary panel */}
        <div className="w-full md:w-96 shrink-0 overflow-y-auto bg-white border-t md:border-t-0 md:border-r border-gray-100 py-4 order-last md:order-first">
          {trip.days.map((day, dayIdx) => (
            <div key={day.id} className="border-b border-gray-100 last:border-0">
              <button
                onClick={() => setOpenDay(openDay === day.dayNumber ? 0 : day.dayNumber)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition text-left"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: DAY_COLORS[dayIdx % DAY_COLORS.length] }}
                >
                  {day.dayNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm line-clamp-1">{day.theme ?? `Day ${day.dayNumber}`}</p>
                  <p className="text-xs text-gray-400">{day.date} · ${day.estimatedDayCostUsd.toFixed(0)}</p>
                </div>
                {openDay === day.dayNumber ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {openDay === day.dayNumber && (
                <div className="px-5 pb-4 space-y-3">
                  {day.summary && <p className="text-sm text-gray-500 italic">{day.summary}</p>}
                  {day.activities.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => setSelectedActivity(selectedActivity?.id === act.id ? null : act)}
                      className={`rounded-xl p-3 cursor-pointer border transition ${selectedActivity?.id === act.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{CATEGORY_EMOJI[act.category ?? ''] ?? '📍'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm line-clamp-1">{act.name}</p>
                          {act.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-400">
                            {act.startTime && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{act.startTime}{act.endTime ? ` - ${act.endTime}` : ''}</span>}
                            <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" />${act.estimatedCostUsd.toFixed(0)}</span>
                            {act.category && <span className="flex items-center gap-0.5"><Tag className="w-3 h-3" />{act.category}</span>}
                          </div>
                          {act.weatherNote && <p className="text-xs text-amber-600 mt-1">☁️ {act.weatherNote}</p>}
                          {act.bookingUrl && (
                            <a href={act.bookingUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:underline mt-1">
                              Book <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
