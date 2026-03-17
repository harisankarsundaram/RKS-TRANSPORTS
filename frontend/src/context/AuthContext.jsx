/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect } from 'react';
import apiClient from '../api/client';
import { setMicroserviceAuthToken } from '../api/microserviceClients';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

function getStoredAuth() {
    if (typeof window === 'undefined') {
        return { token: null, user: null };
    }

    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
        return { token: null, user: null };
    }

    try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.user_id && !parsedUser.id) {
            parsedUser.id = parsedUser.user_id;
        }

        return { token, user: parsedUser };
    } catch {
        return { token: null, user: null };
    }
}

export const AuthProvider = ({ children }) => {
    const [initialAuth] = useState(() => getStoredAuth());
    const [user, setUser] = useState(initialAuth.user);
    const [loading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (initialAuth.token) {
            apiClient.defaults.headers.common.Authorization = `Bearer ${initialAuth.token}`;
            setMicroserviceAuthToken(initialAuth.token);
        } else {
            delete apiClient.defaults.headers.common.Authorization;
            setMicroserviceAuthToken(null);
        }
    }, [initialAuth.token]);

    const login = async (email, password) => {
        try {
            const response = await apiClient.post('/auth/login', { email, password });

            if (response.data.success) {
                const { token, user } = response.data;
                const normalizedUser = user?.user_id && !user?.id
                    ? { ...user, id: user.user_id }
                    : user;

                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(normalizedUser));

                apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                setMicroserviceAuthToken(token);
                setUser(normalizedUser);
                return { success: true };
            }
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Login failed'
            };
        }
    };

    const register = async (userData) => {
        try {
            const response = await apiClient.post('/auth/register', userData);
            return { success: response.data.success, message: response.data.message };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete apiClient.defaults.headers.common['Authorization'];
        setMicroserviceAuthToken(null);
        setUser(null);
        navigate('/');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, register, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
