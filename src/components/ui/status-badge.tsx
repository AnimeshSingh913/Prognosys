import { cn } from '@/lib/utils';
import { HealthStatus } from '@/types/machine';

interface StatusBadgeProps {
  status: HealthStatus;
  className?: string;
}

const statusConfig = {
  healthy: {
    label: 'Healthy',
    className: 'status-healthy',
  },
  moderate: {
    label: 'Moderate',
    className: 'status-moderate',
  },
  critical: {
    label: 'Critical',
    className: 'status-critical',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        config.className,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      {config.label}
    </span>
  );
}

export function getHealthStatus(health: number): HealthStatus {
  if (health >= 75) return 'healthy';
  if (health >= 50) return 'moderate';
  return 'critical';
}
