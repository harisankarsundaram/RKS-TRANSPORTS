import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card, { CardBody, CardFooter, CardHeader } from '../components/ui/Card'
import CountUp from '../components/ui/CountUp'
import ScrollReveal from '../components/ui/ScrollReveal'
import './Home.css'

const ADDRESS = {
  name: 'RKS TRANSPORTS',
  line1: '3/3/12D4, R.K.S Building, Barathi Nagar, Salem Main Road,',
  line2: 'Sankari, Salem - 637301',
}

function Home() {
  return (
    <div className="home-container">
      {/* Hero Section with Stats */}
      <section className="hero-section">
        <ScrollReveal animation="fade-in">
          <div className="container hero-content">
            <h1 className="hero-title">
              Logistics Managed<br />
              <span className="hero-highlight">Simply & Efficiently</span>
            </h1>
            <p className="hero-tagline">
              Connect your fleet and streamline operations with RKS Transports.
              The all-in-one platform for modern logistics.
            </p>
            <div className="hero-actions">
              <Button to="/dashboard" size="lg" variant="primary">
                Go to Dashboard
              </Button>
              <Button to="/contact" size="lg" variant="outline">
                Contact Us
              </Button>
            </div>
          </div>

          <div className="container stats-container">
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-number">
                  <CountUp end={60} suffix="+" />
                </span>
                <span className="stat-label">Active Vehicles</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">
                  <CountUp end={40} suffix="+" />
                </span>
                <span className="stat-label">Active Drivers</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">24/7</span>
                <span className="stat-label">Support Available</span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
      {/* add here */}


      {/* About / Info Section */}
      <section className="info-section" id="about">
        <ScrollReveal animation="fade-up">
          <div className="container info-grid">
            <div className="info-content">
              <h2 className="section-title">About RKS Transports</h2>
              <p>
                RKS Transports is a leading provider of transport and logistics services.
                We operate a robust fleet of trucks delivering goods safely and efficiently
                across the region.
              </p>
              <p>
                This digital platform serves as our internal command center, allowing our
                owners and drivers to coordinate seamlessly for superior service delivery.
              </p>
              <Button to="/about" variant="ghost" className="info-link">
                More about our services &rarr;
              </Button>
            </div>
            <div className="info-notice">
              <h2 className="section-title">Operational Portal</h2>
              <p>
                This system is exclusively for the management of RKS Transports assets and personnel.
                Unauthorized access is prohibited. Drivers and Admin staff please log in to continue.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Location / Map Section */}
      <section className="location-section container">
        <ScrollReveal animation="fade-up">
          <div className="location-grid">
            <div className="address-block">
              <h2 className="section-title">Visit Us</h2>
              <address>
                <strong>{ADDRESS.name}</strong><br />
                <span className="address-detail">{ADDRESS.line1}</span><br />
                <span className="address-detail">{ADDRESS.line2}</span>
              </address>
              <Button
                href="https://www.google.com/maps/search/Sankari+Salem+637301"
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                size="sm"
                className="mt-4"
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
    </div>
  )
}

export default Home
