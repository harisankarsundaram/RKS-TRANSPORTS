const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const DriverModel = require('../models/driverModel'); // Assuming we might need this later

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_in_prod';

const AuthController = {
    // Register new user
    async register(req, res, next) {
        try {
            console.log('Register Body:', req.body);
            const { email, password, name, phone } = req.body;
            // Public registration is always for drivers
            const role = 'driver';

            // Validate input
            if (!email || !password || !name) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Check if user exists
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already registered'
                });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            // Create user
            const newUser = await UserModel.create({
                email,
                password_hash,
                role,
                name,
                phone
            });

            // Remove password from response
            delete newUser.password_hash;

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: newUser
            });

        } catch (error) {
            next(error);
        }
    },

    // Login user
    async login(req, res, next) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide email and password'
                });
            }

            // Find user
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Generate Token
            const token = jwt.sign(
                { id: user.user_id, role: user.role, name: user.name },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user.user_id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            next(error);
        }
    }
};

module.exports = AuthController;
