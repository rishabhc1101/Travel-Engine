import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import DashboardPage from '../pages/DashboardPage'

const mockTrips = [
  {
    id: 'trip-1',
    destination: 'Tokyo, Japan',
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    budgetUsd: 2000,
    status: 'Confirmed',
    totalCostUsd: 1800,
    daysCount: 6,
  },
]

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user1', displayName: 'Alice', email: 'alice@example.com' },
    loading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../lib/firebase', () => ({ auth: {} }))

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the nav with brand name', () => {
    renderDashboard()
    expect(screen.getByText('TravelEngine')).toBeInTheDocument()
  })

  it('shows the empty-state message when there are no trips', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/no trips yet/i)).toBeInTheDocument()
    })
  })

  it('renders trip cards when trips are returned', async () => {
    const api = await import('../lib/api')
    ;(api.default.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockTrips })

    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
    })
  })

  it('shows the user display name in the nav', () => {
    renderDashboard()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('has no critical accessibility violations on empty state', async () => {
    const { container } = renderDashboard()
    await waitFor(() => screen.getByText(/no trips yet/i))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
