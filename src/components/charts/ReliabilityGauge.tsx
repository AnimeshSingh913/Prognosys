import { cn } from '@/lib/utils';

interface ReliabilityGaugeProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ReliabilityGauge({
  value,
  size = 'md',
  showLabel = true,
}: ReliabilityGaugeProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  const getColor = () => {
    if (clampedValue >= 75) return 'hsl(var(--status-healthy))';
    if (clampedValue >= 50) return 'hsl(var(--status-moderate))';
    return 'hsl(var(--status-critical))';
  };

  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-36 h-36',
    lg: 'w-48 h-48',
  };

  const textSizes = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-4xl',
  };

  return (
    <div className={cn('relative', sizeClasses[size])}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="hsl(var(--muted))"
          strokeWidth="8"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-bold text-foreground', textSizes[size])}>
          {clampedValue.toFixed(1)}%
        </span>
        {showLabel && (
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Reliability
          </span>
        )}
      </div>
    </div>
  );
}
