import { useState } from 'react'
import Button from '../components/ui/Button'
import './Contact.css'
import './AuthCards.css' // Reuse auth styling

function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="auth-cards-page contact-page-wrapper">
      <div className="auth-cards-heading">
        <h1>Contact Us</h1>
        <p>We'd love to hear from you</p>
      </div>

      <div className="auth-card auth-card--driver"> {/* Reusing driver style (primary color) */}
        {!submitted ? (
          <div className="auth-card-body">
            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                Message
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="How can we help you?"
                  required
                  className="auth-input-textarea"
                />
              </label>
              <Button type="submit" variant="primary" className="btn-block">
                Send Message
              </Button>
            </form>
          </div>
        ) : (
          <div className="auth-card-body text-center">
            <div className="contact-success-message">
              <h3 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>Message Sent!</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Thank you for reaching out. We will get back to you shortly.
              </p>
              <Button onClick={() => setSubmitted(false)} variant="outline" className="btn-block">
                Send Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Contact
