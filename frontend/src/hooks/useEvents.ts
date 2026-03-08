import { useState, useEffect, useCallback } from 'react';
import { syncApi } from '../services/api';

export interface CalendarEvent {
  id: string;
  subject?: string;
  title?: string;
  start: string;
  end: string;
  isOnlineMeeting?: boolean;
  location?: string;
  organizer?: string;
  eventType?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UseEventsReturn {
  events: CalendarEvent[];
  pagination: Pagination | null;
  loading: boolean;
  error: string | null;
  refetch: (params?: Record<string, unknown>) => void;
}

export function useEvents(initialParams?: Record<string, unknown>): UseEventsReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback((params?: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    syncApi
      .getEvents(params)
      .then((res) => {
        const data = res.data;
        setEvents(data.events || data || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load events');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  return { events, pagination, loading, error, refetch: fetch };
}
