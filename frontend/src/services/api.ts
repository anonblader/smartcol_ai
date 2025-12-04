// src/services/api.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // Send cookies
});

// Add auth token interceptor
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response error handler
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API methods
export const analyticsApi = {
  getWeeklySummary: (weekStartDate: string) =>
    apiClient.get('/analytics/weekly-summary', { params: { weekStartDate } }),

  getTimeBreakdown: (startDate: string, endDate: string, groupBy: string) =>
    apiClient.get('/analytics/time-breakdown', {
      params: { startDate, endDate, groupBy }
    }),

  getHeatmap: (startDate: string, endDate: string) =>
    apiClient.get('/analytics/heatmap', { params: { startDate, endDate } }),

  getTrends: (startDate: string, endDate: string, granularity: string) =>
    apiClient.get('/analytics/trends', {
      params: { startDate, endDate, granularity }
    })
};

export const risksApi = {
  getActiveAlerts: () => apiClient.get('/risks/active'),

  acknowledgeAlert: (alertId: string) =>
    apiClient.post(`/risks/${alertId}/acknowledge`)
};

export const calendarApi = {
  syncCalendar: () => apiClient.post('/calendar/sync'),

  getEvents: (params: any) => apiClient.get('/calendar/events', { params })
};

export const authApi = {
  getConnectUrl: () => apiClient.get('/auth/connect'),

  getConnectionStatus: () => apiClient.get('/auth/status'),

  disconnect: () => apiClient.post('/auth/disconnect')
};