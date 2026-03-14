import { useMemo, useState } from 'react';
import { microserviceClients } from '../api/microserviceClients';
import './BookingPortal.css';

const initialState = {
    customer_name: '',
    contact_number: '',
    pickup_location: '',
    destination: '',
    load_type: '',
    weight: '',
    pickup_date: '',
    delivery_deadline: '',
    offered_price: ''
};

function BookingPortal() {
    const [formData, setFormData] = useState(initialState);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setMessage({ type: '', text: '' });

        try {
            await microserviceClients.booking.post('/bookings', {
                ...formData,
                weight: Number(formData.weight),
                offered_price: Number(formData.offered_price)
            });

            setMessage({
                type: 'success',
                text: 'Booking request submitted successfully. Our operations team will contact you shortly.'
            });
            setFormData(initialState);
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.response?.data?.message || 'Unable to submit booking request right now.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="booking-portal-page section">
            <div className="container booking-portal-wrap">
                <header className="booking-hero">
                    <p className="booking-eyebrow">Customer Truck Booking Portal</p>
                    <h1>Book The Right Truck In Minutes</h1>
                    <p>
                        Share pickup, destination, load details, and your offered freight price.
                        The dispatch team reviews requests in real-time and confirms schedules quickly.
                    </p>
                </header>

                <form className="booking-form" onSubmit={handleSubmit}>
                    <div className="booking-grid">
                        <div className="booking-field">
                            <label htmlFor="customer_name">Customer Name</label>
                            <input id="customer_name" name="customer_name" value={formData.customer_name} onChange={handleChange} required />
                        </div>

                        <div className="booking-field">
                            <label htmlFor="contact_number">Contact Number</label>
                            <input id="contact_number" name="contact_number" value={formData.contact_number} onChange={handleChange} required />
                        </div>

                        <div className="booking-field booking-field-wide">
                            <label htmlFor="pickup_location">Pickup Location</label>
                            <input id="pickup_location" name="pickup_location" value={formData.pickup_location} onChange={handleChange} required />
                        </div>

                        <div className="booking-field booking-field-wide">
                            <label htmlFor="destination">Destination</label>
                            <input id="destination" name="destination" value={formData.destination} onChange={handleChange} required />
                        </div>

                        <div className="booking-field">
                            <label htmlFor="load_type">Load Type</label>
                            <input id="load_type" name="load_type" value={formData.load_type} onChange={handleChange} required />
                        </div>

                        <div className="booking-field">
                            <label htmlFor="weight">Weight (tons)</label>
                            <input id="weight" name="weight" type="number" min="0.1" step="0.1" value={formData.weight} onChange={handleChange} required />
                        </div>

                        <div className="booking-field">
                            <label htmlFor="pickup_date">Pickup Date</label>
                            <input id="pickup_date" name="pickup_date" type="date" min={minDate} value={formData.pickup_date} onChange={handleChange} required />
                        </div>

                        <div className="booking-field">
                            <label htmlFor="delivery_deadline">Delivery Deadline</label>
                            <input id="delivery_deadline" name="delivery_deadline" type="date" min={minDate} value={formData.delivery_deadline} onChange={handleChange} required />
                        </div>

                        <div className="booking-field booking-field-wide">
                            <label htmlFor="offered_price">Offered Freight Price (INR)</label>
                            <input id="offered_price" name="offered_price" type="number" min="1" step="1" value={formData.offered_price} onChange={handleChange} required />
                        </div>
                    </div>

                    {message.text && (
                        <div className={`booking-message ${message.type}`}>
                            {message.text}
                        </div>
                    )}

                    <button type="submit" className="booking-submit" disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Submit Booking Request'}
                    </button>
                </form>
            </div>
        </section>
    );
}

export default BookingPortal;
