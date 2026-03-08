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
import { analyticsApi, adminApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { format, parseISO } from 'date-fns';

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

function AnalyticsContent({ userId }: { userId?: string }) {
  const [daily,     setDaily]     = useState<any[]>([]);
  const [weekly,    setWeekly]    = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [heatmap,   setHeatmap]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

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
              <Button size="small" variant="outlined" onClick={fetchAll} sx={{ fontSize: 12 }}>Refresh</Button>
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
      </Grid>
    </Box>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export const Analytics: React.FC = () => {
  const { isAdmin } = useAuth();
  const [users,          setUsers]          = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

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

      <AnalyticsContent userId={selectedUserId || undefined} />
    </Box>
  );
};
