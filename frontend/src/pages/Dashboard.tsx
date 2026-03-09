import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert,
  Chip, Button, Divider, Tabs, Tab, LinearProgress,
} from '@mui/material';
import AccessTimeIcon    from '@mui/icons-material/AccessTime';
import TrendingUpIcon    from '@mui/icons-material/TrendingUp';
import EventIcon         from '@mui/icons-material/Event';
import VideocamIcon      from '@mui/icons-material/Videocam';
import WarningAmberIcon  from '@mui/icons-material/WarningAmber';
import GroupIcon         from '@mui/icons-material/Group';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useAnalytics }          from '../hooks/useAnalytics';
import { useRisks, RiskAlert }   from '../hooks/useRisks';
import { useTeamOverview, TeamMember } from '../hooks/useAdmin';
import { useAuth }               from '../hooks/useAuth';
import { format, parseISO }      from 'date-fns';
import { WorkloadForecastCard }  from '../components/dashboard/WorkloadForecastCard';
import { BurnoutScoreCard }      from '../components/dashboard/BurnoutScoreCard';
import { analyticsApi }          from '../services/api';

const PRIMARY = '#2563eb';
const BREAKDOWN_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#06b6d4', '#ec4899'];
const SEVERITY_COLORS: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#7c3aed',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mins2h(m: number) { return (Number(m) / 60).toFixed(1); }

function fmtTime(s: string) {
  try { return format(parseISO(s), 'EEE MMM d, h:mm a'); } catch { return s; }
}

// ── Shared stat card ─────────────────────────────────────────────────────────

function StatCard({ title, value, unit, icon, color = PRIMARY }: {
  title: string; value: string | number; unit?: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ width: 48, height: 48, borderRadius: 2, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          {value}
          {unit && <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>{unit}</Typography>}
        </Typography>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
      </Box>
    </Paper>
  );
}

// ── Alert card (personal) ────────────────────────────────────────────────────

