import { useState, useEffect, useCallback } from 'react';
import { analyticsApi } from '../services/api';

export interface WeekSummary {
  totalHours: number;
  workHours: number;
  overtimeHours: number;
  totalEvents: number;
  meetingCount: number;
  weekStart: string;
}

export interface BreakdownItem {
  taskTypeName: string;
  colorCode: string;
  totalHours: number;
  totalMinutes: number;
  eventCount: number;
  percentage: number;
}

export interface UpcomingEvent {
  subject: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location: string | null;
  task_type: string;
  color_code: string;
}

export interface DashboardData {
  currentWeek: WeekSummary | null;
  timeBreakdown: BreakdownItem[];
  upcomingEvents: UpcomingEvent[];
}

interface UseAnalyticsReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAnalytics(): UseAnalyticsReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    analyticsApi
      .getDashboard()
      .then((res) => {
        const raw = res.data;
        setData({
          currentWeek: raw.currentWeek ?? null,
          timeBreakdown: raw.timeBreakdown ?? [],
          upcomingEvents: raw.upcomingEvents ?? [],
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load dashboard data');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
