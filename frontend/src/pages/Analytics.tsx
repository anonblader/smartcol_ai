import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Alert, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Grid, Tooltip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { analyticsApi, adminApi, offdayApi } from '../services/api';
import { WorkloadForecastCard } from '../components/dashboard/WorkloadForecastCard';
import { BurnoutScoreCard }     from '../components/dashboard/BurnoutScoreCard';
import { useAuth } from '../hooks/useAuth';
import { format, parseISO } from 'date-fns';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import { Tabs, Tab } from '@mui/material';

const PRIMARY = '#2563eb';
const BREAKDOWN_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#06b6d4'];

const minsToHrs = (m: number) => (Number(m) / 60).toFixed(1);

function getHeatColor(mins: number): string {
  const m = Number(mins);
  if (m === 0)  return '#e2e8f0';
  if (m <= 60)  return '#bfdbfe';
  if (m <= 180) return '#60a5fa';
  if (m <= 360) return '#2563eb';
  if (m <= 480) return '#f59e0b';
  return '#ef4444';
}

const HEAT_LEGEND = [
  { color: '#e2e8f0', label: 'No data' },
  { color: '#bfdbfe', label: '≤ 1h' },
  { color: '#60a5fa', label: '≤ 3h' },
  { color: '#2563eb', label: '≤ 6h' },
  { color: '#f59e0b', label: '≤ 8h' },
  { color: '#ef4444', label: '> 8h' },
];

function fmtDate(d: string) {
  try { return format(parseISO(d), 'EEE, MMM d'); } catch { return d; }
}

function HeatmapSquare({ mins, date }: { mins: number; date: string }) {
  const hrs = (Number(mins) / 60).toFixed(1);
  return (
    <Tooltip title={Number(mins) > 0 ? `${date}: ${hrs} hrs` : `${date}: No data`}>
      <Box sx={{ width: 22, height: 22, borderRadius: 0.5, background: getHeatColor(mins), cursor: 'default', '&:hover': { opacity: 0.8 } }} />
    </Tooltip>
  );
}

// ── Analytics content (shared by both roles, userId param controls whose data) ──

