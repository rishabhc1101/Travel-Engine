/**
 * Accessibility audit tests using jest-axe.
 * Each page component is rendered in isolation and checked for WCAG violations.
 */
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import LoginPage from '../pages/LoginPage'
import SignupPage from '../pages/SignupPage'
import DashboardPage from '../pages/DashboardPage'
import PlanTripPage from '../pages/PlanTripPage'

/* ── shared mocks ─────────────────────────────────────────────────────────── */
vi.mock('../lib/firebase', () => ({ auth: {} }))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Alice', email: 'alice@example.com' },
    loading: false,
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: { id: 'x' } })),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

/* ── helpers ──────────────────────────────────────────────────────────────── */
const wrap = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

/* ── tests ────────────────────────────────────────────────────────────────── */
describe('Accessibility audit (axe)', () => {
  it('LoginPage — no violations', async () => {
    const { container } = wrap(<LoginPage />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('SignupPage — no violations', async () => {
    const { container } = wrap(<SignupPage />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('DashboardPage (empty state) — no violations', async () => {
    const { container } = wrap(<DashboardPage />)
    await waitFor(() => {}) // flush async effects
    expect(await axe(container)).toHaveNoViolations()
  })

  it('PlanTripPage — no violations', async () => {
    const { container } = wrap(<PlanTripPage />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
