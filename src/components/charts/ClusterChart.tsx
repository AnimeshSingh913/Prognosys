import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ZAxis,
} from 'recharts';
import { ClusterData } from '@/types/machine';

interface ClusterChartProps {
  data: ClusterData[];
}

export function ClusterChart({ data }: ClusterChartProps) {
  const slowData = data.filter((d) => d.cluster === 'slow');
  const moderateData = data.filter((d) => d.cluster === 'moderate');
  const fastData = data.filter((d) => d.cluster === 'fast');

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            dataKey="operating_cycles"
            name="Operating Cycles"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Operating Cycles', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            type="number"
            dataKey="degradation_span"
            name="Degradation Span"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Degradation Span', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <ZAxis range={[100, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            formatter={(value: number, name: string) => [value, name]}
            labelFormatter={(_, payload) => {
              if (payload && payload[0]) {
                return `Machine: ${payload[0].payload.machine_id}`;
              }
              return '';
            }}
          />
          <Legend />
          <Scatter
            name="Slow Degraders"
            data={slowData}
            fill="hsl(var(--status-healthy))"
          />
          <Scatter
            name="Moderate Degraders"
            data={moderateData}
            fill="hsl(var(--status-moderate))"
          />
          <Scatter
            name="Fast Degraders"
            data={fastData}
            fill="hsl(var(--status-critical))"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
