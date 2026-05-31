import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { auth } from '../lib/firebase'

export function useTripStream(tripId: string | undefined) {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!tripId) return

    const connect = async () => {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()

      // Pass token as query param for SSE (EventSource doesn't support headers)
      const url = `/api/trips/${tripId}/stream?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'weather-alert') {
            toast.custom((t) => (
              <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-amber-50 border border-amber-300 shadow-lg rounded-xl p-4 flex gap-3`}>
                <img src={data.icon} alt={data.condition} className="w-10 h-10" />
                <div>
                  <p className="font-semibold text-amber-800">Weather Alert — {data.destination}</p>
                  <p className="text-sm text-amber-700">{data.alertDescription}</p>
                </div>
              </div>
            ), { duration: 8000 })
          } else if (data.type === 'trip-update') {
            toast(data.message, { icon: '✈️' })
          }
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        es.close()
        // Reconnect after 5 seconds
        setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      esRef.current?.close()
    }
  }, [tripId])
}
