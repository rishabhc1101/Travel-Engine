import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { PlanTripRequest } from '../types/travel'
import toast from 'react-hot-toast'
import { Loader2, Calendar, MapPin, Sparkles } from 'lucide-react'

const INTEREST_OPTIONS = ['Culture', 'Adventure', 'Food', 'Nature', 'History', 'Shopping', 'Nightlife', 'Wellness', 'Art', 'Sports']
const CONSTRAINT_OPTIONS = ['Vegetarian', 'Wheelchair accessible', 'Family-friendly', 'Pet-friendly', 'Budget hotels only', 'No flights', 'Avoid crowded places']

const today = new Date().toISOString().split('T')[0]

const POPULAR_DESTINATIONS = [
  'Tokyo, Japan', 'Kyoto, Japan', 'Osaka, Japan',
  'Paris, France', 'Nice, France',
  'New York, USA', 'Los Angeles, USA', 'Las Vegas, USA', 'San Francisco, USA',
  'London, UK', 'Edinburgh, UK',
  'Bali, Indonesia', 'Jakarta, Indonesia',
  'Rome, Italy', 'Florence, Italy', 'Venice, Italy', 'Milan, Italy',
  'Barcelona, Spain', 'Madrid, Spain',
  'Amsterdam, Netherlands', 'Singapore', 'Dubai, UAE',
  'Sydney, Australia', 'Melbourne, Australia',
  'Bangkok, Thailand', 'Phuket, Thailand', 'Chiang Mai, Thailand',
  'Istanbul, Turkey', 'Prague, Czech Republic', 'Vienna, Austria',
  'Santorini, Greece', 'Athens, Greece', 'Maldives',
  'Cape Town, South Africa', 'Marrakech, Morocco', 'Cairo, Egypt',
  'Mumbai, India', 'Delhi, India', 'Goa, India', 'Jaipur, India', 'Agra, India', 'Bangalore, India',
  'Seoul, South Korea', 'Hong Kong',
  'Zurich, Switzerland', 'Copenhagen, Denmark', 'Stockholm, Sweden',
  'Lisbon, Portugal', 'Dublin, Ireland', 'Budapest, Hungary',
  'Vancouver, Canada', 'Toronto, Canada',
  'Mexico City, Mexico', 'Buenos Aires, Argentina',
  'Queenstown, New Zealand', 'Reykjavik, Iceland',
]

const CURRENCIES = {
  USD: { symbol: '$',   rate: 1 },
  EUR: { symbol: '€',   rate: 0.92 },
  GBP: { symbol: '£',   rate: 0.79 },
  INR: { symbol: '₹',   rate: 83.5 },
  JPY: { symbol: '¥',   rate: 149 },
  AED: { symbol: 'AED', rate: 3.67 },
  CAD: { symbol: 'C$',  rate: 1.36 },
  AUD: { symbol: 'A$',  rate: 1.52 },
  SGD: { symbol: 'S$',  rate: 1.34 },
} as const
type CurrencyCode = keyof typeof CURRENCIES

