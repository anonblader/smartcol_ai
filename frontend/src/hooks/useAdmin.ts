import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../services/api';

export interface TeamMember {
  id: string;
  email: string;
  display_name: string;
  is_test_user: boolean;
  total_events: number;
  total_work_minutes: number;
  peak_daily_minutes: number;
  total_overtime_minutes: number;
  total_meeting_minutes: number;
  total_focus_minutes: number;
  active_risks: number;
  ongoing_risks: number;
}

export interface TeamRisk {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  is_test_user: boolean;
  risk_type_name: string;
  title: string;
  description: string;
  recommendation: string;
  severity: string;
  score: number;
  status: string;
  detected_date: string;
  acknowledged_at: string | null;
}

export function useTeamOverview() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    adminApi.getTeamOverview()
      .then((res) => { setMembers(res.data.users ?? []); setLoading(false); })
      .catch((err) => { setError(err.message || 'Failed'); setLoading(false); });
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { members, loading, error, refetch: fetch };
}

export function useTeamRisks() {
  const [active,   setActive]   = useState<TeamRisk[]>([]);
  const [ongoing,  setOngoing]  = useState<TeamRisk[]>([]);
  const [resolved, setResolved] = useState<TeamRisk[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    adminApi.getTeamRisks()
      .then((res) => {
        const all: TeamRisk[] = res.data.alerts ?? [];
        setActive(all.filter(a => a.status === 'active'));
        setOngoing(all.filter(a => a.status === 'acknowledged'));
        setResolved(all.filter(a => a.status === 'resolved'));
        setLoading(false);
      })
      .catch((err) => { setError(err.message || 'Failed'); setLoading(false); });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const acknowledge = useCallback(async (id: string) => {
    await adminApi.acknowledgeRisk(id);
    fetchAll();
  }, [fetchAll]);

  return { active, ongoing, resolved, loading, error, acknowledge, refetch: fetchAll };
}
