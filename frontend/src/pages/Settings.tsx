import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Divider,
  Snackbar,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
import { useAuth } from '../hooks/useAuth';
import { authApi, syncApi, testApi } from '../services/api';

const PRIMARY = '#2563eb';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function mins2h(m: number) { return (Number(m) / 60).toFixed(1); }

const LOAD_COLOR = (peakMins: number, totalWorkMins: number) => {
  const peak = Number(peakMins) / 60;
  const total = Number(totalWorkMins) / 60;
  if (peak > 10) return '#ef4444';
  if (peak > 8)  return '#f59e0b';
  if (total < 5) return '#3b82f6';
  return '#10b981';
};
const LOAD_LABEL = (peakMins: number, totalWorkMins: number) => {
  const peak = Number(peakMins) / 60;
  const total = Number(totalWorkMins) / 60;
  if (peak > 10) return 'Overloaded';
  if (peak > 8)  return 'High Load';
  if (total < 5) return 'Underloaded';
  return 'Balanced';
};

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
                  const loadColor = LOAD_COLOR(u.peak_daily_minutes, u.total_work_minutes);
                  const loadLabel = LOAD_LABEL(u.peak_daily_minutes, u.total_work_minutes);
                  const initials  = u.display_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2);
                  const activeRisks = Number(u.active_risks);

                  return (
                    <Grid item xs={12} sm={6} key={u.id}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, borderLeft: `3px solid ${loadColor}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {/* Avatar */}
                        <Box sx={{ width: 34, height: 34, borderRadius: '50%', background: `${loadColor}20`, color: loadColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                          {initials}
                        </Box>

                        {/* Info */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{u.display_name}</Typography>
                            <Chip label={loadLabel} size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, background: `${loadColor}20`, color: loadColor }} />
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
