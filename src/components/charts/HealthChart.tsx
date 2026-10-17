import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
interface HealthChartProps {
  data: { cycle: number; health: number }[];
  showThresholds?: boolean;
}

export function HealthChart({ data, showThresholds = true }: HealthChartProps) {
  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="cycle"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Operating Cycle', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            label={{ value: 'Health %', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            itemStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Health']}
            labelFormatter={(label) => `Cycle ${label}`}
          />
          {showThresholds && (
            <>
              <ReferenceLine
                y={75}
                stroke="hsl(var(--status-moderate))"
                strokeDasharray="5 5"
                label={{ value: 'Moderate', position: 'right', fill: 'hsl(var(--status-moderate))', fontSize: 9 }}
              />
              <ReferenceLine
                y={50}
                stroke="hsl(var(--status-critical))"
                strokeDasharray="5 5"
                label={{ value: 'Critical', position: 'right', fill: 'hsl(var(--status-critical))', fontSize: 9 }}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="health"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
