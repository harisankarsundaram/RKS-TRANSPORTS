const GpsModel = require('../models/gpsModel');
const TripModel = require('../models/tripModel');

// Haversine Formula for distance in KM
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

const GpsController = {
    // POST /api/gps-data
    async logGpsData(req, res, next) {
        try {
            const { truck_id, trip_id, latitude, longitude } = req.body;

            if (!truck_id || !trip_id || !latitude || !longitude) {
                return res.status(400).json({ success: false, message: 'Missing GPS data fields' });
            }

            // 1. Validate Trip Status
            const trip = await TripModel.getById(trip_id);
            if (!trip) {
                return res.status(404).json({ success: false, message: 'Trip not found' });
            }
            if (trip.status !== 'Running') {
                return res.status(400).json({ success: false, message: 'GPS data accepted only for Running trips' });
            }

            // 2. Calculate Distance from Last Point
            const lastPoint = await GpsModel.getLastLocation(trip_id);
            let distanceSegment = 0;

            if (lastPoint) {
                const rawDist = calculateDistance(
                    parseFloat(lastPoint.latitude), parseFloat(lastPoint.longitude),
                    parseFloat(latitude), parseFloat(longitude)
                );

                // CORRECTNESS FIX: GPS Jitter Filter
                // If distance is less than 50 meters (0.05 km), ignore it as noise/parking drift
                if (rawDist > 0.05) {
                    distanceSegment = rawDist;
                }
            }

            // 3. Log Data
            await GpsModel.logLocation({ truck_id, trip_id, latitude, longitude });

            // 4. Update Trip Distance (only if moved > 50m)
            if (distanceSegment > 0) {
                await TripModel.updateDistance(trip_id, distanceSegment);
            }

            res.json({
                success: true,
                message: 'GPS logged',
                added_distance: distanceSegment.toFixed(3) + ' km'
            });

        } catch (error) {
            next(error);
        }
    }
};

module.exports = GpsController;
