import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Alert, Chip, Grid,
  Select, MenuItem, FormControl, Tooltip, IconButton, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Snackbar,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditNoteIcon           from '@mui/icons-material/EditNote';
import AutoFixHighIcon        from '@mui/icons-material/AutoFixHigh';
import SchoolIcon             from '@mui/icons-material/School';
import { format, parseISO }   from 'date-fns';
import { feedbackApi }        from '../services/api';

const PRIMARY = '#2563eb';

// ── Task types (mirrors DB) ───────────────────────────────────────────────────

const TASK_TYPES = [
  { id: 1,  name: 'Deadline',               color: '#FF5252' },
  { id: 2,  name: 'Ad-hoc Troubleshooting', color: '#FF9800' },
  { id: 3,  name: 'Project Milestone',      color: '#4CAF50' },
  { id: 4,  name: 'Routine Meeting',        color: '#2196F3' },
  { id: 5,  name: '1:1 Check-in',           color: '#9C27B0' },
  { id: 6,  name: 'Admin/Operational',      color: '#607D8B' },
  { id: 7,  name: 'Training/Learning',      color: '#00BCD4' },
  { id: 8,  name: 'Focus Time',             color: '#3F51B5' },
  { id: 9,  name: 'Break/Personal',         color: '#8BC34A' },
  { id: 10, name: 'Out of Office',          color: '#FFC107' },
];

const typeMap = new Map(TASK_TYPES.map(t => [t.id, t]));

function fmtDate(s: string | Date) {
  try { return format(typeof s === 'string' ? parseISO(s) : s, 'EEE, MMM d · h:mm a'); }
  catch { return String(s); }
}
function fmtDuration(min: number) {
  if (!min || min === 0) return 'All day';
  return min < 60 ? `${min}m` : `${(min / 60).toFixed(1)}h`;
}

// ── Method badge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    rule_based:       { label: 'Rule-based', bg: '#dbeafe', color: '#1e40af' },
    ml_model:         { label: 'ML model',   bg: '#ede9fe', color: '#5b21b6' },
    user_feedback:    { label: '✓ You',      bg: '#d1fae5', color: '#065f46' },
    'pattern-learning-v1.0': { label: '🔁 Learned', bg: '#fef3c7', color: '#92400e' },
  };
  const c = cfg[method] ?? { label: method, bg: '#f1f5f9', color: '#475569' };
  return (
    <Chip label={c.label} size="small"
      sx={{ height: 18, fontSize: 9, fontWeight: 700, background: c.bg, color: c.color }} />
  );
}

// ── Inline correction dropdown ────────────────────────────────────────────────

