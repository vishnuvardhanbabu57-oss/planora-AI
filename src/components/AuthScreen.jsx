import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './AuthScreen.css'

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        if (!data.session) {
          setMessage({
            type: 'success',
            text: 'Account created. Check your email to confirm your address, then log in.',
          })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Authentication failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setMessage(null)
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="auth-brand" href="/" aria-label="Planora AI home">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          <span>planora<span>ai</span></span>
        </a>

        <div className="auth-heading">
          <span className="auth-eyebrow">YOUR PERSONAL PLANNING SPACE</span>
          <h1 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p>{mode === 'signup' ? 'A calmer, clearer day starts here.' : 'Log in to pick up where you left off.'}</p>
        </div>

        <div className="auth-tabs" role="group" aria-label="Account options">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            className={mode === 'login' ? 'auth-tab auth-tab-active' : 'auth-tab'}
            onClick={() => changeMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            aria-pressed={mode === 'signup'}
            className={mode === 'signup' ? 'auth-tab auth-tab-active' : 'auth-tab'}
            onClick={() => changeMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="auth-field">
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {message && (
            <p className={`auth-message auth-message-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-footnote">Your account keeps your personal plans private.</p>
      </section>
      <p className="auth-copyright">Planora AI <span>·</span> A little progress, every day.</p>
    </main>
  )
}
