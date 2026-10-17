import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Target,
  Wrench,
  BarChart3,
  Upload,
} from "lucide-react";

import { api, ignoreReported, type ClusterRow, type DsiRow, type HealthRow, type Insights } from "@/lib/api";
import { labelClusters } from "@/lib/clusters";
import { useAppData } from "@/context/AppContext";


export default function InsightsPage() {
  const { file } = useAppData();

  const [healthData, setHealthData] = useState<HealthRow[]>([]);
  const [dsiData, setDsiData] = useState<DsiRow[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [backendInsight, setBackendInsight] = useState<Insights | null>(
    null
  );

  // Fetch all required backend data
  useEffect(() => {
    if (!file) return;

    api.health(file).then(setHealthData).catch(ignoreReported);
    api.dsi(file).then(setDsiData).catch(ignoreReported);
    api.clusters(file).then(setClusters).catch(ignoreReported);
    api.insights(file).then(setBackendInsight).catch(ignoreReported);
  }, [file]);

  /* ---------------- FLEET-LEVEL COMPUTATIONS ---------------- */

  // Latest health per engine
  const latestHealthByEngine = useMemo(() => {
    const map = new Map<number, HealthRow>();
    healthData.forEach((row) => {
      map.set(row.engine_id, row);
    });
    return Array.from(map.values());
  }, [healthData]);

  const fleetAvgHealth =
    latestHealthByEngine.reduce((sum, d) => sum + d.health, 0) /
    (latestHealthByEngine.length || 1);

  const machinesCritical = latestHealthByEngine.filter(
    (d) => d.health < 0.5
  ).length;

  const machinesModerate = latestHealthByEngine.filter(
    (d) => d.health >= 0.5 && d.health < 0.75
  ).length;

  const machinesHealthy = latestHealthByEngine.filter(
    (d) => d.health >= 0.75
  ).length;

  // Fastest degrader (highest avg DSI)
  const avgDsiByEngine = useMemo(() => {
    const map = new Map<number, number[]>();
    dsiData.forEach((row) => {
      if (!map.has(row.engine_id)) map.set(row.engine_id, []);
      map.get(row.engine_id)!.push(row.DSI);
    });

    return Array.from(map.entries()).map(([engine, values]) => ({
      engine,
      avgDsi: values.reduce((sum, v) => sum + v, 0) / (values.length || 1),
    }));
  }, [dsiData]);

  const fastestDegrader = [...avgDsiByEngine].sort((a, b) => b.avgDsi - a.avgDsi)[0];

  /* ---------------- CLUSTER LABELING ---------------- */

  const labeledClusters = useMemo(
    () => labelClusters(clusters).map((c) => ({ engine_id: c.machine_id, cluster: c.cluster })),
    [clusters]
  );

  const fastDegraders = labeledClusters.filter((d) => d.cluster === "fast");

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Insights & Decision Support"
          description="Upload data to view AI-generated insights"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to generate prescriptive maintenance recommendations and fleet-level insights.
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


  /* ---------------- UI ---------------- */

  return (
    <MainLayout>
      <PageHeader
        title="Insights & Decision Support"
        description="AI-generated insights and maintenance recommendations"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
        <MetricCard
          title="Fleet Health"
          value={`${(fleetAvgHealth * 100).toFixed(1)}%`}
          subtitle="Average across all machines"
          icon={BarChart3}
        />

        <MetricCard
          title="Worst Machine"
          value={`Engine ${backendInsight?.worst_engine ?? "N/A"}`}
          subtitle={`Health: ${(
            (backendInsight?.lowest_health || 0) * 100
          ).toFixed(1)}%`}
          icon={AlertTriangle}
        />

        <MetricCard
          title="Fastest Degrader"
          value={`Engine ${fastestDegrader?.engine ?? "N/A"}`}
          subtitle={`Avg DSI: ${fastestDegrader?.avgDsi.toFixed(3) ?? "0.000"}`}
          icon={TrendingDown}
        />

        <MetricCard
          title="At-Risk Machines"
          value={machinesCritical + machinesModerate}
          subtitle="Require attention"
          icon={Target}
        />
      </div>

      {/* Priority & Positive Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
        {/* Priority Actions */}
        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-status-critical shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Priority Actions
            </h2>
          </div>

          <div className="space-y-3">
            {machinesCritical > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-status-critical-bg/50 p-3 border border-status-critical/10">
                <AlertTriangle className="h-5 w-5 text-status-critical shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-xs sm:text-sm">
                    {machinesCritical} machine(s) in critical condition
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Immediate inspection recommended
                  </p>
                </div>
              </div>
            )}

            {fastDegraders.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-status-moderate-bg/50 p-3 border border-status-moderate/10">
                <TrendingDown className="h-5 w-5 text-status-moderate shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-xs sm:text-sm">
                    {fastDegraders.length} fast degrading machine(s)
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground break-words">
                    Engines: {fastDegraders.map((d) => d.engine_id).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {machinesModerate > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 border border-border/30">
                <Wrench className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-xs sm:text-sm">
                    {machinesModerate} machine(s) need preventive maintenance
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Schedule maintenance soon
                  </p>
                </div>
              </div>
            )}

            {machinesCritical === 0 && fastDegraders.length === 0 && machinesModerate === 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                No urgent priority action needed. All fleet units are stable.
              </p>
            )}
          </div>
        </div>

        {/* Positive Indicators */}
        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-status-healthy shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Positive Indicators
            </h2>
          </div>

          <div className="space-y-3">
            {machinesHealthy > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-status-healthy-bg/50 p-3 border border-status-healthy/10">
                <CheckCircle2 className="h-5 w-5 text-status-healthy shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-xs sm:text-sm">
                    {machinesHealthy} machine(s) operating optimally
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    No immediate maintenance required
                  </p>
                </div>
              </div>
            )}

            {fleetAvgHealth > 0.7 && (
              <div className="flex items-start gap-3 rounded-lg bg-accent/50 p-3 border border-border/30">
                <BarChart3 className="h-5 w-5 text-accent-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground text-xs sm:text-sm">
                    Fleet health above threshold
                  </p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Strong overall maintenance performance
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fleet Status Table */}
      <div className="dashboard-card">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <Lightbulb className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground">
            Fleet Status Summary
          </h2>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-xs sm:text-sm font-semibold text-foreground">
                  Engine ID
                </th>
                <th className="pb-3 text-left text-xs sm:text-sm font-semibold text-foreground">
                  Health
                </th>
                <th className="pb-3 text-left text-xs sm:text-sm font-semibold text-foreground">
                  Status
                </th>
                <th className="pb-3 text-left text-xs sm:text-sm font-semibold text-foreground">
                  Cluster
                </th>
                <th className="pb-3 text-left text-xs sm:text-sm font-semibold text-foreground">
                  Recommendation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {latestHealthByEngine.map((d) => {
                const status =
                  d.health >= 0.75
                    ? "healthy"
                    : d.health >= 0.5
                    ? "moderate"
                    : "critical";

                const cluster = labeledClusters.find(
                  (c) => c.engine_id === d.engine_id
                );

                return (
                  <tr key={d.engine_id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 text-xs sm:text-sm font-medium text-foreground">
                      Engine {d.engine_id}
                    </td>
                    <td className="py-3 text-xs sm:text-sm text-foreground font-mono">
                      {(d.health * 100).toFixed(1)}%
                    </td>
                    <td className="py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="py-3 text-xs sm:text-sm text-muted-foreground capitalize">
                      {cluster?.cluster || "N/A"} degrader
                    </td>
                    <td className="py-3 text-xs sm:text-sm text-muted-foreground">
                      {status === "critical"
                        ? "Immediate inspection required"
                        : status === "moderate"
                        ? "Schedule preventive maintenance"
                        : "Continue monitoring"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