function AnalyticsContent({ userId, userName }: { userId?: string; userName?: string }) {
  const [daily,     setDaily]     = useState<any[]>([]);
  const [weekly,    setWeekly]    = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [heatmap,   setHeatmap]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const handleExport = async (fmt: 'csv' | 'pdf') => {
    try {
      const res = await analyticsApi.export(fmt, userId);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      // Use local time so the filename reflects the user's clock, not UTC
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      a.download = `smartcol-analytics-${ts}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent — server will respond with error JSON if needed */ }
  };

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = userId ? { params: { userId } } : undefined;

    Promise.all([
      analyticsApi.getDaily(params?.params)   .catch(() => ({ data: { daily: [] } })),
      analyticsApi.getWeekly({ ...(params?.params), weeks: 8 }).catch(() => ({ data: { weekly: [] } })),
      analyticsApi.getTimeBreakdown(params?.params).catch(() => ({ data: { breakdown: [] } })),
      analyticsApi.getHeatmap({ ...(params?.params), days: 30 }).catch(() => ({ data: { heatmap: [] } })),
    ]).then(([d, w, b, h]) => {
      setDaily(d.data?.daily ?? []);
      setWeekly(w.data?.weekly ?? []);
      setBreakdown(b.data?.breakdown ?? []);
      setHeatmap(h.data?.heatmap ?? []);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || 'Failed to load analytics');
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: PRIMARY }} /></Box>;
  if (error)   return <Alert severity="error" action={<Button onClick={fetchAll}>Retry</Button>}>{error}</Alert>;

  const noData = daily.length === 0 && weekly.length === 0;
  const chartData = breakdown.map((b: any) => ({
    name:  b.taskTypeName ?? 'Unknown',
    hours: parseFloat((b.totalHours ?? 0).toFixed(1)),
    color: b.colorCode || PRIMARY,
  }));

  return (
    <Box>
      {noData && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No analytics data for this user yet.
        </Alert>
      )}
      <Grid container spacing={3}>

        {/* Daily table */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>Daily Workload</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={fetchAll} sx={{ fontSize: 12 }}>Refresh</Button>
                <Tooltip title="Download CSV">
                  <Button size="small" variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    onClick={() => handleExport('csv')} sx={{ fontSize: 12 }}>
                    CSV
                  </Button>
                </Tooltip>
                <Tooltip title="Download PDF report">
                  <Button size="small" variant="contained" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    onClick={() => handleExport('pdf')}
                    sx={{ fontSize: 12, background: '#2563eb', '&:hover': { background: '#1d4ed8' } }}>
                    PDF
                  </Button>
                </Tooltip>
              </Box>
            </Box>
            {daily.length > 0 ? (
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Work (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Meetings (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Focus (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Overtime (hrs)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {daily.map((row: any, idx: number) => (
                      <TableRow key={idx} hover>
                        <TableCell>{fmtDate(row.date)}</TableCell>
                        <TableCell align="right">{minsToHrs(row.total_minutes)}</TableCell>
                        <TableCell align="right">{minsToHrs(row.work_minutes)}</TableCell>
                        <TableCell align="right">{minsToHrs(row.meeting_minutes)}</TableCell>
                        <TableCell align="right">{minsToHrs(row.focus_minutes)}</TableCell>
                        <TableCell align="right" sx={{ color: Number(row.overtime_minutes) > 0 ? '#ef4444' : 'inherit' }}>
                          {minsToHrs(row.overtime_minutes)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={row.has_high_workload ? 'High Load' : 'Normal'} size="small"
                            sx={{ background: row.has_high_workload ? '#fee2e2' : '#d1fae5', color: row.has_high_workload ? '#991b1b' : '#065f46', fontWeight: 600, fontSize: 11 }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : <Typography color="text.secondary">No daily data available</Typography>}
          </Paper>
        </Grid>

        {/* Weekly summary */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Weekly Summary</Typography>
            {weekly.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Week</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Work (hrs)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Overtime</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Events</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Meetings</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {weekly.map((row: any, idx: number) => (
                      <TableRow key={idx} hover>
                        <TableCell>
                          {row.week_start_date ? (() => { try { return format(parseISO(row.week_start_date), 'MMM d, yyyy'); } catch { return row.week_start_date; } })() : `Week ${idx + 1}`}
                        </TableCell>
                        <TableCell align="right">{minsToHrs(row.total_minutes)}</TableCell>
                        <TableCell align="right">{minsToHrs(row.work_minutes)}</TableCell>
                        <TableCell align="right" sx={{ color: Number(row.overtime_minutes) > 0 ? '#ef4444' : 'inherit' }}>
                          {minsToHrs(row.overtime_minutes)}
                        </TableCell>
                        <TableCell align="right">{row.total_events ?? 0}</TableCell>
                        <TableCell align="right">{row.meeting_count ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : <Typography color="text.secondary">No weekly data available</Typography>}
          </Paper>
        </Grid>

        {/* Breakdown chart */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Time Breakdown by Task Type</Typography>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit=" hrs" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <RechartsTooltip formatter={(val: number) => [`${val} hrs`, 'Hours']} />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.color || BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Typography color="text.secondary">No breakdown data available</Typography>}
          </Paper>
        </Grid>

        {/* Heatmap */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Workload Heatmap (Last 30 Days)</Typography>
            {heatmap.length > 0 ? (
              <Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {heatmap.map((day: any, idx: number) => (
                    <HeatmapSquare key={idx} mins={day.total_minutes ?? 0} date={day.date ?? `Day ${idx + 1}`} />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
                  {HEAT_LEGEND.map(({ color, label }) => (
                    <Box key={color} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 16, height: 16, borderRadius: 0.5, background: color, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : <Typography color="text.secondary">No heatmap data available</Typography>}
          </Paper>
        </Grid>

        {/* ML Predictions: Workload Forecast */}
        <Grid item xs={12}>
          <WorkloadForecastCard userId={userId} />
        </Grid>

        {/* ML Predictions: Burnout Risk Score */}
        <Grid item xs={12} lg={6}>
          <BurnoutScoreCard userId={userId} />
        </Grid>

        {/* Off-Day Recommendations */}
        <Grid item xs={12} lg={6}>
          <OffDaySection userId={userId} userName={userName} />
        </Grid>

      </Grid>
    </Box>
  );
}

// ── Off-Day Recommendations section ──────────────────────────────────────────

const SCORE_COLOR = (s: number) =>
  s >= 80 ? '#10b981' : s >= 60 ? '#3b82f6' : s >= 40 ? '#f59e0b' : '#94a3b8';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: '#dbeafe', color: '#1e40af', label: 'Pending' },
  accepted: { bg: '#d1fae5', color: '#065f46', label: '✅ Accepted' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: '❌ Declined' },
};

// ── Single recommendation card ────────────────────────────────────────────────

function RecCard({ r, showActions, onAccept, onReject }: {
  r: any;
  showActions: boolean;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const scoreColor  = SCORE_COLOR(r.priority_score);
  const statusStyle = STATUS_STYLE[r.status] ?? STATUS_STYLE['pending']!;
  const dateLabel   = (() => {
    try { return format(parseISO(r.recommended_date), 'EEEE, MMMM d, yyyy'); }
    catch { return r.recommended_date; }
  })();

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, borderLeft: `4px solid ${scoreColor}`, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {/* Score badge */}
      <Box sx={{ width: 44, height: 44, borderRadius: '50%', background: `${scoreColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: scoreColor, fontSize: 15 }}>{r.priority_score}</Typography>
      </Box>

      {/* Date + reason + metrics */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
          <Typography variant="subtitle2" fontWeight={700}>{dateLabel}</Typography>
          <Chip label={statusStyle.label} size="small"
            sx={{ height: 18, fontSize: 10, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{r.reason}</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {[
            { label: 'Work',             val: r.metrics?.work_minutes ? `${(r.metrics.work_minutes / 60).toFixed(1)}h` : '0h' },
            { label: 'Meetings',         val: r.meeting_count ?? 0 },
            { label: 'Deadlines nearby', val: r.deadline_count ?? 0 },
            { label: 'Days away',        val: r.days_in_future ?? '—' },
          ].map(m => (
            <Typography key={m.label} variant="caption" color="text.secondary">
              <strong>{m.val}</strong> {m.label}
            </Typography>
          ))}
        </Box>
      </Box>

      {/* Accept / Decline — personal view only */}
      {showActions && r.status === 'pending' && onAccept && onReject && (
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Tooltip title="Accept — mark this as your planned day off">
            <Button size="small" variant="contained" onClick={() => onAccept(r.id)}
              startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 11, py: 0.5, background: '#10b981', '&:hover': { background: '#059669' } }}>
              Accept
            </Button>
          </Tooltip>
          <Tooltip title="Decline this date">
            <Button size="small" variant="outlined" color="error" onClick={() => onReject(r.id)}
              startIcon={<CancelOutlinedIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 11, py: 0.5 }}>
              Decline
            </Button>
          </Tooltip>
        </Box>
      )}
    </Paper>
  );
}

