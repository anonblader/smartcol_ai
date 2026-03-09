import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Chip, LinearProgress,
  Tooltip,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon    from '@mui/icons-material/TrendingUp';
import TrendingDownIcon  from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon  from '@mui/icons-material/TrendingFlat';
import { mlApi } from '../../services/api';
import { format, parseISO } from 'date-fns';

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  none:     { color: '#10b981', bg: '#d1fae5', label: 'No Risk'  },
  low:      { color: '#3b82f6', bg: '#dbeafe', label: 'Low'      },
  medium:   { color: '#f59e0b', bg: '#fef3c7', label: 'Medium'   },
  high:     { color: '#ef4444', bg: '#fee2e2', label: 'High'     },
  critical: { color: '#7c3aed', bg: '#ede9fe', label: 'Critical' },
};

const TREND_ICON: Record<string, React.ReactNode> = {
  worsening: <TrendingUpIcon   sx={{ fontSize: 14, color: '#ef4444' }} />,
  stable:    <TrendingFlatIcon sx={{ fontSize: 14, color: '#6b7280' }} />,
  improving: <TrendingDownIcon sx={{ fontSize: 14, color: '#10b981' }} />,
};

interface Props {
  userId?: string;
}

export function BurnoutScoreCard({ userId }: Props) {
  const [scoreData, setScoreData] = useState<any | null>(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mlApi.getBurnoutScore(userId);
      setScoreData(res.data?.burnoutScore ?? null);
    } catch {
      setScoreData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120 }}>
        <CircularProgress size={28} sx={{ color: '#2563eb' }} />
      </Paper>
    );
  }

  if (!scoreData) {
    return (
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <LocalFireDepartmentIcon sx={{ color: '#6b7280' }} />
          <Typography variant="h6" fontWeight={600}>Burnout Risk Score</Typography>
        </Box>
        <Typography color="text.secondary" variant="body2">
          No score yet. Run a sync to generate your burnout risk assessment.
        </Typography>
      </Paper>
    );
  }

  const level   = scoreData.level ?? 'none';
  const score   = Number(scoreData.score ?? 0);
  const trend   = scoreData.trend ?? 'stable';
  const factors = Array.isArray(scoreData.contributing_factors)
    ? scoreData.contributing_factors as string[]
    : [];
  const summary = scoreData.metrics_summary ?? {};
  const conf    = Number(scoreData.confidence ?? 0);
  const cfg     = LEVEL_CONFIG[level] ?? LEVEL_CONFIG['none']!;

  const scoreDate = scoreData.score_date
    ? (() => { try { return format(parseISO(String(scoreData.score_date)), 'MMM d, yyyy'); } catch { return String(scoreData.score_date); } })()
    : null;

  // Bar colour transitions: 0=green → 50=amber → 100=red/purple
  const barColor = score < 30 ? '#10b981' : score < 55 ? '#f59e0b' : score < 75 ? '#ef4444' : '#7c3aed';

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: `1px solid ${cfg.color}30`, borderLeft: `4px solid ${cfg.color}` }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalFireDepartmentIcon sx={{ color: cfg.color }} />
          <Box>
            <Typography variant="h6" fontWeight={600}>Burnout Risk Score</Typography>
            <Typography variant="caption" color="text.secondary">
              ML model · GradientBoosting · {scoreDate ?? 'Today'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {TREND_ICON[trend]}
          <Typography variant="caption" color="text.secondary">{trend}</Typography>
        </Box>
      </Box>

      {/* Score number + bar */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
          <Typography variant="h3" fontWeight={800} sx={{ color: cfg.color, lineHeight: 1 }}>
            {score.toFixed(0)}
          </Typography>
          <Typography variant="body2" color="text.secondary">/100</Typography>
          <Chip
            label={cfg.label}
            size="small"
            sx={{ ml: 1, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 11 }}
          />
          <Tooltip title={`Model confidence: ${Math.round(conf * 100)}%`}>
            <Chip
              label={`${Math.round(conf * 100)}% conf`}
              size="small"
              sx={{ background: '#f1f5f9', color: '#64748b', fontSize: 10 }}
            />
          </Tooltip>
        </Box>
        <LinearProgress
          variant="determinate"
          value={score}
          sx={{
            height: 8,
            borderRadius: 4,
            background: '#e2e8f0',
            '& .MuiLinearProgress-bar': { background: barColor, borderRadius: 4 },
          }}
        />
      </Box>

      {/* Summary metrics */}
      {Object.keys(summary).length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          {[
            { label: 'Avg weekly',  value: summary.avg_weekly_hours != null   ? `${Number(summary.avg_weekly_hours).toFixed(1)}h`   : null },
            { label: 'Overtime',    value: summary.avg_overtime_hours != null ? `${Number(summary.avg_overtime_hours).toFixed(1)}h` : null },
            { label: 'Meetings',    value: summary.meeting_ratio != null      ? `${Math.round(Number(summary.meeting_ratio) * 100)}%` : null },
            { label: 'Focus',       value: summary.focus_ratio != null        ? `${Math.round(Number(summary.focus_ratio) * 100)}%` : null },
            { label: 'Hi-load wks', value: summary.high_load_weeks != null   ? `${summary.high_load_weeks} wks`                    : null },
          ]
            .filter((m) => m.value !== null)
            .map((m) => (
              <Box key={m.label} sx={{ textAlign: 'center', p: 0.75, background: '#f8fafc', borderRadius: 1, minWidth: 64 }}>
                <Typography variant="body2" fontWeight={700}>{m.value}</Typography>
                <Typography variant="caption" color="text.secondary">{m.label}</Typography>
              </Box>
            ))}
        </Box>
      )}

      {/* Contributing factors */}
      {factors.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Contributing factors
          </Typography>
          {factors.map((f, i) => (
            <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', pl: 1, '&::before': { content: '"·"', mr: 0.5 } }}>
              {f}
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  );
}
