const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);

    // MySQL duplicate entry error
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry error',
            error: err.message
        });
    }

    // MySQL foreign key constraint error
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            success: false,
            message: 'Referenced record does not exist',
            error: err.message
        });
    }

    // MySQL connection error
    if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
            success: false,
            message: 'Database connection failed',
            error: 'Service temporarily unavailable'
        });
    }

    if (err.status && Number.isInteger(err.status)) {
        return res.status(err.status).json({
            success: false,
            message: err.message || 'Request failed'
        });
    }

    // Default server error
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
};

module.exports = errorHandler;
