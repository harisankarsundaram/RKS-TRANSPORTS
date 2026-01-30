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
        <div className="dashboard-card disabled">
          <h2>Trip Management</h2>
          <p>Coming Soon</p>
        </div>
        <div className="dashboard-card disabled">
          <h2>Reports</h2>
          <p>Coming Soon</p>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
