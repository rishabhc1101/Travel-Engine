import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import PlanTripPage from '../pages/PlanTripPage'

const mockNavigate = vi.fn()
const mockPost = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user1', displayName: 'Alice', email: 'alice@example.com' },
    loading: false,
  }),
}))

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: mockPost,
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../lib/firebase', () => ({ auth: {} }))

function renderPlanPage() {
  return render(
    <MemoryRouter>
      <PlanTripPage />
    </MemoryRouter>
  )
}

describe('PlanTripPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockPost.mockReset()
  })

  it('renders the page heading', () => {
    renderPlanPage()
    expect(screen.getByRole('heading', { name: /plan your trip/i })).toBeInTheDocument()
  })

  it('shows destination suggestions when user types 2+ characters', async () => {
    renderPlanPage()
    const destInput = screen.getByLabelText(/destination/i)
    await userEvent.type(destInput, 'To')
    await waitFor(() => {
      expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
    })
  })

  it('fills destination when a suggestion is clicked', async () => {
    renderPlanPage()
    const destInput = screen.getByLabelText(/destination/i)
    await userEvent.type(destInput, 'Par')
    const suggestion = await screen.findByText('Paris, France')
    fireEvent.mouseDown(suggestion)
    expect(destInput).toHaveValue('Paris, France')
  })

  it('allows typing a budget value freely without clamping mid-input', async () => {
    renderPlanPage()
    const budgetInput = screen.getByLabelText(/budget in USD/i)
    await userEvent.clear(budgetInput)
    await userEvent.type(budgetInput, '1500')
    // Mid-typing value should be "1500", not clamped to 50
    expect(budgetInput).toHaveValue('1500')
  })

  it('shows all currency options in the selector', () => {
    renderPlanPage()
    const select = screen.getByLabelText(/select currency/i)
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /INR/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /EUR/i })).toBeInTheDocument()
  })

  it('converts budget when currency is changed', async () => {
    renderPlanPage()
    const select = screen.getByLabelText(/select currency/i) as HTMLSelectElement
    const budgetInput = screen.getByLabelText(/budget in INR/i) as HTMLInputElement

    await userEvent.selectOptions(select, 'INR')
    // Default USD budget is 1000 × 83.5 = 83500
    expect(budgetInput.value).toBe('83500')
  })

  it('calls the API and navigates on successful submission', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'new-trip-id' } })
    renderPlanPage()

    await userEvent.type(screen.getByLabelText(/destination/i), 'Paris, France')
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-07-07' } })
    fireEvent.click(screen.getByRole('button', { name: /generate itinerary/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/trips/plan', expect.objectContaining({ destination: 'Paris, France' }))
      expect(mockNavigate).toHaveBeenCalledWith('/trips/new-trip-id')
    })
  })

  it('has no critical accessibility violations', async () => {
    const { container } = renderPlanPage()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
