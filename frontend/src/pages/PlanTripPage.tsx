import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { PlanTripRequest } from '../types/travel'
import toast from 'react-hot-toast'
import { Plane, Loader2 } from 'lucide-react'

const INTEREST_OPTIONS = ['Culture', 'Adventure', 'Food', 'Nature', 'History', 'Shopping', 'Nightlife', 'Wellness', 'Art', 'Sports']
const CONSTRAINT_OPTIONS = ['Vegetarian', 'Wheelchair accessible', 'Family-friendly', 'Pet-friendly', 'Budget hotels only', 'No flights', 'Avoid crowded places']

export default function PlanTripPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-6">
          ← Back to dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 rounded-full p-2"><Plane className="text-white w-5 h-5" /></div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Plan Your Trip</h1>
              <p className="text-sm text-gray-500">Our AI will build a day-by-day itinerary</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Destination */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination *</label>
              <input type="text" required value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Tokyo, Japan or Kyoto temples circuit"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input type="date" required value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                <input type="date" required value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Budget (USD) *
                <span className="ml-2 text-indigo-600 font-semibold">${form.budgetUsd}</span>
              </label>
              <input type="range" min={50} max={10000} step={50} value={form.budgetUsd}
                onChange={(e) => setForm({ ...form, budgetUsd: Number(e.target.value) })}
                className="w-full accent-indigo-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>$50</span><span>$10,000</span>
              </div>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((opt) => (
                  <button key={opt} type="button" onClick={() => toggleItem('interests', opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${form.interests.includes(opt) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Constraints */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Constraints / Preferences</label>
              <div className="flex flex-wrap gap-2">
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <button key={opt} type="button" onClick={() => toggleItem('constraints', opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${form.constraints.includes(opt) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Natural language prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tell us more <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea value={form.userPrompt}
                onChange={(e) => setForm({ ...form, userPrompt: e.target.value })}
                rows={3}
                placeholder="e.g. We're a couple celebrating our anniversary. We love hidden gems over tourist traps, and we enjoy local street food."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3.5 transition disabled:opacity-50 text-sm">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating itinerary with AI…</>
              ) : (
                <><Plane className="w-4 h-4" /> Generate Itinerary</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
