import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import './Header.css'

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function toggleMenu() {
    setMenuOpen((prev) => !prev)
  }

  const navigate = useNavigate()

  const scrollToAbout = (e) => {
    e.preventDefault()
    if (location.pathname === '/') {
      const element = document.getElementById('about')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    } else {
      navigate('/#about')
      // Small timeout to allow nav, though hash nav usually works natively if element exists immediately
      setTimeout(() => {
        const element = document.getElementById('about')
        if (element) element.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
    setMenuOpen(false)
  }

  return (
    <header className={`header ${scrolled ? 'header-scrolled' : ''}`}>
      <div className="container header-inner">
        <Link to="/" className="header-brand">
          <span className="brand-text">RKS</span> <span className="brand-highlight">Transports</span>
        </Link>

        <button
          type="button"
          className={`header-toggle ${menuOpen ? 'is-active' : ''}`}
          onClick={toggleMenu}
          aria-expanded={menuOpen}
          aria-label="Toggle menu"
        >
          <span className="header-toggle-bar" />
          <span className="header-toggle-bar" />
          <span className="header-toggle-bar" />
        </button>

        <nav className={`header-nav ${menuOpen ? 'header-nav--open' : ''}`}>
          <div className="nav-list">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Home</NavLink>

            <a href="/#about" onClick={scrollToAbout} className="nav-link">About</a>
            <NavLink to="/contact" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Contact</NavLink>
            <NavLink to="/bookings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Book Truck</NavLink>
            <NavLink to="/dashboard" className="nav-cta">Dashboard</NavLink>
          </div>
        </nav>

        {/* Backdrop for mobile menu */}
        <div
          className={`header-backdrop ${menuOpen ? 'is-visible' : ''}`}
          onClick={() => setMenuOpen(false)}
        />
      </div>
    </header>
  )
}

export default Header
