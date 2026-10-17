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

interface RulTrendData {
  cycle: number;
  rul: number;
}

interface RulTrendChartProps {
  data: RulTrendData[];
  showThresholds?: boolean;
}

export function RulTrendChart({ data, showThresholds = true }: RulTrendChartProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">
          Predicted RUL vs Time (Cycle)
        </h2>
      </div>
      <div className="h-[260px] sm:h-[320px] w-full">
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
              label={{ 
                value: 'Operating Cycle', 
                position: 'insideBottomRight', 
                offset: -5, 
                fontSize: 10, 
                fill: 'hsl(var(--muted-foreground))' 
              }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
              label={{ 
                value: 'RUL (Cycles)', 
                angle: -90, 
                position: 'insideLeft', 
                offset: 15,
                fontSize: 10, 
                fill: 'hsl(var(--muted-foreground))' 
              }}
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
              formatter={(value: number) => [`${value} Cycles`, 'RUL']}
              labelFormatter={(label) => `Cycle ${label}`}
            />
            {showThresholds && (
              <>
                <ReferenceLine
                  y={80}
                  stroke="hsl(var(--status-healthy))"
                  strokeDasharray="5 5"
                  label={{ 
                    value: 'Low Risk (>80)', 
                    position: 'right', 
                    fill: 'hsl(var(--status-healthy))', 
                    fontSize: 9 
                  }}
                />
                <ReferenceLine
                  y={30}
                  stroke="hsl(var(--status-critical))"
                  strokeDasharray="5 5"
                  label={{ 
                    value: 'High Risk (<30)', 
                    position: 'right', 
                    fill: 'hsl(var(--status-critical))', 
                    fontSize: 9 
                  }}
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey="rul"
              stroke="hsl(var(--accent-foreground))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: 'hsl(var(--accent-foreground))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