function AlertCard({ alert, onAcknowledge, onDismiss }: {
  alert: RiskAlert; onAcknowledge: (id: string) => void; onDismiss: (id: string) => void;
}) {
  const color = SEVERITY_COLORS[alert.severity] || '#6b7280';
  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${color}30`, borderLeft: `4px solid ${color}`, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={alert.severity.toUpperCase()} size="small" sx={{ background: color, color: '#fff', fontWeight: 700, fontSize: 10, height: 20 }} />
          {alert.score !== undefined && <Typography variant="caption" color="text.secondary">Score: {alert.score}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => onAcknowledge(alert.id)} sx={{ fontSize: 12, py: 0.3 }}>Acknowledge</Button>
          <Button size="small" variant="outlined" color="error" onClick={() => onDismiss(alert.id)} sx={{ fontSize: 12, py: 0.3 }}>Dismiss</Button>
        </Box>
      </Box>
      <Typography variant="subtitle2" fontWeight={600}>{alert.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{alert.description}</Typography>
      {alert.recommendation && <Typography variant="body2" color={PRIMARY} sx={{ mt: 0.5, fontStyle: 'italic' }}>{alert.recommendation}</Typography>}
    </Paper>
  );
}

// ── Load level helpers ────────────────────────────────────────────────────────

function loadColor(peakMins: number, workMins: number) {
  const peak = Number(peakMins) / 60;
  const work = Number(workMins) / 60;
  if (peak > 10) return '#ef4444';
  if (peak > 8)  return '#f59e0b';
  if (work < 5)  return '#3b82f6';
  return '#10b981';
}
function loadLabel(peakMins: number, workMins: number) {
  const peak = Number(peakMins) / 60;
  const work = Number(workMins) / 60;
  if (peak > 10) return 'Overloaded';
  if (peak > 8)  return 'High Load';
  if (work < 5)  return 'Underloaded';
  return 'Balanced';
}

// ── Per-member detail panel (lazy-loaded on first tab selection) ──────────────

function MemberDetailPanel({ member }: { member: TeamMember }) {
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [bdLoading, setBdLoading] = useState(true);

  const lColor = loadColor(member.peak_daily_minutes, member.total_work_minutes);
  const lLabel = loadLabel(member.peak_daily_minutes, member.total_work_minutes);
  const activeRisks = Number(member.active_risks);
  const overtime    = Number(member.total_overtime_minutes);

  useEffect(() => {
    setBdLoading(true);
    analyticsApi.getTimeBreakdown({ userId: member.id })
      .then(res => setBreakdown(res.data?.breakdown ?? []))
      .catch(() => setBreakdown([]))
      .finally(() => setBdLoading(false));
  }, [member.id]);

  const chartData = breakdown.map((b: any) => ({
    name:  b.taskTypeName ?? 'Unknown',
    hours: parseFloat((b.totalHours ?? 0).toFixed(1)),
    color: b.colorCode || PRIMARY,
  }));

  return (
    <Box sx={{ p: 3 }}>
      {/* Member header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, p: 2, background: '#f8fafc', borderRadius: 2 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%',
          background: `${lColor}20`, color: lColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>
          {member.display_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={700}>{member.display_name}</Typography>
            <Chip label={lLabel} size="small" sx={{ background: `${lColor}20`, color: lColor, fontWeight: 700, fontSize: 11 }} />
            {member.is_test_user && <Chip label="Test User" size="small" sx={{ height: 20, fontSize: 10, background: '#f1f5f9', color: '#64748b' }} />}
          </Box>
          <Typography variant="body2" color="text.secondary">{member.email}</Typography>
        </Box>
        {activeRisks > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 18, color: '#ef4444' }} />
            <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 700 }}>
              {activeRisks} active risk{activeRisks > 1 ? 's' : ''}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Work Hours',  value: mins2h(member.total_work_minutes),     unit: 'hrs', icon: <AccessTimeIcon />,  color: PRIMARY    },
          { title: 'Overtime',    value: mins2h(member.total_overtime_minutes), unit: 'hrs', icon: <TrendingUpIcon />,  color: overtime > 0 ? '#ef4444' : '#94a3b8' },
          { title: 'Meetings',    value: mins2h(member.total_meeting_minutes),  unit: 'hrs', icon: <VideocamIcon />,    color: '#f59e0b'  },
          { title: 'Focus Time',  value: mins2h(member.total_focus_minutes),    unit: 'hrs', icon: <CenterFocusStrongIcon />, color: '#6366f1' },
        ].map(s => (
          <Grid item xs={6} sm={3} key={s.title}>
            <StatCard title={s.title} value={s.value} unit={s.unit} icon={s.icon} color={s.color} />
          </Grid>
        ))}
      </Grid>

      {/* ML cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={5}>
          <BurnoutScoreCard userId={member.id} />
        </Grid>
        <Grid item xs={12} lg={7}>
          <WorkloadForecastCard userId={member.id} />
        </Grid>
      </Grid>

      {/* Time breakdown chart */}
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Time Breakdown by Task Type</Typography>
        {bdLoading ? (
          <LinearProgress sx={{ mt: 1 }} />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" unit=" hrs" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
              <Tooltip formatter={(val: number) => [`${val} hrs`, 'Hours']} />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.color || BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Typography color="text.secondary">No breakdown data available</Typography>
        )}
      </Paper>
    </Box>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────

function AdminDashboard() {
  const { members, loading, error, refetch } = useTeamOverview();
  const [selectedTab, setSelectedTab] = useState(0);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error" action={<Button onClick={refetch}>Retry</Button>}>{error}</Alert>;

  const totalUsers  = members.length;
  const totalRisks  = members.reduce((s, m) => s + Number(m.active_risks), 0);
  const totalEvents = members.reduce((s, m) => s + Number(m.total_events), 0);
  const avgWorkHrs  = members.length
    ? (members.reduce((s, m) => s + Number(m.total_work_minutes), 0) / members.length / 60).toFixed(1)
    : '0';

  // Clamp selected tab within range (handles user list changes)
  const activeTab = Math.min(selectedTab, Math.max(0, members.length - 1));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Team Workload Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a team member tab to view their individual workload breakdown
      </Typography>

      {/* Summary stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Team Members"     value={totalUsers}  icon={<GroupIcon />}        color={PRIMARY}    />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Active Risks"     value={totalRisks}  icon={<WarningAmberIcon />} color="#ef4444"    />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Total Events"     value={totalEvents} icon={<EventIcon />}        color="#10b981"    />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Avg Work (total)" value={avgWorkHrs}  unit="hrs/member" icon={<AccessTimeIcon />} color="#f59e0b" />
        </Grid>
      </Grid>

      {/* Tabbed member view */}
      {members.length === 0 ? (
        <Alert severity="info">No team members yet. Seed test users or ask engineers to sign in.</Alert>
      ) : (
        <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Tab bar */}
          <Tabs
            value={activeTab}
            onChange={(_, v) => setSelectedTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              '& .MuiTab-root': { textTransform: 'none', minHeight: 56, px: 2 },
            }}
          >
            {members.map((m) => {
              const lc      = loadColor(m.peak_daily_minutes, m.total_work_minutes);
              const ll      = loadLabel(m.peak_daily_minutes, m.total_work_minutes);
              const initials = m.display_name.split(' ').map(n => n[0]).join('').slice(0, 2);
              const risks    = Number(m.active_risks);

              return (
                <Tab
                  key={m.id}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {/* Avatar */}
                      <Box sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: `${lc}25`, color: lc,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 10, flexShrink: 0,
                      }}>
                        {initials}
                      </Box>
                      {/* Name + chips */}
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                          {m.display_name.split(' ')[0]}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                          <Chip label={ll} size="small"
                            sx={{ height: 16, fontSize: 9, fontWeight: 700, background: `${lc}20`, color: lc }} />
                          {risks > 0 && (
                            <Chip
                              icon={<WarningAmberIcon sx={{ fontSize: '10px !important', color: '#ef4444 !important' }} />}
                              label={risks}
                              size="small"
                              sx={{ height: 16, fontSize: 9, fontWeight: 700, background: '#fee2e2', color: '#991b1b', pl: 0.25 }}
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>
                  }
                />
              );
            })}
          </Tabs>

          {/* Active tab content */}
          {members[activeTab] && <MemberDetailPanel key={members[activeTab]!.id} member={members[activeTab]!} />}
        </Paper>
      )}
    </Box>
  );
}

// ── Personal Dashboard ────────────────────────────────────────────────────────

function PersonalDashboard() {
  const { data, loading, error, refetch } = useAnalytics();
  const { active: activeAlerts, acknowledge, dismiss } = useRisks();

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error)   return <Box sx={{ p: 3 }}><Alert severity="error" action={<Button onClick={refetch}>Retry</Button>}>{error}</Alert></Box>;

  const week      = data?.currentWeek;
  const breakdown = data?.timeBreakdown ?? [];
  const upcoming  = data?.upcomingEvents ?? [];

  const chartData = breakdown.map(b => ({
    name:  b.taskTypeName,
    hours: parseFloat((b.totalHours ?? 0).toFixed(1)),
    color: b.colorCode || PRIMARY,
  }));

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>My Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Your workload overview for this week</Typography>

      {!week && breakdown.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No data yet. Go to <strong>Settings → Mock Calendar Data</strong> to load a workload profile.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Work Hours"  value={week ? week.workHours.toFixed(1) : '—'}     unit="hrs" icon={<AccessTimeIcon />} color={PRIMARY} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Overtime"    value={week ? week.overtimeHours.toFixed(1) : '—'}  unit="hrs" icon={<TrendingUpIcon />}  color="#ef4444" />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Events"      value={week?.totalEvents ?? '—'}                    icon={<EventIcon />}    color="#10b981" />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard title="Meetings"    value={week?.meetingCount ?? '—'}                   icon={<VideocamIcon />} color="#f59e0b" />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Time breakdown chart */}
        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', height: '100%' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Time Breakdown by Task Type</Typography>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit=" hrs" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130} />
                  <Tooltip formatter={(val: number) => [`${val} hrs`, 'Hours']} />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.color || BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <Typography color="text.secondary">No breakdown data yet</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Upcoming events */}
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', height: '100%' }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Upcoming Events (Next 7 Days)</Typography>
            {upcoming.length > 0 ? (
              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {upcoming.map((evt, idx) => (
                  <Box key={idx}>
                    <Box sx={{ py: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: evt.color_code || PRIMARY, mt: 0.7, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{evt.subject || 'Untitled'}</Typography>
                        <Typography variant="caption" color="text.secondary">{fmtTime(evt.start_time)}</Typography>
                        {evt.task_type && (
                          <Chip label={evt.task_type} size="small" sx={{ ml: 1, height: 16, fontSize: 10, background: `${evt.color_code}22`, color: evt.color_code || PRIMARY }} />
                        )}
                      </Box>
                      {evt.duration_minutes > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{evt.duration_minutes}m</Typography>
                      )}
                    </Box>
                    {idx < upcoming.length - 1 && <Divider />}
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <Typography color="text.secondary">No upcoming events</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Active risks */}
        {activeAlerts.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <WarningAmberIcon sx={{ color: '#f59e0b' }} />
                <Typography variant="h6" fontWeight={600}>My Active Risk Alerts</Typography>
                <Chip label={activeAlerts.length} size="small" sx={{ background: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
              </Box>
              {activeAlerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onAcknowledge={acknowledge} onDismiss={dismiss} />
              ))}
            </Paper>
          </Grid>
        )}

        {/* ML: Burnout Risk Score */}
        <Grid item xs={12} lg={5}>
          <BurnoutScoreCard />
        </Grid>

        {/* ML: 5-Day Workload Forecast */}
        <Grid item xs={12} lg={7}>
          <WorkloadForecastCard />
        </Grid>
      </Grid>
    </Box>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <PersonalDashboard />;
};
