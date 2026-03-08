import { useState, useEffect, useCallback } from 'react';
import { risksApi } from '../services/api';

export interface RiskAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation?: string;
  score?: number;
  status?: string;
  acknowledgedAt?: string;
  detectedAt?: string;
  createdAt?: string;
}

interface UseRisksReturn {
  active: RiskAlert[];
  ongoing: RiskAlert[];
  history: RiskAlert[];
  loading: boolean;
  error: string | null;
  acknowledge: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  detect: () => Promise<void>;
  refetch: () => void;
}

export function useRisks(): UseRisksReturn {
  const [active, setActive] = useState<RiskAlert[]>([]);
  const [ongoing, setOngoing] = useState<RiskAlert[]>([]);
  const [history, setHistory] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      risksApi.getActive().catch(() => ({ data: [] })),
      risksApi.getOngoing().catch(() => ({ data: [] })),
      risksApi.getHistory().catch(() => ({ data: [] })),
    ])
      .then(([activeRes, ongoingRes, historyRes]) => {
        setActive(activeRes.data?.alerts || activeRes.data || []);
        setOngoing(ongoingRes.data?.alerts || ongoingRes.data || []);
        setHistory(historyRes.data?.alerts || historyRes.data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load risks');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const acknowledge = useCallback(
    async (id: string) => {
      await risksApi.acknowledge(id);
      fetchAll();
    },
    [fetchAll]
  );

  const dismiss = useCallback(
    async (id: string) => {
      await risksApi.dismiss(id);
      fetchAll();
    },
    [fetchAll]
  );

  const detect = useCallback(async () => {
    await risksApi.detect();
    fetchAll();
  }, [fetchAll]);

  return { active, ongoing, history, loading, error, acknowledge, dismiss, detect, refetch: fetchAll };
}