// ── Main OffDaySection ────────────────────────────────────────────────────────

interface Balance { earned: number; used: number; available: number; overtimeDays: number; weekendDays: number; }

function OffDaySection({ userId, isAdminView = false, userName }: { userId?: string; isAdminView?: boolean; userName?: string }) {
  const [recs,        setRecs]        = useState<any[]>([]);
  const [balance,     setBalance]     = useState<Balance | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [showAll,     setShowAll]     = useState(false);
  const [activeTab,   setActiveTab]   = useState(0);

  const loadBalance = useCallback(async () => {
    if (isAdminView) return;
    try {
      const res = await offdayApi.getBalance(userId);
      setBalance(res.data.balance ?? null);
    } catch { /* silent */ }
  }, [userId, isAdminView]);

  const loadRecs = useCallback(async () => {
    setLoading(true);
    try {
      const res = isAdminView
        ? await offdayApi.getTeam()
        : showAll
          ? await offdayApi.getAll(userId)
          : await offdayApi.getPending(userId);
      setRecs(res.data.recommendations ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [userId, isAdminView, showAll]);

  useEffect(() => { loadBalance(); loadRecs(); }, [loadBalance, loadRecs]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await offdayApi.generate(userId);
      // Update balance from generate response if available
      if (res.data.balance) setBalance(res.data.balance);
      await loadRecs();
    }
    catch { /* silent */ }
    finally { setGenerating(false); }
  };

  // Group by user for admin view
  const grouped: Record<string, { name: string; email: string; isTest: boolean; recs: any[] }> = {};
  if (isAdminView) {
    for (const r of recs) {
      const key = r.user_id ?? r.user_name;
      if (!grouped[key]) {
        grouped[key] = { name: r.user_name, email: r.user_email, isTest: r.is_test_user, recs: [] };
      }
      grouped[key]!.recs.push(r);
    }
  }

  const userGroups = Object.entries(grouped);

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BeachAccessIcon sx={{ color: '#10b981' }} />
          <Typography variant="h6" fontWeight={600}>
            {isAdminView
              ? 'Team Off-Day Recommendations'
              : userName
                ? `Off-Day Recommendations — ${userName}`
                : 'Recommended Days Off'}
          </Typography>
          {recs.length > 0 && (
            <Chip label={isAdminView ? `${userGroups.length} members · ${recs.length} dates` : `${recs.length} dates`}
              size="small" sx={{ background: '#d1fae5', color: '#065f46', fontWeight: 600 }} />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {!isAdminView && (
            <Button size="small" variant="outlined" onClick={() => setShowAll(v => !v)} sx={{ fontSize: 12 }}>
              {showAll ? 'Pending only' : 'Show all'}
            </Button>
          )}
          {!isAdminView && (
            <Button size="small" variant="contained" onClick={handleGenerate} disabled={generating}
              startIcon={generating ? <CircularProgress size={12} color="inherit" /> : <BeachAccessIcon sx={{ fontSize: 14 }} />}
              sx={{ background: '#10b981', '&:hover': { background: '#059669' }, fontSize: 12 }}>
              {generating ? 'Analysing…' : 'Generate'}
            </Button>
          )}
          <Button size="small" variant="outlined" onClick={loadRecs} sx={{ fontSize: 12 }}>Refresh</Button>
        </Box>
      </Box>

      {!isAdminView && balance && (
        <Box sx={{ mb: 2, p: 2, borderRadius: 1.5, background: balance.available > 0 ? '#f0fdf4' : '#fff7ed', border: `1px solid ${balance.available > 0 ? '#bbf7d0' : '#fed7aa'}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Balance summary */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BeachAccessIcon sx={{ fontSize: 18, color: balance.available > 0 ? '#10b981' : '#f59e0b' }} />
              <Typography variant="body2" fontWeight={700} sx={{ color: balance.available > 0 ? '#065f46' : '#92400e' }}>
                {balance.available > 0
                  ? `${balance.available} off-day${balance.available > 1 ? 's' : ''} available`
                  : 'No off-days available'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip label={`${balance.earned} earned`} size="small" sx={{ height: 20, fontSize: 10, background: '#d1fae5', color: '#065f46' }} />
              <Chip label={`${balance.used} used`}    size="small" sx={{ height: 20, fontSize: 10, background: '#e0e7ff', color: '#3730a3' }} />
              {balance.overtimeDays > 0 && <Chip label={`${balance.overtimeDays} overtime day${balance.overtimeDays>1?'s':''}`} size="small" sx={{ height: 20, fontSize: 10, background: '#fef3c7', color: '#92400e' }} />}
              {balance.weekendDays  > 0 && <Chip label={`${balance.weekendDays} weekend day${balance.weekendDays>1?'s':''}`}   size="small" sx={{ height: 20, fontSize: 10, background: '#fee2e2', color: '#991b1b' }} />}
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {balance.available > 0
              ? `You can accept up to ${balance.available} recommended day${balance.available > 1 ? 's' : ''}. Earn more by working 12h+ on a weekday or any hours on a weekend.`
              : 'Work 12h+ on a weekday or any hours on a weekend to earn off-days.'}
          </Typography>
        </Box>
      )}

      {!isAdminView && !balance && (
        <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
          Based on your next 30 working days — higher score = better day to take off (lighter workload, fewer meetings &amp; deadlines nearby).
        </Alert>
      )}

      {isAdminView && (
        <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
          Showing pending off-day recommendations for each team member, grouped by engineer. Click <strong>Generate</strong> on individual members' Analytics to refresh their recommendations.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={28} sx={{ color: '#10b981' }} />
        </Box>
      ) : recs.length === 0 ? (
        <Alert severity={!isAdminView && balance?.available === 0 ? 'warning' : 'info'}>
          {!isAdminView && balance?.available === 0
            ? 'No off-days available yet. Work 12h+ on a weekday, or any hours on a weekend, to earn an off-day entitlement.'
            : isAdminView
              ? 'No team recommendations yet. Select a team member and click Generate in their Analytics view.'
              : 'No recommendations yet. Click Generate to analyse your upcoming calendar.'}
        </Alert>
      ) : isAdminView ? (
        /* ── Admin tabbed view — one tab per team member ── */
        userGroups.length === 0 ? null : (
          <Box>
            {/* Tab bar */}
            <Tabs
              value={Math.min(activeTab, userGroups.length - 1)}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: '1px solid #e2e8f0', mb: 2 }}
            >
              {userGroups.map(([key, group], idx) => {
                const initials    = group.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2);
                const avatarColor = group.isTest ? '#6b7280' : '#5b21b6';
                const topScore    = Math.max(...group.recs.map((r: any) => r.priority_score));

                return (
                  <Tab
                    key={key}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {/* Mini avatar */}
                        <Box sx={{ width: 22, height: 22, borderRadius: '50%', background: `${avatarColor}25`, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9, flexShrink: 0 }}>
                          {initials}
                        </Box>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{group.name.split(' ')[0]}</span>
                        {/* Top score badge */}
                        <Box sx={{ width: 20, height: 20, borderRadius: '50%', background: `${SCORE_COLOR(topScore)}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 700, color: SCORE_COLOR(topScore) }}>{topScore}</Typography>
                        </Box>
                      </Box>
                    }
                    sx={{ minHeight: 44, py: 0.75, px: 1.5, textTransform: 'none' }}
                  />
                );
              })}
            </Tabs>

            {/* Active tab content */}
            {(() => {
              const entry = userGroups[Math.min(activeTab, userGroups.length - 1)];
              if (!entry) return null;
              const [, group] = entry;
              const avatarColor = group.isTest ? '#6b7280' : '#5b21b6';
              const topScore    = Math.max(...group.recs.map((r: any) => r.priority_score));
              const avgScore    = Math.round(group.recs.reduce((s: number, r: any) => s + r.priority_score, 0) / group.recs.length);

              return (
                <Box>
                  {/* User info strip */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, p: 1.5, background: '#f8fafc', borderRadius: 1.5 }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: '50%', background: `${avatarColor}20`, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {group.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700}>{group.name}</Typography>
                        {group.isTest && <Chip label="Test User" size="small" sx={{ height: 16, fontSize: 9, background: '#f1f5f9', color: '#64748b' }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary">{group.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip label={`${group.recs.length} recommended`} size="small" sx={{ height: 20, fontSize: 10, background: '#dbeafe', color: '#1e40af' }} />
                      <Chip label={`Best: ${topScore}`} size="small" sx={{ height: 20, fontSize: 10, background: `${SCORE_COLOR(topScore)}20`, color: SCORE_COLOR(topScore), fontWeight: 700 }} />
                      <Chip label={`Avg: ${avgScore}`} size="small" sx={{ height: 20, fontSize: 10, background: '#f1f5f9', color: '#475569' }} />
                    </Box>
                  </Box>

                  {/* Recommendation cards */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {group.recs.map((r: any) => (
                      <RecCard key={r.id} r={r} showActions={false} />
                    ))}
                  </Box>
                </Box>
              );
            })()}
          </Box>
        )
      ) : (
        /* ── Personal view ── */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {recs.map((r: any) => (
            <RecCard key={r.id} r={r} showActions
              onAccept={(id) => { offdayApi.accept(id).then(() => { loadBalance(); loadRecs(); }); }}
              onReject={(id) => { offdayApi.reject(id).then(() => { loadBalance(); loadRecs(); }); }}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export const Analytics: React.FC = () => {
  const { isAdmin } = useAuth();
  const [users,          setUsers]          = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const selectedUserName = selectedUserId
    ? users.find((u: any) => u.id === selectedUserId)?.display_name
    : undefined;

  // Admin: load user list for selector
  useEffect(() => {
    if (!isAdmin) return;
    adminApi.getUsersList().then((res) => {
      setUsers(res.data.users ?? []);
    }).catch(() => {});
  }, [isAdmin]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        {isAdmin ? 'Team Analytics' : 'My Analytics'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {isAdmin
          ? 'Select a team member to view their detailed workload breakdown'
          : 'Detailed breakdown of your workload and calendar activity'}
      </Typography>

      {/* Admin user selector */}
      {isAdmin && (
        <Paper sx={{ p: 2, mb: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Viewing analytics for</InputLabel>
            <Select
              value={selectedUserId}
              label="Viewing analytics for"
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <MenuItem value="">— My own account —</MenuItem>
              {users.filter((u: any) => !u.is_test).map((u: any) => (
                <MenuItem key={u.id} value={u.id}>🔐 {u.display_name} ({u.email})</MenuItem>
              ))}
              {users.filter((u: any) => u.is_test).map((u: any) => (
                <MenuItem key={u.id} value={u.id}>🧪 {u.display_name} ({u.email})</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>
      )}

      <AnalyticsContent userId={selectedUserId || undefined} userName={selectedUserName} />

      {/* Admin: team overview when no specific user is selected
          When a user IS selected, their off-day recs appear inside AnalyticsContent above */}
      {isAdmin && !selectedUserId && (
        <Box sx={{ mt: 3 }}>
          <OffDaySection isAdminView />
        </Box>
      )}
    </Box>
  );
};
