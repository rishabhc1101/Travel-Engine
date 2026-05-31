import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { PlanTripRequest } from '../types/travel'
import toast from 'react-hot-toast'
import { Plane, Loader2, Calendar } from 'lucide-react'

const INTEREST_OPTIONS = ['Culture', 'Adventure', 'Food', 'Nature', 'History', 'Shopping', 'Nightlife', 'Wellness', 'Art', 'Sports']
const CONSTRAINT_OPTIONS = ['Vegetarian', 'Wheelchair accessible', 'Family-friendly', 'Pet-friendly', 'Budget hotels only', 'No flights', 'Avoid crowded places']

const today = new Date().toISOString().split('T')[0]

export default function PlanTripPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [budgetFocused, setBudgetFocused] = useState(false)
  const [form, setForm] = useState<PlanTripRequest>({
    destination: '',
    startDate: '',
    endDate: '',
    budgetUsd: 1000,
    userPrompt: '',
    interests: [],
    constraints: [],
  })

  const toggleItem = (key: 'interests' | 'constraints', value: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }))
  }

  const handleBudget = (val: number) => {
    const clamped = Math.min(10000, Math.max(50, val))
    setForm((f) => ({ ...f, budgetUsd: clamped }))
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
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-6 transition-colors"
          aria-label="Back to dashboard"
        >
          ← Back to dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 rounded-full p-2 shrink-0">
              <Plane className="text-white w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Plan Your Trip</h1>
              <p className="text-sm text-gray-500">Fill in the details and we'll build your itinerary</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Destination */}
            <div>
              <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-1">
                Destination <span aria-hidden="true">*</span>
              </label>
              <input
                id="destination"
                type="text"
                required
                autoComplete="off"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Tokyo, Japan or Kyoto temples circuit"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                aria-required="true"
              />
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

              {/* Animated number input */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`flex items-center border-2 rounded-xl overflow-hidden transition-all duration-200 ${
                    budgetFocused
                      ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)] scale-[1.02]'
                      : 'border-gray-200'
                  }`}
                >
                  <span className="pl-3 pr-1 text-gray-400 font-semibold select-none" aria-hidden="true">$</span>
                  <input
                    type="number"
                    min={50}
                    max={10000}
                    step={50}
                    value={form.budgetUsd}
                    onFocus={() => setBudgetFocused(true)}
                    onBlur={() => setBudgetFocused(false)}
                    onChange={(e) => handleBudget(Number(e.target.value))}
                    className="w-24 py-2.5 pr-3 text-lg font-bold text-indigo-600 focus:outline-none bg-transparent tabular-nums"
                    aria-label="Budget in USD"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400">
                    {form.budgetUsd <= 500 && 'Budget travel'}
                    {form.budgetUsd > 500 && form.budgetUsd <= 2500 && 'Mid-range'}
                    {form.budgetUsd > 2500 && form.budgetUsd <= 6000 && 'Comfortable'}
                    {form.budgetUsd > 6000 && 'Luxury'}
                  </div>
                  <div className="text-xs text-gray-300 mt-0.5">per entire trip</div>
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
                <><Plane className="w-4 h-4" aria-hidden="true" /> Generate Itinerary</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
