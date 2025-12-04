// src/pages/Dashboard.tsx
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Grid, Paper, Typography } from '@mui/material';
import { TimeBreakdownChart } from '../components/dashboard/TimeBreakdownChart';
import { ProjectPieChart } from '../components/dashboard/ProjectPieChart';
import { WorkloadHeatmap } from '../components/dashboard/WorkloadHeatmap';
import { TrendsChart } from '../components/dashboard/TrendsChart';
import { MetricsCards } from '../components/analytics/MetricsCards';
import { RiskAlertList } from '../components/risks/RiskAlertList';
import { fetchWeeklySummary, fetchHeatmap, fetchTrends } from '../store/slices/analyticsSlice';
import { fetchActiveRisks } from '../store/slices/risksSlice';

export const Dashboard: React.FC = () => {
  const dispatch = useDispatch();
  const { weeklySummary, heatmap, trends, loading } = useSelector(state => state.analytics);
  const { activeRisks } = useSelector(state => state.risks);

  useEffect(() => {
    // Fetch dashboard data
    const today = new Date();
    const weekStart = getStartOfWeek(today);

    dispatch(fetchWeeklySummary({ weekStartDate: weekStart }));
    dispatch(fetchHeatmap({
      startDate: subDays(today, 28),
      endDate: today
    }));
    dispatch(fetchTrends({
      startDate: subMonths(today, 6),
      endDate: today,
      granularity: 'week'
    }));
    dispatch(fetchActiveRisks());
  }, [dispatch]);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="dashboard">
      <Typography variant="h4" gutterBottom>
        WorkSmart AI Dashboard
      </Typography>

      {/* Overview Cards */}
      <MetricsCards summary={weeklySummary} />

      {/* Main Charts */}
      <Grid container spacing={3}>
        {/* Time Breakdown */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Time Breakdown by Task Type
            </Typography>
            <TimeBreakdownChart data={weeklySummary?.taskTypeBreakdown} />
          </Paper>
        </Grid>

        {/* Project Distribution */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Time by Project
            </Typography>
            <ProjectPieChart />
          </Paper>
        </Grid>

        {/* Workload Heatmap */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Daily Workload Heatmap
            </Typography>
            <WorkloadHeatmap data={heatmap} />
          </Paper>
        </Grid>

        {/* Trends */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Workload Trends
            </Typography>
            <TrendsChart data={trends} />
          </Paper>
        </Grid>

        {/* Risk Alerts */}
        {activeRisks && activeRisks.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Risk Alerts & Recommendations
              </Typography>
              <RiskAlertList alerts={activeRisks} />
            </Paper>
          </Grid>
        )}
      </Grid>
    </div>
  );
};