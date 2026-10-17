import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge, getHealthStatus } from "@/components/ui/status-badge";
import { HealthChart } from "@/components/charts/HealthChart";
import { MachineSelector } from "@/components/MachineSelector";
import { Link } from "react-router-dom";
import { Activity, TrendingUp, Clock, Info, Upload } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { api, ignoreReported, type HealthRow, type ReliabilityRow } from "@/lib/api";
import { useAppData } from "@/context/AppContext";
import { LoadingState } from "@/components/LoadingState";



export default function HealthPage() {
  const { file } = useAppData();

  const [healthData, setHealthData] = useState<HealthRow[]>([]);
  const [reliabilityData, setReliabilityData] = useState<ReliabilityRow[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);

  // Fetch backend data
  useEffect(() => {
    if (!file) return;
    setHealthData([]);
    setSelectedMachine(null);
    api.health(file).then(setHealthData).catch(ignoreReported);
    api.reliability(file).then(setReliabilityData).catch(ignoreReported);
  }, [file]);

  // Get unique machine IDs
  const machineIds = useMemo(
    () => Array.from(new Set(healthData.map((d) => d.engine_id))).sort((a, b) => a - b),
    [healthData]
  );

  useEffect(() => {
    if (machineIds.length && selectedMachine === null) setSelectedMachine(machineIds[0]);
  }, [machineIds, selectedMachine]);

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Machine Health Analysis"
          description="Upload data to view machine health"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to analyze machine health indices and operational state trends.
          </p>
          <Link
            to="/upload"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Upload className="mr-2 h-4 w-4" /> Go to Upload Page
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (selectedMachine === null) return <LoadingState />;

  // Filter data for selected machine
  const machineHealth = healthData.filter(
    (d) => d.engine_id === selectedMachine
  );

  const machineReliability = reliabilityData.filter(
    (d) => d.engine_id === selectedMachine
  );

  const latestHealth = machineHealth[machineHealth.length - 1];
  const firstHealth = machineHealth[0];
  const latestReliability = machineReliability[machineReliability.length - 1];

  const healthStatus = latestHealth
    ? getHealthStatus(latestHealth.health * 100)
    : "healthy";

  const healthChange =
    latestHealth && firstHealth
      ? ((latestHealth.health - firstHealth.health) * 100).toFixed(1)
      : "0";

  return (
    <MainLayout>
      <PageHeader
        title="Machine Health Analysis"
        description="Detailed health monitoring and trends for individual machines"
      >
        <MachineSelector
          machines={machineIds}
          value={selectedMachine}
          onChange={setSelectedMachine}
        />
      </PageHeader>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
        <MetricCard
          title="Current Health"
          value={`${(latestHealth?.health * 100 || 0).toFixed(1)}%`}
          icon={Activity}
        >
          <div className="mt-3">
            <StatusBadge status={healthStatus} />
          </div>
        </MetricCard>

        <MetricCard
          title="Health Change"
          value={`${healthChange}%`}
          subtitle="Since first cycle"
          icon={TrendingUp}
          trend={parseFloat(healthChange) >= 0 ? "up" : "down"}
          trendValue="Total change"
        />

        <MetricCard
          title="Operating Cycles"
          value={machineHealth.length}
          subtitle="Total recorded"
          icon={Clock}
        />

        <MetricCard
          title="Reliability"
          value={`${(latestReliability?.reliability * 100 || 0).toFixed(1)}%`}
          subtitle="Current estimate"
          icon={Activity}
        />
      </div>

      {/* Health Chart */}
      <div className="dashboard-card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Health vs Time (Cycle)
            </h2>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Machine health is computed from normalized sensor behavior
                  using ML models trained on historical degradation patterns.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <StatusBadge status={healthStatus} />
        </div>

        <HealthChart
          data={machineHealth.map((d) => ({
            cycle: d.cycle,
            health: d.health * 100,
          }))}
          showThresholds
        />
      </div>

      {/* Status Legend */}
      <div className="dashboard-card">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Health Status Thresholds
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-status-healthy-bg p-3 border border-status-healthy/20">
            <div className="h-3 w-3 rounded-full bg-status-healthy shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs sm:text-sm">Healthy (75–100%)</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Normal operation, no action required
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-status-moderate-bg p-3 border border-status-moderate/20">
            <div className="h-3 w-3 rounded-full bg-status-moderate shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs sm:text-sm">Moderate (50–75%)</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Schedule preventive maintenance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-status-critical-bg p-3 border border-status-critical/20">
            <div className="h-3 w-3 rounded-full bg-status-critical shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs sm:text-sm">Critical (0–50%)</p>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                Immediate attention required
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
