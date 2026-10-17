import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
interface DSIChartProps {
  data: { cycle: number; dsi: number }[];
  averageData?: { cycle: number; avgDsi: number }[];
  showAverage?: boolean;
}

export function DSIChart({ data, averageData, showAverage = false }: DSIChartProps) {
  // Merge data for display
  const chartData = data.map((d, i) => ({
    cycle: d.cycle,
    dsi: d.dsi,
    avgDsi: averageData?.[i]?.avgDsi,
  }));

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="cycle"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Operating Cycle', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            label={{ value: 'DSI', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
            formatter={(value: number, name: string) => [
              value.toFixed(3),
              name === 'dsi' ? 'Machine DSI' : 'Fleet Average DSI',
            ]}
            labelFormatter={(label) => `Cycle ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="dsi"
            name="Machine DSI"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
          {showAverage && (
            <Line
              type="monotone"
              dataKey="avgDsi"
              name="Fleet Average"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
