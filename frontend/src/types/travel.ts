export interface TripSummary {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  budgetUsd: number
  estimatedCostUsd: number
  status: string
  createdAt: string
}

export interface TripDetail extends TripSummary {
  latitude: number
  longitude: number
  days: ItineraryDay[]
}

export interface ItineraryDay {
  id: string
  dayNumber: number
  date: string
  theme: string | null
  summary: string | null
  estimatedDayCostUsd: number
  activities: Activity[]
}

export interface Activity {
  id: string
  orderIndex: number
  name: string
  description: string | null
  category: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  startTime: string | null
  endTime: string | null
  estimatedCostUsd: number
  googlePlaceId: string | null
  bookingUrl: string | null
  weatherNote: string | null
}

export interface PlanTripRequest {
  destination: string
  startDate: string
  endDate: string
  budgetUsd: number
  userPrompt: string
  interests: string[]
  constraints: string[]
}

export interface WeatherInfo {
  destination: string
  condition: string
  tempCelsius: number
  windKph: number
  icon: string
  hasAlert: boolean
  alertDescription: string | null
}
