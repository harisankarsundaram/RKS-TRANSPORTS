import { Link } from 'react-router-dom'
import './Footer.css'

function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand-col">
          <Link to="/" className="footer-logo">
            <span className="brand-text">RKS</span> <span className="brand-highlight">Transports</span>
          </Link>
          <p className="footer-tagline">
            Simplifying fleet and driver management for a more connected logistics future.
          </p>
          <address className="footer-address">
            3/3/12D4, R.K.S Building,<br />
            Barathi Nagar, Salem Main Road,<br />
            Sankari, Salem - 637301
          </address>
        </div>

        <div className="footer-links-group">
          <div className="footer-col">
            <h4 className="footer-col-title">Platform</h4>
            <Link to="/driver">For Drivers</Link>
            <Link to="/owner">For Owners</Link>
            <Link to="/dashboard">Dashboard</Link>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">Company</h4>
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/">Privacy Policy</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <p className="footer-copy">&copy; {currentYear} RKS Transports. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
