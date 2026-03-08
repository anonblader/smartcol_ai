import React from 'react';
import { Box, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { RiskAlert } from '../../hooks/useRisks';
import { RiskAlertCard } from './RiskAlertCard';

interface RiskAlertListProps {
  alerts: RiskAlert[];
  onAcknowledge?: (id: string) => void;
  onDismiss?: (id: string) => void;
  showActions?: boolean;
}

export const RiskAlertList: React.FC<RiskAlertListProps> = ({
  alerts,
  onAcknowledge,
  onDismiss,
  showActions = true,
}) => {
  if (!alerts || alerts.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 4,
          color: 'text.secondary',
        }}
      >
        <WarningAmberIcon sx={{ fontSize: 40, opacity: 0.2, mb: 1 }} />
        <Typography variant="body2">No risk alerts</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {alerts.map((alert) => (
        <RiskAlertCard
          key={alert.id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onDismiss={onDismiss}
          showActions={showActions}
        />
      ))}
    </Box>
  );
};
