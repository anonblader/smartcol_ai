import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Alert, Button,
  Chip, Divider, Snackbar, Grid, IconButton, Tooltip,
  Switch, FormControlLabel,
} from '@mui/material';
import MicrosoftIcon from '@mui/icons-material/Microsoft';
import SyncIcon from '@mui/icons-material/Sync';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BalanceIcon from '@mui/icons-material/Balance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon   from '@mui/icons-material/Schedule';
import EmailIcon      from '@mui/icons-material/Email';
import SendIcon       from '@mui/icons-material/Send';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useAuth } from '../hooks/useAuth';
import { authApi, syncApi, testApi, schedulerApi, notificationsApi } from '../services/api';
import { PRIMARY } from '../utils/constants';
import { mins2h, loadColor, loadLabel } from '../utils/helpers';

type SyncType = 'balanced' | 'overloaded' | 'underloaded' | null;
type SyncPhase = 'clearing' | 'syncing' | null;

const SYNC_OPTIONS = [
  {
    key: 'balanced' as SyncType,
    label: 'Balanced Workload',
    description: 'Realistic schedule: standups, focus blocks, project meetings. Healthy workload with no risk alerts.',
    icon: <BalanceIcon />,
    bg: '#10b981',
    lightBg: '#d1fae5',
    textColor: '#065f46',
    expectedRisks: 'Expected: No risks',
  },
  {
    key: 'overloaded' as SyncType,
    label: 'Overloaded Workload',
    description: '12.5h days across 3 weeks: long morning meetings, afternoon planning, evening overtime incidents, and clustered deadlines.',
    icon: <TrendingUpIcon />,
    bg: '#ef4444',
    lightBg: '#fee2e2',
    textColor: '#991b1b',
    expectedRisks: 'Expected: High Daily Workload, Meeting Overload, Burnout Risk + more',
  },
  {
    key: 'underloaded' as SyncType,
    label: 'Underloaded Workload',
    description: 'Minimal calendar: only 3 short check-ins per week. Very little structured work time.',
    icon: <TrendingDownIcon />,
    bg: '#3b82f6',
    lightBg: '#dbeafe',
    textColor: '#1e40af',
    expectedRisks: 'Expected: Low Focus Time',
  },
];

// ── Email Alerts Card ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  risk:     { label: 'Risk Alerts',    color: '#ef4444' },
  ml:       { label: 'ML Insights',    color: '#7c3aed' },
  workload: { label: 'Workload',       color: '#f59e0b' },
  digest:   { label: 'Digest',         color: '#10b981' },
};

