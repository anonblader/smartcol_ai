// src/components/dashboard/WorkloadHeatmap.tsx
import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { format, startOfWeek, addDays } from 'date-fns';

interface DailyWorkload {
  date: string;
  hours: number;
  eventCount: number;
  level: 'light' | 'normal' | 'heavy' | 'overload';
}

interface Props {
  data: DailyWorkload[];
}

const LEVEL_COLORS = {
  light: '#27AE60',
  normal: '#3498DB',
  heavy: '#F39C12',
  overload: '#E74C3C'
};

export const WorkloadHeatmap: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  // Group by weeks
  const weeks: Record<string, DailyWorkload[]> = {};

  data.forEach(day => {
    const weekStart = format(startOfWeek(new Date(day.date)), 'yyyy-MM-dd');
    if (!weeks[weekStart]) {
      weeks[weekStart] = [];
    }
    weeks[weekStart].push(day);
  });

  return (
    <Box>
      <Box display="flex" mb={2}>
        <Typography variant="body2" sx={{ mr: 2 }}>
          🟢 &lt;8h
        </Typography>
        <Typography variant="body2" sx={{ mr: 2 }}>
          🔵 8-10h
        </Typography>
        <Typography variant="body2" sx={{ mr: 2 }}>
          🟡 10-12h
        </Typography>
        <Typography variant="body2">
          🔴 &gt;12h
        </Typography>
      </Box>

      <Box>
        {Object.entries(weeks).map(([weekStart, days]) => (
          <Box key={weekStart} display="flex" alignItems="center" mb={1}>
            <Typography variant="body2" sx={{ width: 100, mr: 2 }}>
              {format(new Date(weekStart), 'MMM d')}
            </Typography>

            <Box display="flex" gap={0.5}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, index) => {
                const dayData = days.find(d =>
                  format(new Date(d.date), 'EEE') === dayName
                );

                return (
                  <Tooltip
                    key={dayName}
                    title={
                      dayData
                        ? `${dayData.hours}h - ${dayData.eventCount} events`
                        : 'No data'
                    }
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1,
                        backgroundColor: dayData
                          ? LEVEL_COLORS[dayData.level]
                          : '#ecf0f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        '&:hover': {
                          opacity: 0.8
                        }
                      }}
                    >
                      <Typography variant="caption" color="white">
                        {dayName.charAt(0)}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};