import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Chip, Tooltip,
  Grid, Button,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import { format, parseISO } from 'date-fns';
import { mlApi } from '../../services/api';

const LOAD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  light:    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  moderate: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  high:     { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
};

const TREND_ICON: Record<string, React.ReactNode> = {
  increasing: <TrendingUpIcon   sx={{ fontSize: 14, color: '#ef4444' }} />,
  stable:     <TrendingFlatIcon sx={{ fontSize: 14, color: '#6b7280' }} />,
  decreasing: <TrendingDownIcon sx={{ fontSize: 14, color: '#10b981' }} />,
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface ForecastDay {
  predicted_date: string | Date;
  predicted_minutes: number;
  predicted_hours: number;
  confidence: number;
  load_level: string;
  trend: string;
}

interface Props {
  userId?: string;
}

export function WorkloadForecastCard({ userId }: Props) {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mlApi.getWorkloadForecast(userId);
      setForecast(res.data?.forecast ?? []);
    } catch {
      setForecast([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d: string | Date) => {
    try { return format(typeof d === 'string' ? parseISO(d) : d, 'EEE, MMM d'); }
    catch { return String(d); }
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>5-Day Workload Forecast</Typography>
          <Typography variant="caption" color="text.secondary">
            ML-predicted daily load · RandomForest model
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={load} sx={{ fontSize: 12 }}>Refresh</Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={28} sx={{ color: '#2563eb' }} />
        </Box>
      ) : forecast.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No forecast available. Run a sync to generate predictions.
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {forecast.map((day, idx) => {
            const colors = LOAD_COLORS[day.load_level] ?? LOAD_COLORS['moderate']!;
            return (
              <Grid item xs={12} sm={6} md key={idx}>
                <Tooltip title={`Confidence: ${Math.round((day.confidence ?? 0) * 100)}%`}>
                  <Box sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    textAlign: 'center',
                    cursor: 'default',
                  }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                      {fmtDate(day.predicted_date)}
                    </Typography>
                    <Typography variant="h6" fontWeight={700} sx={{ color: colors.text, lineHeight: 1.1 }}>
                      {(Number(day.predicted_hours) || 0).toFixed(1)}h
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.text, display: 'block', mb: 0.5 }}>
                      {Math.round(Number(day.predicted_minutes) || 0)} min
                    </Typography>
                    <Chip
                      label={day.load_level}
                      size="small"
                      sx={{ height: 18, fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.6)', color: colors.text }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, mt: 0.5 }}>
                      {TREND_ICON[day.trend] ?? TREND_ICON['stable']}
                      <Typography variant="caption" color="text.secondary">{day.trend}</Typography>
                    </Box>
                  </Box>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Paper>
  );
}
