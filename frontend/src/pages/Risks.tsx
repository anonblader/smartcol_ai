import React, { useState } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Alert, Button,
  Tabs, Tab, Chip, Divider, Snackbar,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EmailIcon from '@mui/icons-material/Email';
import { useRisks, RiskAlert } from '../hooks/useRisks';
import { useTeamRisks, TeamRisk } from '../hooks/useAdmin';
import { useAuth } from '../hooks/useAuth';
import { PRIMARY, SEVERITY_COLORS } from '../utils/constants';
const SEV_ICON: Record<string, string> = {
  low: '🟢', medium: '🟡', high: '🟠', critical: '🔴',
};

// ── Personal risk card ────────────────────────────────────────────────────────

function PersonalRiskCard({ alert, tab, onAcknowledge, onDismiss }: {
  alert: RiskAlert; tab: string;
  onAcknowledge: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const color = SEVERITY_COLORS[alert.severity] || '#6b7280';
  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${color}30`, borderLeft: `4px solid ${color}`, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={alert.severity.toUpperCase()} size="small"
            sx={{ background: color, color: '#fff', fontWeight: 700, fontSize: 10, height: 20 }} />
          <Typography variant="caption" color="text.secondary">Score: {alert.score}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {tab === 'active' && (
            <Button size="small" variant="outlined" sx={{ fontSize: 12, py: 0.3 }} onClick={() => onAcknowledge(alert.id)}>
              Acknowledge
            </Button>
          )}
          {(tab === 'active' || tab === 'ongoing') && (
            <Button size="small" variant="outlined" color="error" sx={{ fontSize: 12, py: 0.3 }} onClick={() => onDismiss(alert.id)}>
              Dismiss
            </Button>
          )}
        </Box>
      </Box>
      <Typography variant="subtitle2" fontWeight={600}>{alert.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{alert.description}</Typography>
      {alert.recommendation && (
        <Typography variant="body2" color={PRIMARY} sx={{ mt: 0.5, fontStyle: 'italic' }}>{alert.recommendation}</Typography>
      )}
      {tab === 'ongoing' && (
        <Box sx={{ mt: 1.5, p: 1.5, background: '#fef9c3', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ color: '#92400e' }}>
            🔄 <strong>Ongoing</strong> — acknowledged. Will auto-resolve when the condition improves.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ── Team risk card (admin) ────────────────────────────────────────────────────

function TeamRiskCard({ alert, onAcknowledge }: {
  alert: TeamRisk; onAcknowledge: (id: string) => void;
}) {
  const color = SEVERITY_COLORS[alert.severity] || '#6b7280';
  const isAcknowledged = alert.status === 'acknowledged';
  const isResolved     = alert.status === 'resolved';

  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${color}30`, borderLeft: `4px solid ${color}`, mb: 2, opacity: isResolved ? 0.65 : 1 }}>
      {/* User label */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: '50%',
          background: alert.is_test_user ? '#f1f5f9' : '#ede9fe',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          color: alert.is_test_user ? '#64748b' : '#5b21b6',
          flexShrink: 0,
        }}>
          {alert.user_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
        </Box>
        <Box>
          <Typography variant="caption" fontWeight={700} color="text.primary">{alert.user_name}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>· {alert.user_email}</Typography>
        </Box>
        {alert.is_test_user && (
          <Chip label="Test" size="small" sx={{ height: 16, fontSize: 10, background: '#f1f5f9', color: '#64748b' }} />
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2">{SEV_ICON[alert.severity]}</Typography>
          <Chip label={alert.severity.toUpperCase()} size="small"
            sx={{ background: color, color: '#fff', fontWeight: 700, fontSize: 10, height: 20 }} />
          <Typography variant="caption" color="text.secondary">Score: {alert.score}</Typography>
          <Chip
            label={isResolved ? '✅ Resolved' : isAcknowledged ? '🔄 Acknowledged' : '🔴 Active'}
            size="small"
            sx={{ height: 20, fontSize: 10, fontWeight: 600,
              background: isResolved ? '#d1fae5' : isAcknowledged ? '#fef3c7' : '#fee2e2',
              color:      isResolved ? '#065f46' : isAcknowledged ? '#92400e' : '#991b1b' }}
          />
        </Box>
        {/* Only active alerts can be acknowledged */}
        {alert.status === 'active' && (
          <Button
            size="small"
            variant="contained"
            startIcon={<EmailIcon sx={{ fontSize: 14 }} />}
            onClick={() => onAcknowledge(alert.id)}
            sx={{ fontSize: 11, py: 0.4, px: 1.5, background: PRIMARY, '&:hover': { background: '#1d4ed8' } }}
          >
            Acknowledge & Notify
          </Button>
        )}
      </Box>

      <Typography variant="subtitle2" fontWeight={600}>{alert.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{alert.description}</Typography>
      {alert.recommendation && (
        <Typography variant="body2" color={PRIMARY} sx={{ mt: 0.5, fontStyle: 'italic' }}>{alert.recommendation}</Typography>
      )}
      {isAcknowledged && (
        <Box sx={{ mt: 1.5, p: 1.5, background: '#fef9c3', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ color: '#92400e' }}>
            🔄 Acknowledged — an email notification was sent to {alert.user_name}.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ── Admin risks view ──────────────────────────────────────────────────────────

function AdminRisks() {
  const [tab, setTab] = useState(0);
  const { active, ongoing, resolved, loading, error, acknowledge, refetch } = useTeamRisks();
  const [snack, setSnack] = useState('');

  const handleAck = async (id: string) => {
    await acknowledge(id);
    setSnack('Risk acknowledged — email notification sent to user');
  };

  const tabs = [
    { label: 'Active',       data: active,   color: '#ef4444' },
    { label: 'Acknowledged', data: ongoing,  color: '#f59e0b' },
    { label: 'Resolved',     data: resolved, color: '#10b981' },
  ];

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error" action={<Button onClick={refetch}>Retry</Button>}>{error}</Alert>;

  const currentData = tabs[tab]?.data ?? [];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>Team Risk Alerts</Typography>
        <Button variant="outlined" size="small" onClick={refetch}>Refresh</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Risk alerts across all team members. Click <strong>Acknowledge &amp; Notify</strong> to inform the user via email.
      </Typography>

      {/* Summary chips */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <Chip key={t.label} icon={<WarningAmberIcon sx={{ fontSize: 14 }} />} label={`${t.data.length} ${t.label}`} size="small"
            sx={{ background: `${t.color}20`, color: t.color, fontWeight: 700 }} />
        ))}
      </Box>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid #e2e8f0' }}>
          {tabs.map((t) => (
            <Tab key={t.label} label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {t.label}
                <Chip label={t.data.length} size="small"
                  sx={{ height: 18, fontSize: 10, fontWeight: 700, background: `${t.color}20`, color: t.color }} />
              </Box>
            } />
          ))}
        </Tabs>
        <Box sx={{ p: 3 }}>
          {currentData.length === 0 ? (
            <Typography color="text.secondary">No {tabs[tab]?.label.toLowerCase()} alerts.</Typography>
          ) : (
            currentData.map((alert) => (
              <TeamRiskCard key={alert.id} alert={alert} onAcknowledge={handleAck} />
            ))
          )}
        </Box>
      </Paper>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack('')} severity="success" variant="filled">{snack}</Alert>
      </Snackbar>
    </Box>
  );
}

// ── Personal risks view ───────────────────────────────────────────────────────

function PersonalRisks() {
  const [tab, setTab] = useState(0);
  const { active, ongoing, history, loading, error, acknowledge, dismiss, detect, refetch } = useRisks();
  const [detecting, setDetecting] = useState(false);

  const handleDetect = async () => {
    setDetecting(true);
    await detect();
    setDetecting(false);
  };

  const tabs = [
    { label: 'Active',   data: active,   key: 'active' },
    { label: 'Ongoing',  data: ongoing,  key: 'ongoing' },
    { label: 'History',  data: history,  key: 'history' },
  ];

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error)   return <Alert severity="error" action={<Button onClick={refetch}>Retry</Button>}>{error}</Alert>;

  const currentData  = tabs[tab]?.data ?? [];
  const currentKey   = tabs[tab]?.key ?? 'active';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>My Risk Alerts</Typography>
        <Button variant="contained" size="small" onClick={handleDetect} disabled={detecting}
          sx={{ background: '#ef4444', '&:hover': { background: '#dc2626' } }}>
          {detecting ? 'Detecting…' : '⚠️ Run Detection'}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Workload risks detected on your calendar data
      </Typography>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid #e2e8f0' }}>
          {tabs.map((t) => (
            <Tab key={t.label} label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {t.label}
                <Chip label={t.data.length} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
              </Box>
            } />
          ))}
        </Tabs>
        <Box sx={{ p: 3 }}>
          {currentData.length === 0
            ? <Typography color="text.secondary">No {tabs[tab]?.label.toLowerCase()} alerts.</Typography>
            : currentData.map((alert) => (
                <PersonalRiskCard key={alert.id} alert={alert} tab={currentKey} onAcknowledge={acknowledge} onDismiss={dismiss} />
              ))}
        </Box>
      </Paper>
    </Box>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export const Risks: React.FC = () => {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminRisks /> : <PersonalRisks />;
};