export default function PlanTripPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [budgetFocused, setBudgetFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD')
  const [budgetRaw, setBudgetRaw] = useState('1000')
  const suggestRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<PlanTripRequest>({
    destination: '',
    startDate: '',
    endDate: '',
    budgetUsd: 1000,
    userPrompt: '',
    interests: [],
    constraints: [],
  })

  const filteredSuggestions = form.destination.length >= 2
    ? POPULAR_DESTINATIONS.filter((d) =>
        d.toLowerCase().includes(form.destination.toLowerCase())
      ).slice(0, 7)
    : []

  const toggleItem = (key: 'interests' | 'constraints', value: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }))
  }

  const handleCurrencyChange = (cur: CurrencyCode) => {
    setSelectedCurrency(cur)
    setBudgetRaw(Math.round(form.budgetUsd * CURRENCIES[cur].rate).toString())
  }

  const handleBudgetBlur = () => {
    setBudgetFocused(false)
    const rate = CURRENCIES[selectedCurrency].rate
    const inputVal = parseFloat(budgetRaw.replace(/,/g, '')) || 50
    const usdVal = Math.round(Math.min(10000, Math.max(50, inputVal / rate)))
    setForm((f) => ({ ...f, budgetUsd: usdVal }))
    setBudgetRaw(Math.round(usdVal * rate).toString())
  }

  const handleBudget = (val: number) => {
    const clamped = Math.min(10000, Math.max(50, val))
    setForm((f) => ({ ...f, budgetUsd: clamped }))
    setBudgetRaw(Math.round(clamped * CURRENCIES[selectedCurrency].rate).toString())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.destination.trim()) { toast.error('Destination is required'); return }
    if (form.startDate >= form.endDate) { toast.error('End date must be after start date'); return }
    if (form.budgetUsd < 50) { toast.error('Minimum budget is $50'); return }

    setLoading(true)
    try {
      const { data } = await api.post('/trips/plan', form)
      toast.success('Itinerary generated!')
      navigate(`/trips/${data.id}`)
    } catch (err: any) {
      toast.error(err?.response?.data ?? 'Failed to generate itinerary')
    } finally {
      setLoading(false)
    }
  }

  const budgetPct = ((form.budgetUsd - 50) / (10000 - 50)) * 100

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-6 transition-colors"
          aria-label="Back to dashboard"
        >
          ← Back to dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.avif" alt="TravelEngine" className="h-10 w-10 rounded-full object-cover shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">Plan Your Trip</h1>
              <p className="text-sm text-gray-500">Fill in the details and we'll build your itinerary</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Destination with suggestions */}
            <div>
              <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-1">
                Destination <span aria-hidden="true">*</span>
              </label>
              <div className="relative" ref={suggestRef}>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  id="destination"
                  type="text"
                  required
                  autoComplete="off"
                  value={form.destination}
                  onChange={(e) => { setForm({ ...form, destination: e.target.value }); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Tokyo, Japan or Bali, Indonesia"
                  className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                  aria-required="true"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {filteredSuggestions.map((dest) => (
                      <button
                        key={dest}
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 flex items-center gap-2.5 transition-colors"
                        onMouseDown={() => { setForm({ ...form, destination: dest }); setShowSuggestions(false) }}
                      >
                        <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
                        {dest}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dates — native date picker, stacks on small screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date <span aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    id="startDate"
                    type="date"
                    required
                    min={today}
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? '' : form.endDate })}
                    className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                    aria-required="true"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date <span aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
                  <input
                    id="endDate"
                    type="date"
                    required
                    min={form.startDate || today}
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                    aria-required="true"
                  />
                </div>
              </div>
            </div>

            {/* Budget — synced number input + slider with animated highlight */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Total Budget (USD) <span aria-hidden="true">*</span>
              </label>

              {/* Currency selector + free-type budget input */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <select
                  value={selectedCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                  className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white cursor-pointer"
                  aria-label="Select currency"
                >
                  {(Object.keys(CURRENCIES) as CurrencyCode[]).map((cur) => (
                    <option key={cur} value={cur}>{cur} {CURRENCIES[cur].symbol}</option>
                  ))}
                </select>
                <div
                  className={`flex items-center border-2 rounded-xl overflow-hidden transition-all duration-200 ${
                    budgetFocused
                      ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)] scale-[1.02]'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="pl-3 pr-1 text-gray-400 font-semibold select-none" aria-hidden="true">{CURRENCIES[selectedCurrency].symbol}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={budgetRaw}
                    onFocus={() => setBudgetFocused(true)}
                    onBlur={handleBudgetBlur}
                    onChange={(e) => setBudgetRaw(e.target.value)}
                    className="w-28 py-2.5 pr-3 text-lg font-bold text-indigo-600 focus:outline-none bg-transparent tabular-nums"
                    aria-label={`Budget in ${selectedCurrency}`}
                  />
                </div>
                <div className="flex-1 min-w-[80px]">
                  <div className="text-xs text-gray-400">
                    {form.budgetUsd <= 500 && 'Budget travel'}
                    {form.budgetUsd > 500 && form.budgetUsd <= 2500 && 'Mid-range'}
                    {form.budgetUsd > 2500 && form.budgetUsd <= 6000 && 'Comfortable'}
                    {form.budgetUsd > 6000 && '✨ Luxury'}
                  </div>
                  {selectedCurrency !== 'USD' && (
                    <div className="text-xs text-indigo-400 mt-0.5 font-medium">≈ ${form.budgetUsd} USD</div>
                  )}
                  {selectedCurrency === 'USD' && (
                    <div className="text-xs text-gray-300 mt-0.5">per entire trip</div>
                  )}
                </div>
              </div>

              {/* Slider with gradient fill */}
              <div className="relative">
                <input
                  type="range"
                  min={50}
                  max={10000}
                  step={50}
                  value={form.budgetUsd}
                  onChange={(e) => handleBudget(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #6366f1 ${budgetPct}%, #e5e7eb ${budgetPct}%)`
                  }}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:border-0"
                  aria-label="Budget slider"
                  aria-valuemin={50}
                  aria-valuemax={10000}
                  aria-valuenow={form.budgetUsd}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>$50</span>
                <span>$10,000</span>
              </div>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select interests">
                {INTEREST_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleItem('interests', opt)}
                    aria-pressed={form.interests.includes(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all active:scale-95 ${
                      form.interests.includes(opt)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Constraints */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Constraints / Preferences</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select constraints">
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleItem('constraints', opt)}
                    aria-pressed={form.constraints.includes(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all active:scale-95 ${
                      form.constraints.includes(opt)
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Natural language prompt */}
            <div>
              <label htmlFor="userPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                Tell us more <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="userPrompt"
                value={form.userPrompt}
                onChange={(e) => setForm({ ...form, userPrompt: e.target.value })}
                rows={3}
                placeholder="e.g. We're a couple celebrating our anniversary. We love hidden gems over tourist traps, and we enjoy local street food."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 transition disabled:opacity-50 text-sm"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Generating itinerary…</>
              ) : (
                <><Sparkles className="w-4 h-4" aria-hidden="true" /> Generate Itinerary</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
