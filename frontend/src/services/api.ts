import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Auth API
export const authApi = {
  getStatus: () => apiClient.get('/auth/status'),
  getConnectUrl: () => apiClient.get('/auth/connect'),
  disconnect: () => apiClient.post('/auth/disconnect'),
};

// Sync API
export const syncApi = {
  clearData: ()     => apiClient.delete('/sync/clear-data'),
  mockSync: ()      => apiClient.post('/sync/mock'),
  lightMockSync: () => apiClient.post('/sync/light-mock'),
  heavyMockSync: () => apiClient.post('/sync/heavy-mock'),
  getEvents: (params?: Record<string, unknown>) =>
    apiClient.get('/sync/events', { params }),
  getSyncStatus: () => apiClient.get('/sync/status'),
};

// Analytics API
export const analyticsApi = {
  getDashboard: () => apiClient.get('/analytics/dashboard'),
  getDaily: (params?: Record<string, unknown>) =>
    apiClient.get('/analytics/daily', { params }),
  getWeekly: (params?: Record<string, unknown>) =>
    apiClient.get('/analytics/weekly', { params }),
  getTimeBreakdown: (params?: Record<string, unknown>) =>
    apiClient.get('/analytics/time-breakdown', { params }),
  getHeatmap: (params?: Record<string, unknown>) =>
    apiClient.get('/analytics/heatmap', { params }),
  compute: () => apiClient.post('/analytics/compute'),
};

// Off-Day Recommendation API
export const offdayApi = {
  generate:   (userId?: string) => apiClient.post('/offday/generate', {}, userId ? { params: { userId } } : undefined),
  getBalance: (userId?: string) => apiClient.get('/offday/balance', userId ? { params: { userId } } : undefined),
  getPending: (userId?: string) => apiClient.get('/offday/pending', userId ? { params: { userId } } : undefined),
  getAll:     (userId?: string) => apiClient.get('/offday/all',     userId ? { params: { userId } } : undefined),
  getTeam:    ()               => apiClient.get('/offday/team'),
  accept:     (id: string)     => apiClient.post(`/offday/${id}/accept`),
  reject:     (id: string)     => apiClient.post(`/offday/${id}/reject`),
};

// Test data API (admin only — manages test users)
export const testApi = {
  getTestUsers:      ()         => apiClient.get('/test/test-users'),
  seedFixedUsers:    ()         => apiClient.post('/test/seed-users'),
  addRandomUser:     ()         => apiClient.post('/test/add-random-user'),
  runPipelineAll:    ()         => apiClient.post('/test/run-pipeline-all'),
  runPipelineUser:   (id: string) => apiClient.post(`/test/run-pipeline/${id}`),
  addRandomEvents:   (id: string) => apiClient.post(`/test/add-random-events/${id}`),
  deleteUser:        (id: string) => apiClient.delete(`/test/users/${id}`),
  clearAllTestUsers: ()         => apiClient.delete('/test/clear-test-users'),
};

// Admin API (admin users only)
export const adminApi = {
  getTeamOverview: ()        => apiClient.get('/admin/team-overview'),
  getTeamRisks:   (status?: string) =>
    apiClient.get('/admin/team-risks', status ? { params: { status } } : undefined),
  acknowledgeRisk: (id: string) => apiClient.post(`/admin/risks/${id}/acknowledge`),
  // Reuse analytics endpoints with userId param for viewing any user
  getUserAnalytics: (userId: string) => apiClient.get('/analytics/dashboard', { params: { userId } }),
  getUserDaily:     (userId: string) => apiClient.get('/analytics/daily',      { params: { userId } }),
  getUserWeekly:    (userId: string) => apiClient.get('/analytics/weekly',     { params: { userId } }),
  getUserBreakdown: (userId: string) => apiClient.get('/analytics/time-breakdown', { params: { userId } }),
  getUserHeatmap:   (userId: string) => apiClient.get('/analytics/heatmap',   { params: { userId } }),
  getUsersList:     ()              => apiClient.get('/analytics/users-list'),
};

// ML Prediction API
export const mlApi = {
  predict:             ()                 => apiClient.post('/ml/predict'),
  getWorkloadForecast: (userId?: string)  => apiClient.get('/ml/workload-forecast', userId ? { params: { userId } } : undefined),
  getBurnoutScore:     (userId?: string)  => apiClient.get('/ml/burnout-score',     userId ? { params: { userId } } : undefined),
};

// Risks API
export const risksApi = {
  getActive: () => apiClient.get('/risks/active'),
  getOngoing: () => apiClient.get('/risks/ongoing'),
  getHistory: () => apiClient.get('/risks/history'),
  detect: () => apiClient.post('/risks/detect'),
  acknowledge: (id: string) => apiClient.post(`/risks/${id}/acknowledge`),
  dismiss: (id: string) => apiClient.post(`/risks/${id}/dismiss`),
};
