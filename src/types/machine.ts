export interface ClusterData {
  machine_id: string | number;
  operating_cycles: number;
  degradation_span: number;
  cluster: 'slow' | 'moderate' | 'fast';
}

export type HealthStatus = 'healthy' | 'moderate' | 'critical';
