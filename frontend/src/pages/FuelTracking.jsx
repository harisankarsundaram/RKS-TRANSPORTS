import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Dashboard.css';

function FuelTracking() {
    const { user } = useAuth();
    const [fuelLogs, setFuelLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [driverId, setDriverId] = useState(null);

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'driver' && user?.id) {
                try {
                    const res = await apiClient.get(`/drivers/user/${user.id}`);
                    const data = res.data;
                    if (data.success) {
                        setDriverId(data.data.driver_id);
                    }
                } catch (e) {
                    console.error('Error fetching driver profile:', e);
                }
            }
        };
        init();
    }, [user]);

    useEffect(() => {
        if (user?.role === 'driver' && !driverId) return;
        fetchFuelLogs();
    }, [driverId]);

    const fetchFuelLogs = async () => {
        setLoading(true);
        try {
            let url = '/fuel';
            if (user?.role === 'driver' && driverId) {
                url = `/fuel?driver_id=${driverId}`;
            }

            const res = await apiClient.get(url);
            const data = res.data;
            if (data.success) {
                setFuelLogs(data.data);
            }
        } catch (error) {
            console.error('Error fetching fuel logs:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fuel-tracking-page">
            <header className="dashboard-header">
                <h1>Fuel Tracking</h1>
                <p>Monitor fuel consumption and efficiency across your fleet.</p>
            </header>

            {loading ? (
                <div className="loading">Loading fuel data...</div>
            ) : (
                <div className="fuel-table-container" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #edf2f7', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Date</th>
                                <th style={{ padding: '1rem' }}>Lorry</th>
                                <th style={{ padding: '1rem' }}>LR Number</th>
                                <th style={{ padding: '1rem' }}>Liters</th>
                                <th style={{ padding: '1rem' }}>Price/L</th>
                                <th style={{ padding: '1rem' }}>Total Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fuelLogs.map(log => (
                                <tr key={log.fuel_id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                    <td style={{ padding: '1rem' }}>{new Date(log.created_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '1rem' }}>{log.truck_number}</td>
                                    <td style={{ padding: '1rem' }}>{log.lr_number}</td>
                                    <td style={{ padding: '1rem' }}>{log.liters} L</td>
                                    <td style={{ padding: '1rem' }}>₹{log.price_per_liter}</td>
                                    <td style={{ padding: '1rem' }}>₹{Number(log.total_cost).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {fuelLogs.length === 0 && <p style={{ textAlign: 'center', padding: '2rem' }}>No fuel logs found.</p>}
                </div>
            )}
        </div>
    );
}

export default FuelTracking;
