import { Link } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Manage your fleet operations from here.</p>

      <div className="dashboard-cards">
        <Link to="/lorries" className="dashboard-card">
          <h2>Lorry Management</h2>
          <p>Add, view, and manage your fleet trucks.</p>
        </Link>
        <Link to="/drivers" className="dashboard-card">
          <h2>Driver Management</h2>
          <p>Register drivers and assign them to trips.</p>
        </Link>
        <Link to="/trips" className="dashboard-card">
          <h2>Trip Management</h2>
          <p>Create new trips, track running lorries, and manage history.</p>
        </Link>
        <Link to="/fuel" className="dashboard-card">
          <h2>Fuel & Reports</h2>
          <p>Log fuel entries, monitor efficiency, and view performance reports.</p>
        </Link>
      </div>
    </div>
  )
}

export default Dashboard