function fmtTs(iso: string | null): string {
  if (!iso) return 'Never triggered';
  try { return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

function EmailAlertsCard() {
  const [settings, setSettings]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [testing, setTesting]     = useState(false);
  const [testMsg, setTestMsg]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.getSettings();
      setSettings(res.data?.settings ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (alertKey: string, current: boolean) => {
    setToggling(alertKey);
    try {
      await notificationsApi.updateSetting(alertKey, !current);
      setSettings(prev => prev.map(s => s.alert_key === alertKey ? { ...s, enabled: !current } : s));
    } catch { /* silent */ }
    finally { setToggling(null); }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await notificationsApi.sendTest();
      setTestMsg(res.data?.message || 'Test email sent — check server console if SMTP not configured');
    } catch {
      setTestMsg('Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const s of settings) {
    const cat = s.category || 'alerts';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmailIcon sx={{ color: '#f59e0b' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>Email Alert Notifications</Typography>
          <Typography variant="body2" color="text.secondary">
            Control which events trigger email notifications to engineers
            {' '}
            <Chip label="Console mode — no SMTP" size="small"
              sx={{ height: 18, fontSize: 10, background: '#fef3c7', color: '#92400e', ml: 0.5 }} />
          </Typography>
        </Box>
        <Tooltip title="Send a test email to your account">
          <Button
            size="small" variant="outlined"
            startIcon={testing ? <CircularProgress size={12} /> : <SendIcon />}
            onClick={handleTest} disabled={testing}
            sx={{ fontSize: 12, borderColor: '#f59e0b', color: '#92400e' }}
          >
            {testing ? 'Sending…' : 'Send Test'}
          </Button>
        </Tooltip>
      </Box>

      {testMsg && (
        <Alert severity="success" sx={{ mb: 2, fontSize: 12 }} onClose={() => setTestMsg(null)}>
          {testMsg}
        </Alert>
      )}

      <Divider sx={{ mb: 2.5 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} sx={{ color: '#f59e0b' }} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(grouped).map(([cat, items]) => {
            const catCfg = CATEGORY_LABELS[cat] ?? { label: cat, color: '#6b7280' };
            return (
              <Box key={cat}>
                {/* Category label */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: catCfg.color }} />
                  <Typography variant="caption" fontWeight={700} sx={{ color: catCfg.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {catCfg.label}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map((s: any) => {
                    const isFuture  = false; // weekly_digest is now fully implemented
                    const isToggling = toggling === s.alert_key;

                    return (
                      <Paper key={s.alert_key} variant="outlined" sx={{
                        p: 1.75, borderRadius: 1.5,
                        borderLeft: `3px solid ${s.enabled && !isFuture ? catCfg.color : '#e2e8f0'}`,
                        opacity: isFuture ? 0.6 : 1,
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          {/* Toggle */}
                          <FormControlLabel
                            control={
                              <Switch
                                checked={s.enabled}
                                disabled={isFuture || isToggling}
                                onChange={() => handleToggle(s.alert_key, s.enabled)}
                                size="small"
                                sx={{
                                  '& .MuiSwitch-switchBase.Mui-checked': { color: catCfg.color },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: catCfg.color },
                                }}
                              />
                            }
                            label=""
                            sx={{ m: 0, mr: 0.5 }}
                          />

                          {/* Info */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography variant="body2" fontWeight={600}>{s.alert_name}</Typography>
                              {!isFuture && s.enabled && (
                                <Chip label="ON" size="small"
                                  sx={{ height: 16, fontSize: 9, fontWeight: 700, background: `${catCfg.color}20`, color: catCfg.color }} />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                              {s.description}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                              <Typography variant="caption" color="text.secondary">
                                Last sent: <strong>{fmtTs(s.last_triggered)}</strong>
                              </Typography>
                              {s.trigger_count > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Sent <strong>{s.trigger_count}</strong> time{s.trigger_count > 1 ? 's' : ''}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 2.5, fontSize: 12 }}>
        <strong>Demo mode:</strong> Emails are logged to the server console. Add <code>EMAIL_USER</code> and <code>EMAIL_PASS</code> to <code>backend/.env</code> to send real emails via SMTP.
      </Alert>
    </Paper>
  );
}

// ── Scheduler Card ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  success: { color: '#10b981', bg: '#d1fae5', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  partial: { color: '#f59e0b', bg: '#fef3c7', icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
  failed:  { color: '#ef4444', bg: '#fee2e2', icon: <ErrorIcon sx={{ fontSize: 14 }} /> },
  never:   { color: '#94a3b8', bg: '#f1f5f9', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> },
};

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000)  return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function SchedulerCard() {
  const [jobs, setJobs]           = useState<Record<string, any>>({});
  const [loading, setLoading]     = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await schedulerApi.getStatus();
      setJobs(res.data?.jobs ?? {});
    } catch { /* silent — user may not be admin */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadStatus();
    // Auto-refresh every 15 seconds so status stays live
    const interval = setInterval(loadStatus, 15000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleTrigger = async (jobKey: string) => {
    setTriggering(jobKey);
    try {
      await schedulerApi.trigger(jobKey);
      setTimeout(loadStatus, 2000); // refresh after a short delay
    } catch { /* silent */ }
    finally { setTriggering(null); }
  };

  const handleToggle = async (jobKey: string, currentEnabled: boolean) => {
    setToggling(jobKey);
    try {
      await schedulerApi.toggle(jobKey, !currentEnabled);
      await loadStatus();
    } catch { /* silent */ }
    finally { setToggling(null); }
  };

  const jobEntries = Object.entries(jobs);

  return (
    <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', mb: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ScheduleIcon sx={{ color: '#7c3aed' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>Background Jobs</Typography>
          <Typography variant="body2" color="text.secondary">
            Automated pipeline runs that keep analytics and risk data up to date
          </Typography>
        </Box>
        <Tooltip title="Refresh status">
          <IconButton size="small" onClick={loadStatus} sx={{ border: '1px solid #e2e8f0' }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ mb: 2.5 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} sx={{ color: '#7c3aed' }} />
        </Box>
      ) : jobEntries.length === 0 ? (
        <Alert severity="info">Scheduler not available</Alert>
      ) : (
        <Grid container spacing={2}>
          {jobEntries.map(([key, job]) => {
            const cfg        = STATUS_CFG[job.lastRunStatus as string] ?? STATUS_CFG['never']!;
            const isRunning  = job.running as boolean;
            const isEnabled  = job.enabled as boolean;

            return (
              <Grid item xs={12} md={6} key={key}>
                <Paper variant="outlined" sx={{
                  p: 2, borderRadius: 1.5,
                  borderLeft: `4px solid ${isEnabled ? '#7c3aed' : '#cbd5e1'}`,
                  opacity: isEnabled ? 1 : 0.7,
                }}>
                  {/* Job name + status badge */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700}>{job.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{job.humanSchedule}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      {isRunning && (
                        <Chip label="Running…" size="small"
                          sx={{ height: 20, fontSize: 10, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }} />
                      )}
                      <Chip
                        icon={<Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>}
                        label={isRunning ? 'In progress' : job.lastRunStatus}
                        size="small"
                        sx={{ height: 20, fontSize: 10, fontWeight: 600, background: cfg.bg, color: cfg.color }}
                      />
                    </Box>
                  </Box>

                  {/* Metrics row */}
                  <Grid container spacing={1} sx={{ mb: 1.5 }}>
                    {[
                      { label: 'Last run',   value: fmtRelative(job.lastRun) },
                      { label: 'Duration',   value: fmtDuration(job.lastRunDuration) },
                      { label: 'Processed',  value: job.usersProcessed ?? 0 },
                      { label: 'Next (est)', value: fmtRelative(job.nextRun ? new Date(new Date(job.nextRun).getTime() - Date.now() * 2).toISOString() : null) === '—'
                        ? (job.nextRun ? new Date(job.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')
                        : new Date(job.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                    ].map(m => (
                      <Grid item xs={6} key={m.label}>
                        <Box sx={{ background: '#f8fafc', borderRadius: 1, p: 0.75, textAlign: 'center' }}>
                          <Typography variant="body2" fontWeight={700}>{m.value}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Errors (collapsed) */}
                  {Array.isArray(job.errors) && job.errors.length > 0 && (
                    <Alert severity="warning" sx={{ mb: 1.5, py: 0.5, fontSize: 11 }}>
                      {job.errors[0]}{job.errors.length > 1 ? ` (+${job.errors.length - 1} more)` : ''}
                    </Alert>
                  )}

                  {/* Action buttons */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small" variant="contained" fullWidth
                      startIcon={triggering === key ? <CircularProgress size={12} color="inherit" /> : <PlayArrowIcon />}
                      onClick={() => handleTrigger(key)}
                      disabled={isRunning || triggering !== null || !isEnabled}
                      sx={{ fontSize: 11, background: '#7c3aed', '&:hover': { background: '#6d28d9' } }}
                    >
                      {triggering === key ? 'Starting…' : 'Run Now'}
                    </Button>
                    <Button
                      size="small" variant="outlined" fullWidth
                      startIcon={toggling === key ? <CircularProgress size={12} /> : isEnabled ? <PauseIcon /> : <PlayArrowIcon />}
                      onClick={() => handleToggle(key, isEnabled)}
                      disabled={toggling !== null}
                      color={isEnabled ? 'warning' : 'success'}
                      sx={{ fontSize: 11 }}
                    >
                      {toggling === key ? '…' : isEnabled ? 'Pause' : 'Resume'}
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Paper>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export const Settings: React.FC = () => {
  const { user, authenticated, loading, isAdmin } = useAuth();
  const [syncing, setSyncing] = useState<SyncType>(null);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    type: SyncType;
    message: string;
    risks: string[];
    eventsAdded: number;
  } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    lastSync?: string;
    totalEvents?: number;
  } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // Test users state (admin only)
  const [testUsers,      setTestUsers]      = useState<any[]>([]);
  const [testLoading,    setTestLoading]    = useState(false);
  const [testAction,     setTestAction]     = useState<string | null>(null);

  const showSnack = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const loadTestUsers = useCallback(async () => {
    if (!isAdmin) return;
    setTestLoading(true);
    try {
      const res = await testApi.getTestUsers();
      setTestUsers(res.data.users ?? []);
    } catch { /* silent */ }
    finally { setTestLoading(false); }
  }, [isAdmin]);

  useEffect(() => { loadTestUsers(); }, [loadTestUsers]);

  const handleSeedFixed = async () => {
    setTestAction('seed');
    try {
      await testApi.seedFixedUsers();
      showSnack('4 fixed test profiles seeded successfully');
      loadTestUsers();
    } catch { showSnack('Seed failed', 'error'); }
    finally { setTestAction(null); }
  };

  const handleAddRandom = async () => {
    setTestAction('random');
    try {
      const res = await testApi.addRandomUser();
      showSnack(`Added ${res.data.displayName} (${res.data.archetype})`);
      loadTestUsers();
    } catch { showSnack('Failed to add random user', 'error'); }
    finally { setTestAction(null); }
  };

  const handleRunPipelineAll = async () => {
    setTestAction('pipeline');
    try {
      const res = await testApi.runPipelineAll();
      showSnack(`Pipeline run for ${res.data.usersProcessed} test users`);
      loadTestUsers();
    } catch { showSnack('Pipeline failed', 'error'); }
    finally { setTestAction(null); }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Remove ALL test users and their data? This cannot be undone.')) return;
    setTestAction('clear');
    try {
      await testApi.clearAllTestUsers();
      showSnack('All test users cleared');
      setTestUsers([]);
    } catch { showSnack('Clear failed', 'error'); }
    finally { setTestAction(null); }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} and all their data?`)) return;
    try {
      await testApi.deleteUser(userId);
      showSnack(`${name} removed`);
      loadTestUsers();
    } catch { showSnack('Delete failed', 'error'); }
  };

  const handleAddRandomEvents = async (userId: string, name: string) => {
    try {
      await testApi.addRandomEvents(userId);
      showSnack(`Random events added to ${name}`);
      loadTestUsers();
    } catch { showSnack('Failed to add events', 'error'); }
  };

  const handleRunPipelineUser = async (userId: string, name: string) => {
    try {
      await testApi.runPipelineUser(userId);
      showSnack(`Pipeline refreshed for ${name}`);
      loadTestUsers();
    } catch { showSnack('Pipeline failed', 'error'); }
  };

  const handleConnect = async () => {
    try {
      const res = await authApi.getConnectUrl();
      const authUrl = res.data.authUrl || res.data.url || res.data;
      if (typeof authUrl === 'string') window.location.href = authUrl;
    } catch {
      showSnack('Failed to get connection URL', 'error');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await authApi.disconnect();
      showSnack('Disconnected successfully');
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      showSnack('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleMockSync = async (type: SyncType) => {
    setSyncing(type);
    setSyncResult(null);
    try {
      // Step 1 — clear previous data
      setSyncPhase('clearing');
      await syncApi.clearData();

      // Step 2 — sync new workload
      setSyncPhase('syncing');
      const apiFn =
        type === 'overloaded'  ? syncApi.heavyMockSync :
        type === 'underloaded' ? syncApi.lightMockSync :
        syncApi.mockSync;

      const res  = await apiFn();
      const data = res.data;
      setSyncResult({
        type,
        message: data.message || 'Sync completed',
        risks: data.risks?.risksDetected || [],
        eventsAdded: data.stats?.eventsAdded ?? 0,
      });
      showSnack(data.message || 'Sync completed successfully');
    } catch (err: any) {
      showSnack(err?.response?.data?.message || 'Sync failed', 'error');
    } finally {
      setSyncing(null);
      setSyncPhase(null);
    }
  };

  const handleCheckSyncStatus = async () => {
    try {
      const res  = await syncApi.getSyncStatus();
      const data = res.data;
      setSyncStatus({
        lastSync: data.lastSync?.startedAt || data.lastSync,
        totalEvents: data.stats?.totalEvents,
      });
    } catch {
      showSnack('Failed to fetch sync status', 'error');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <CircularProgress sx={{ color: PRIMARY }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage your Microsoft Outlook connection and load mock calendar data for testing.
      </Typography>

      {/* Microsoft Connection Card */}
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MicrosoftIcon sx={{ color: PRIMARY }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Microsoft Outlook</Typography>
            <Typography variant="body2" color="text.secondary">Connect your Outlook calendar to sync events</Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {authenticated && user ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={600}>{user.displayName || user.name || 'User'}</Typography>
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                  label="Connected"
                  size="small"
                  sx={{ background: '#d1fae5', color: '#065f46', fontWeight: 600, fontSize: 11, height: 22, '& .MuiChip-icon': { color: '#10b981' } }}
                />
              </Box>
              {user.email && <Typography variant="body2" color="text.secondary">{user.email}</Typography>}
            </Box>
            <Button
              variant="outlined"
              color="error"
              startIcon={disconnecting ? <CircularProgress size={14} color="inherit" /> : <LinkOffIcon />}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              Disconnect
            </Button>
          </Box>
        ) : (
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>Connect your Microsoft account to start syncing your Outlook calendar.</Alert>
            <Button variant="contained" startIcon={<MicrosoftIcon />} onClick={handleConnect}
              sx={{ background: PRIMARY, '&:hover': { background: '#1d4ed8' } }}>
              Connect Microsoft Outlook
            </Button>
          </Box>
        )}
      </Paper>

      {/* Mock Data Card */}
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SyncIcon sx={{ color: '#f59e0b' }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Mock Calendar Data</Typography>
            <Typography variant="body2" color="text.secondary">
              Load a simulated workload profile to test SmartCol AI's analytics and risk detection.
            </Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 2.5 }} />

        <Grid container spacing={2}>
          {SYNC_OPTIONS.map((opt) => (
            <Grid item xs={12} md={4} key={opt.key as string}>
              <Box
                sx={{
                  border: `1px solid ${opt.bg}40`,
                  borderRadius: 2,
                  p: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: opt.lightBg,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ color: opt.bg }}>{opt.icon}</Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: opt.textColor }}>
                    {opt.label}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: opt.textColor, opacity: 0.85, mb: 1, flex: 1, fontSize: 12 }}>
                  {opt.description}
                </Typography>
                <Typography variant="caption" sx={{ color: opt.textColor, opacity: 0.7, display: 'block', mb: 1.5, fontStyle: 'italic' }}>
                  {opt.expectedRisks}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  startIcon={
                    syncing === opt.key
                      ? <CircularProgress size={14} color="inherit" />
                      : <SyncIcon />
                  }
                  onClick={() => handleMockSync(opt.key)}
                  disabled={syncing !== null}
                  sx={{
                    background: opt.bg,
                    '&:hover': { background: opt.bg, filter: 'brightness(0.9)' },
                    '&:disabled': { background: '#94a3b8' },
                  }}
                >
                  {syncing === opt.key && syncPhase === 'clearing' ? 'Clearing...' :
                   syncing === opt.key && syncPhase === 'syncing'  ? 'Syncing...'  :
                   'Load Data'}
                </Button>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* Sync result */}
        {syncResult && (
          <Box sx={{ mt: 2.5, p: 2, background: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              ✅ {syncResult.message}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Events added: <strong>{syncResult.eventsAdded}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Risks detected:{' '}
              {syncResult.risks.length > 0
                ? syncResult.risks.map((r) => (
                    <Chip key={r} label={r} size="small" sx={{ ml: 0.5, height: 20, fontSize: 10, background: '#fee2e2', color: '#991b1b' }} />
                  ))
                : <span style={{ color: '#10b981', fontWeight: 600 }}>None ✅</span>}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Sync Status Card */}
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarMonthIcon sx={{ color: PRIMARY }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Sync Status</Typography>
            <Typography variant="body2" color="text.secondary">Check the current state of your calendar sync</Typography>
          </Box>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {syncStatus ? (
          <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {syncStatus.lastSync && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Last sync</Typography>
                <Typography variant="body2" fontWeight={500}>{new Date(syncStatus.lastSync).toLocaleString()}</Typography>
              </Box>
            )}
            {syncStatus.totalEvents !== undefined && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Total events</Typography>
                <Typography variant="body2" fontWeight={500}>{syncStatus.totalEvents}</Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No sync status loaded yet.</Typography>
        )}

        <Button variant="outlined" startIcon={<SyncIcon />} onClick={handleCheckSyncStatus}
          sx={{ borderColor: '#cbd5e1', color: '#475569' }}>
          Check Sync Status
        </Button>
      </Paper>

      {/* ── Team Test Data (admin only) ── */}
      {isAdmin && (
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 1.5, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PeopleIcon sx={{ color: '#7c3aed' }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Team Test Data</Typography>
              <Typography variant="body2" color="text.secondary">
                Manage test users and their mock calendar data to populate the team dashboard
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ mb: 2.5 }} />

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
            <Button variant="contained" size="small" startIcon={testAction === 'seed' ? <CircularProgress size={14} color="inherit" /> : <GroupAddIcon />}
              onClick={handleSeedFixed} disabled={testAction !== null}
              sx={{ background: '#7c3aed', '&:hover': { background: '#6d28d9' } }}>
              {testAction === 'seed' ? 'Seeding…' : 'Seed 4 Fixed Profiles'}
            </Button>
            <Button variant="contained" size="small" startIcon={testAction === 'random' ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
              onClick={handleAddRandom} disabled={testAction !== null}
              sx={{ background: '#10b981', '&:hover': { background: '#059669' } }}>
              {testAction === 'random' ? 'Adding…' : '+ Add Random User'}
            </Button>
            <Button variant="outlined" size="small" startIcon={testAction === 'pipeline' ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={handleRunPipelineAll} disabled={testAction !== null || testUsers.length === 0}
              sx={{ borderColor: '#3b82f6', color: '#3b82f6' }}>
              {testAction === 'pipeline' ? 'Running…' : '⚙️ Refresh All Data'}
            </Button>
            <Tooltip title="Reload test user list">
              <IconButton size="small" onClick={loadTestUsers} disabled={testLoading} sx={{ border: '1px solid #e2e8f0' }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {testUsers.length > 0 && (
              <Button variant="outlined" size="small" color="error" startIcon={<DeleteOutlineIcon />}
                onClick={handleClearAll} disabled={testAction !== null}
                sx={{ ml: 'auto' }}>
                Clear All Test Users
              </Button>
            )}
          </Box>

          {/* Test user list */}
          {testLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} sx={{ color: '#7c3aed' }} />
            </Box>
          ) : testUsers.length === 0 ? (
            <Alert severity="info" icon={<PeopleIcon />}>
              No test users yet. Click <strong>Seed 4 Fixed Profiles</strong> to get started, or <strong>Add Random User</strong> to create one.
            </Alert>
          ) : (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
                {testUsers.length} test user{testUsers.length > 1 ? 's' : ''} · Click ⚙️ to refresh a user's pipeline or ➕ to add more events
              </Typography>
              <Grid container spacing={1.5}>
                {testUsers.map((u: any) => {
                  const uColor = loadColor(u.peak_daily_minutes, u.total_work_minutes);
                  const uLabel = loadLabel(u.peak_daily_minutes, u.total_work_minutes);
                  const initials  = u.display_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2);
                  const activeRisks = Number(u.active_risks);

                  return (
                    <Grid item xs={12} sm={6} key={u.id}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, borderLeft: `3px solid ${uColor}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {/* Avatar */}
                        <Box sx={{ width: 34, height: 34, borderRadius: '50%', background: `${uColor}20`, color: uColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                          {initials}
                        </Box>

                        {/* Info */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{u.display_name}</Typography>
                            <Chip label={uLabel} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, background: `${uColor}20`, color: uColor }} />
                            {activeRisks > 0 && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                <WarningAmberIcon sx={{ fontSize: 11, color: '#ef4444' }} />
                                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600 }}>{activeRisks}</Typography>
                              </Box>
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {mins2h(u.total_work_minutes)}h work · {u.total_events} events · {u.classified_events} classified
                          </Typography>
                        </Box>

                        {/* Actions */}
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Tooltip title="Add random events">
                            <IconButton size="small" onClick={() => handleAddRandomEvents(u.id, u.display_name)} sx={{ color: '#10b981' }}>
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Refresh pipeline (classify + compute + risks)">
                            <IconButton size="small" onClick={() => handleRunPipelineUser(u.id, u.display_name)} sx={{ color: '#3b82f6' }}>
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove user">
                            <IconButton size="small" onClick={() => handleDeleteUser(u.id, u.display_name)} sx={{ color: '#ef4444' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}
        </Paper>
      )}

      {/* ── Email Alert Notifications (admin only) ── */}
      {isAdmin && <EmailAlertsCard />}

      {/* ── Background Jobs (admin only) ── */}
      {isAdmin && <SchedulerCard />}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