function CorrectionSelect({ event, onCorrected }: {
  event: any;
  onCorrected: (eventId: string, newTypeId: number, patternsLearned: number) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected,   setSelected]   = useState<number>(event.task_type_id);

  const handleSubmit = async (typeId: number) => {
    if (typeId === event.task_type_id) { setOpen(false); return; }
    setSubmitting(true);
    try {
      const res = await feedbackApi.correct(event.id, typeId);
      onCorrected(event.id, typeId, res.data?.patternsLearned ?? 0);
    } catch { /* silent */ }
    finally { setSubmitting(false); setOpen(false); }
  };

  if (!open) {
    return (
      <Tooltip title="Correct this classification">
        <IconButton size="small" onClick={() => setOpen(true)}
          sx={{ color: '#94a3b8', '&:hover': { color: PRIMARY } }}>
          <EditNoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <FormControl size="small" sx={{ minWidth: 180 }}>
      <Select
        autoFocus open value={selected} disabled={submitting}
        onClose={() => setOpen(false)}
        onChange={(e) => { setSelected(Number(e.target.value)); handleSubmit(Number(e.target.value)); }}
        sx={{ fontSize: 12 }}
      >
        {TASK_TYPES.map(t => (
          <MenuItem key={t.id} value={t.id} sx={{ fontSize: 12 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              {t.name}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// ── Feedback Stats card ───────────────────────────────────────────────────────

function FeedbackStats({ userId }: { userId?: string }) {
  const [stats,   setStats]   = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await feedbackApi.getStats(userId);
      setStats(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CircularProgress size={20} />;
  if (!stats || stats.totalCorrections === 0) return null;

  return (
    <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #e2e8f0', mb: 3, background: '#f0fdf4' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <SchoolIcon sx={{ color: '#10b981' }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#065f46' }}>
          Active Learning — Your Corrections Are Improving the AI
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {[
          { label: 'Total corrections',   value: stats.totalCorrections },
          { label: 'Unique patterns learned', value: stats.uniqueSubjects },
          { label: 'Events auto-corrected',   value: stats.autoApplied },
        ].map(m => (
          <Grid item xs={4} key={m.label}>
            <Box sx={{ textAlign: 'center', p: 1, background: 'rgba(16,185,129,0.08)', borderRadius: 1 }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#10b981' }}>{m.value}</Typography>
              <Typography variant="caption" color="text.secondary">{m.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {stats.recentCorrections?.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>Recent corrections</Typography>
          {stats.recentCorrections.map((c: any, i: number) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" noWrap sx={{ maxWidth: 200 }}>{c.subject}</Typography>
              <Chip label={c.originalType}  size="small" sx={{ height: 16, fontSize: 9, background: '#fee2e2', color: '#991b1b' }} />
              <Typography variant="caption">→</Typography>
              <Chip label={c.correctedType} size="small" sx={{ height: 16, fontSize: 9, background: '#d1fae5', color: '#065f46' }} />
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

// ── Main Events page ──────────────────────────────────────────────────────────

export const Events: React.FC = () => {
  const [events,  setEvents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [snack,   setSnack]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedbackApi.getEvents({ limit: 100 });
      setEvents(res.data?.events ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCorrected = (eventId: string, newTypeId: number, patternsLearned: number) => {
    const t = typeMap.get(newTypeId);
    setEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, task_type_id: newTypeId, task_type_name: t?.name, color_code: t?.color, classification_method: 'user_feedback', feedback_id: 'corrected' }
        : e
    ));
    const msg = patternsLearned > 0
      ? `Corrected — ${patternsLearned} similar event(s) also updated automatically`
      : 'Classification corrected successfully';
    setSnack(msg);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Events & Classifications</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Review how SmartCol AI classified your calendar events. Correct any mistakes to improve future accuracy.
          </Typography>
        </Box>
        <Chip
          icon={<AutoFixHighIcon sx={{ fontSize: '14px !important' }} />}
          label="Active Learning"
          sx={{ background: '#ede9fe', color: '#5b21b6', fontWeight: 700, fontSize: 11 }}
        />
      </Box>

      {/* Feedback stats (only shows if there are corrections) */}
      <FeedbackStats />

      {/* How it works */}
      <Alert severity="info" sx={{ mb: 3, fontSize: 12 }} icon={<SchoolIcon />}>
        <strong>How active learning works:</strong> Click the <EditNoteIcon sx={{ fontSize: 13, verticalAlign: 'middle' }} /> icon next to any classification to correct it.
        Your correction is applied immediately, and events with the same title are automatically updated too.
        Future syncs will remember your corrections.
      </Alert>

      {/* Events table */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={600}>
            Classified Events
            {events.length > 0 && (
              <Chip label={`${events.length} events`} size="small"
                sx={{ ml: 1.5, height: 20, fontSize: 10, background: '#f1f5f9', color: '#475569' }} />
            )}
          </Typography>
        </Box>
        <Divider />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: PRIMARY }} />
          </Box>
        ) : events.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No classified events yet. Load a mock profile from Settings to get started.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Event</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date & Time</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Classification</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Method</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Confidence</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Correct</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((ev) => {
                  const color = ev.color_code || PRIMARY;
                  const isCorrected = ev.feedback_id || ev.classification_method === 'user_feedback';
                  return (
                    <TableRow key={ev.id} hover sx={{ background: isCorrected ? '#f0fdf4' : 'inherit' }}>
                      {/* Event name */}
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 220 }}>
                          {ev.subject || '(untitled)'}
                        </Typography>
                        {ev.location && (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            📍 {ev.location}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell>
                        <Typography variant="caption">{fmtDate(ev.start_time)}</Typography>
                      </TableCell>

                      {/* Duration */}
                      <TableCell align="right">
                        <Typography variant="caption">{fmtDuration(ev.duration_minutes)}</Typography>
                      </TableCell>

                      {/* Classification chip */}
                      <TableCell>
                        <Chip
                          label={ev.task_type_name || 'Unknown'}
                          size="small"
                          sx={{ background: `${color}20`, color, fontWeight: 700, fontSize: 11, height: 22 }}
                        />
                      </TableCell>

                      {/* Method badge */}
                      <TableCell>
                        <MethodBadge method={ev.classification_method} />
                      </TableCell>

                      {/* Confidence */}
                      <TableCell align="right">
                        <Typography variant="caption" sx={{
                          color: ev.confidence_score >= 0.80 ? '#10b981'
                            : ev.confidence_score >= 0.60 ? '#f59e0b' : '#ef4444',
                          fontWeight: 600,
                        }}>
                          {Math.round((ev.confidence_score ?? 0) * 100)}%
                        </Typography>
                      </TableCell>

                      {/* Correct button */}
                      <TableCell align="center">
                        {isCorrected ? (
                          <Tooltip title="You corrected this">
                            <CheckCircleOutlineIcon sx={{ color: '#10b981', fontSize: 18 }} />
                          </Tooltip>
                        ) : (
                          <CorrectionSelect event={ev} onCorrected={handleCorrected} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnack(null)} variant="filled" sx={{ fontSize: 13 }}>
          {snack}
        </Alert>
      </Snackbar>
    </Box>
  );
};
