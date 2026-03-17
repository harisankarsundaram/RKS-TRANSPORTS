import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AuthCards.css'

function OwnerAuth() {
  const [activeTab, setActiveTab] = useState('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [signupPhone, setSignupPhone] = useState('')

  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleLoginSubmit(e) {
    e.preventDefault()
    // No role passed, backend/context handles it
    const result = await login(loginEmail, loginPassword);
    if (result.success) {
      navigate('/dashboard'); // ProtectedRouteRedirect will handle destination
    } else {
      alert(result.message);
    }
  }

  async function handleSignupSubmit(e) {
    e.preventDefault()
    if (signupPassword !== signupConfirm) {
      alert('Passwords do not match.')
      return
    }

    // Default role is handled by backend now (always 'driver')
    const payload = {
      email: signupEmail,
      password: signupPassword,
      name: signupName,
      phone: signupPhone,
      role: 'driver'
    };
    // DEBUG: Alert payload to verify data
    // alert('Sending: ' + JSON.stringify(payload));

    const result = await register(payload);

    if (result.success) {
      alert('Registration successful! Please log in.');
      setActiveTab('login');
    } else {
      alert(result.message);
    }
  }

  return (
    <div className="auth-cards-page">
      <div className="auth-cards-heading">
        <h1>RKS Portal</h1>
        <p>Log in to manage operations or view assignments</p>
      </div>
      <div className="auth-card auth-card--owner">
        <div className="auth-card-tabs">
          <button
            type="button"
            className={`auth-card-tab ${activeTab === 'login' ? 'auth-card-tab--active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-card-tab ${activeTab === 'signup' ? 'auth-card-tab--active' : ''}`}
            onClick={() => setActiveTab('signup')}
          >
            Sign up
          </button>
        </div>
        <div className="auth-card-body">
          {activeTab === 'login' && (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block">Log in</button>
            </form>
          )}
          {activeTab === 'signup' && (
            <form className="auth-form" onSubmit={handleSignupSubmit}>
              <label>
                Full name
                <input
                  type="text"
                  name="name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </label>
              <label>
                Phone Number
                <input
                  type="tel"
                  name="phone"
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  name="confirmPassword"
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block">Create account</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default OwnerAuth
