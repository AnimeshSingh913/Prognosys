import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  children?: ReactNode;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  className,
  children,
}: MetricCardProps) {
  return (
    <div className={cn('dashboard-card animate-slide-up p-4 sm:p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="metric-label text-xs font-semibold text-muted-foreground truncate">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground break-words">{value}</p>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className="flex items-center gap-1 text-xs sm:text-sm pt-1">
              <span
                className={cn(
                  'font-medium',
                  trend === 'up' && 'text-status-healthy',
                  trend === 'down' && 'text-status-critical',
                  trend === 'neutral' && 'text-muted-foreground'
                )}
              >
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-accent">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-accent-foreground" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

