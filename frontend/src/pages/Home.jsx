import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import CountUp from '../components/ui/CountUp'
import ScrollReveal from '../components/ui/ScrollReveal'
import './Home.css'

const ADDRESS = {
  name: 'RKS TRANSPORTS',
  line1: '3/3/12D4, R.K.S Building, Barathi Nagar, Salem Main Road,',
  line2: 'Sankari, Salem - 637301',
}

const TRUST_METRICS = [
  { end: 1200, suffix: '+', label: 'Completed Deliveries' },
  { end: 60, suffix: '+', label: 'Fleet Strength' },
  { end: 24, suffix: '/7', label: 'Customer Support' },
]

const PORTAL_LINKS = [
  {
    audience: 'For Customers',
    title: 'Booking Portal',
    description: 'Create and monitor transport requests with clear trip and delivery visibility.',
    href: '/bookings',
    linkLabel: 'Create booking',
  },
  {
    audience: 'For Drivers',
    title: 'Driver Access',
    description: 'Open your assigned trip flow, notifications, and status updates in one place.',
    href: '/owner',
    linkLabel: 'Driver login',
  },
  {
    audience: 'For Business Team',
    title: 'Operations Dashboard',
    description: 'Access planning and operational controls for dispatch and daily movement.',
    href: '/dashboard',
    linkLabel: 'Open dashboard',
  },
]

const JOURNEY_STEPS = [
  'Raise a booking request with pickup and drop details.',
  'Get confirmation and follow your shipment with live status.',
  'Receive delivery closure updates with transparent communication.',
]

function Home() {
  return (
    <div className="home-container">
      <section className="home-hero">
        <div className="container hero-center">
          <ScrollReveal animation="fade-in">
            <div className="hero-only-content">
              <h1 className="hero-title hero-title-only">RKS TRANSPORT</h1>
              <div className="hero-actions hero-actions-centered">
                <Button to="/bookings" size="lg" variant="primary">
                  Book Transport
                </Button>
                <Button to="/owner" size="lg" variant="outline">
                  Driver Login
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="metrics-strip" aria-label="Key business metrics">
        <div className="container metrics-grid">
          {TRUST_METRICS.map((metric) => (
            <article key={metric.label} className="metric-item">
              <p className="metric-value">
                <CountUp end={metric.end} suffix={metric.suffix} />
              </p>
              <p className="metric-label">{metric.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="portal-section" id="about">
        <ScrollReveal animation="fade-up">
          <div className="container portal-grid">
            <div className="portal-copy">
              <p className="section-kicker">Portal Access</p>
              <h2>One RKS TRANSPORTS platform with role-specific entry points</h2>
              <p>
                Customers, drivers, and operations staff can access their flow without confusion.
              </p>

              <ul className="journey-list">
                {JOURNEY_STEPS.map((step) => (
                  <li key={step}>
                    <span className="journey-dot" aria-hidden="true" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="portal-links">
              {PORTAL_LINKS.map((portal) => (
                <article key={portal.title} className="portal-link-row">
                  <div>
                    <p className="portal-audience">{portal.audience}</p>
                    <h3>{portal.title}</h3>
                    <p>{portal.description}</p>
                  </div>

                  <Link to={portal.href} className="portal-link-cta">
                    {portal.linkLabel}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      <section className="location-section">
        <ScrollReveal animation="fade-up">
          <div className="container location-grid">
            <div className="address-block">
              <p className="section-kicker">Visit Headquarters</p>
              <h2>Visit RKS TRANSPORTS, Sankari</h2>
              <address>
                <strong>{ADDRESS.name}</strong><br />
                <span className="address-detail">{ADDRESS.line1}</span><br />
                <span className="address-detail">{ADDRESS.line2}</span>
              </address>

              <div className="address-points">
                <div className="address-point">
                  <span>Office Hours</span>
                  <strong>Mon-Sat, 8:00 AM to 8:00 PM</strong>
                </div>
                <div className="address-point">
                  <span>Operations Line</span>
                  <strong>+91 98765 43210</strong>
                </div>
              </div>

              <Button
                href="https://www.google.com/maps/search/Sankari+Salem+637301"
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                size="sm"
              >
                Open in Google Maps
              </Button>
            </div>

            <div className="map-wrapper">
              <iframe
                title="RKS Transports location - Sankari, Salem"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3910.017965287275!2d77.88364457478943!3d11.478628788716106!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba95e480c3d5139%3A0x27ee0f0f05489c40!2sRKS%20Transport!5e0!3m2!1sen!2sin!4v1769790705008!5m2!1sen!2sin"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </ScrollReveal>
      </section>

      <section className="cta-section">
        <div className="container cta-inner">
          <h2>Ready to schedule your next shipment with RKS TRANSPORTS?</h2>
          <p>
            Connect with RKS TRANSPORTS for dependable freight movement and professional support.
          </p>
          <div className="cta-actions">
            <Button to="/bookings" size="lg" variant="primary">
              Start Booking
            </Button>
            <Button to="/contact" size="lg" variant="outline">
              Contact Us
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
