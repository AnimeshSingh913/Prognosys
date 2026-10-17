import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { ClusterChart } from "@/components/charts/ClusterChart";
import {
  GitBranch,
  Layers,
  AlertTriangle,
  CheckCircle,
  Info,
  Upload,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { api, ignoreReported, type ClusterRow } from "@/lib/api";
import { labelClusters } from "@/lib/clusters";
import { useAppData } from "@/context/AppContext";


export default function ClusteringPage() {
  const { file } = useAppData();
  const [clusters, setClusters] = useState<ClusterRow[]>([]);

  // Fetch clustering data
  useEffect(() => {
    if (!file) return;
    api.clusters(file).then(setClusters).catch(ignoreReported);
  }, [file]);

  // Map numeric clusters → semantic labels
  const labeledClusters = useMemo(() => labelClusters(clusters), [clusters]);

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Degradation Pattern Clustering"
          description="Upload data to view clustering results"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to run unsupervised KMeans clustering on fleet degradation behavior patterns.
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


  const slowCount = labeledClusters.filter((d) => d.cluster === "slow").length;

  const moderateCount = labeledClusters.filter(
    (d) => d.cluster === "moderate"
  ).length;

  const fastCount = labeledClusters.filter((d) => d.cluster === "fast").length;

  return (
    <MainLayout>
      <PageHeader
        title="Degradation Pattern Clustering"
        description="Unsupervised machine learning to identify degradation behavior patterns"
      />

      {/* Cluster Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
        <MetricCard
          title="Total Machines"
          value={labeledClusters.length}
          subtitle="In cluster analysis"
          icon={Layers}
        />

        <MetricCard
          title="Slow Degraders"
          value={slowCount}
          subtitle="Lower maintenance priority"
          icon={CheckCircle}
        >
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-status-healthy transition-all"
              style={{
                width: `${(slowCount / (labeledClusters.length || 1)) * 100}%`,
              }}
            />
          </div>
        </MetricCard>

        <MetricCard
          title="Moderate Degraders"
          value={moderateCount}
          subtitle="Schedule maintenance"
          icon={GitBranch}
        >
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-status-moderate transition-all"
              style={{
                width: `${
                  (moderateCount / (labeledClusters.length || 1)) * 100
                }%`,
              }}
            />
          </div>
        </MetricCard>

        <MetricCard
          title="Fast Degraders"
          value={fastCount}
          subtitle="Priority attention"
          icon={AlertTriangle}
        >
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-status-critical transition-all"
              style={{
                width: `${(fastCount / (labeledClusters.length || 1)) * 100}%`,
              }}
            />
          </div>
        </MetricCard>
      </div>

      {/* Cluster Visualization */}
      <div className="dashboard-card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Cluster Visualization
            </h2>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  KMeans clustering groups machines based on operating cycles
                  and degradation span. Points closer together exhibit similar
                  degradation behavior.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <ClusterChart data={labeledClusters} />
      </div>

      {/* Cluster Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {["slow", "moderate", "fast"].map((label) => (
          <div
            key={label}
            className={`dashboard-card border-l-4 ${
              label === "slow"
                ? "border-l-status-healthy"
                : label === "moderate"
                ? "border-l-status-moderate"
                : "border-l-status-critical"
            }`}
          >
            <h3 className="font-semibold text-foreground mb-2 capitalize text-sm sm:text-base">
              {label} Degraders
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              {label === "slow"
                ? "Machines with slower health decline"
                : label === "moderate"
                ? "Machines with average degradation rate"
                : "Rapid health decline, immediate attention required"}
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {labeledClusters
                .filter((d) => d.cluster === label)
                .map((d) => (
                  <div
                    key={d.machine_id}
                    className="flex items-center justify-between text-xs sm:text-sm py-1 border-b border-border/30 last:border-0"
                  >
                    <span className="font-medium text-foreground">
                      Engine {d.machine_id}
                    </span>
                    <span className="text-muted-foreground">
                      {d.operating_cycles} cycles
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </MainLayout>
  );
}
