import React from 'react';
import { Box, Paper, Typography, Chip, Button } from '@mui/material';
import { RiskAlert } from '../../hooks/useRisks';

const SEVERITY_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#7c3aed',
};

interface RiskAlertCardProps {
  alert: RiskAlert;
  onAcknowledge?: (id: string) => void;
  onDismiss?: (id: string) => void;
  showActions?: boolean;
}

export const RiskAlertCard: React.FC<RiskAlertCardProps> = ({
  alert,
  onAcknowledge,
  onDismiss,
  showActions = true,
}) => {
  const color = SEVERITY_COLORS[alert.severity] || '#6b7280';

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: `1px solid ${color}25`,
        borderLeft: `4px solid ${color}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={alert.severity.toUpperCase()}
            size="small"
            sx={{
              background: color,
              color: '#fff',
              fontWeight: 700,
              fontSize: 10,
              height: 20,
            }}
          />
          {alert.score !== undefined && (
            <Typography variant="caption" color="text.secondary">
              Score: {alert.score}
            </Typography>
          )}
        </Box>

        {showActions && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onAcknowledge && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onAcknowledge(alert.id)}
                sx={{ fontSize: 12, py: 0.3 }}
              >
                Acknowledge
              </Button>
            )}
            {onDismiss && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => onDismiss(alert.id)}
                sx={{ fontSize: 12, py: 0.3 }}
              >
                Dismiss
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Typography variant="subtitle2" fontWeight={600}>
        {alert.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {alert.description}
      </Typography>
      {alert.recommendation && (
        <Typography
          variant="body2"
          color="#2563eb"
          sx={{ mt: 0.75, fontStyle: 'italic' }}
        >
          {alert.recommendation}
        </Typography>
      )}
    </Paper>
  );
};
