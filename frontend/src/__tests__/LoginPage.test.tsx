import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import LoginPage from '../pages/LoginPage'

const mockSignInWithEmail = vi.fn()
const mockSignInWithGoogle = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithEmail: mockSignInWithEmail,
    signInWithGoogle: mockSignInWithGoogle,
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../lib/firebase', () => ({ auth: {} }))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockSignInWithEmail.mockReset()
    mockSignInWithGoogle.mockReset()
    mockNavigate.mockReset()
  })

  it('renders the brand, email field, password field and submit button', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: /travelengine/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls signInWithEmail with entered credentials on submit', async () => {
    mockSignInWithEmail.mockResolvedValueOnce(undefined)
    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith('user@example.com', 'secret123')
    })
  })

  it('disables the submit button while loading', async () => {
    mockSignInWithEmail.mockImplementation(() => new Promise(() => {})) // never resolves
    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    })
  })

  it('has no critical accessibility violations', async () => {
    const { container } = renderLogin()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
