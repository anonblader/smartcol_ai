// src/components/dashboard/TimeBreakdownChart.tsx
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface TaskTypeBreakdown {
  taskType: string;
  hours: number;
  percentage: number;
}

interface Props {
  data: TaskTypeBreakdown[];
}

// Color mapping for task types
const TASK_TYPE_COLORS = {
  'Deadline': '#E74C3C',
  'Ad-hoc Troubleshooting': '#E67E22',
  'Project Milestone': '#9B59B6',
  'Routine Meeting': '#3498DB',
  '1:1 Check-in': '#1ABC9C',
  'Admin/Operational': '#95A5A6',
  'Training/Learning': '#F39C12',
  'Focus Time': '#27AE60'
};

export const TimeBreakdownChart: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const chartData = data.map(item => ({
    name: item.taskType,
    hours: item.hours,
    percentage: item.percentage
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" label={{ value: 'Hours', position: 'insideBottom', offset: -5 }} />
        <YAxis dataKey="name" type="category" />
        <Tooltip
          formatter={(value, name) => {
            if (name === 'hours') {
              return [`${value} hours`, 'Time'];
            }
            return value;
          }}
        />
        <Bar
          dataKey="hours"
          fill="#3498DB"
          label={{ position: 'right', formatter: (value: number) => `${value}h` }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};