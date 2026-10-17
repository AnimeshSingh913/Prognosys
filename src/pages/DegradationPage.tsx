import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { DSIChart } from "@/components/charts/DSIChart";
import { MachineSelector } from "@/components/MachineSelector";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TrendingDown, Zap, BarChart3, Info, Upload } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { api, ignoreReported, type DsiRow } from "@/lib/api";
import { useAppData } from "@/context/AppContext";
import { LoadingState } from "@/components/LoadingState";


export default function DegradationPage() {
  const { file } = useAppData();

  const [dsiData, setDsiData] = useState<DsiRow[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [showAverage, setShowAverage] = useState(false);

  /* ---------------- FETCH DATA ---------------- */

  useEffect(() => {
    if (!file) return;
    setDsiData([]);
    setSelectedMachine(null);
    api.dsi(file).then(setDsiData).catch(ignoreReported);
  }, [file]);

  /* ---------------- MEMOS (ALL BEFORE RETURNS) ---------------- */

  const machineIds = useMemo(() => {
    const ids = Array.from(new Set(dsiData.map((d) => d.engine_id)));
    if (ids.length && selectedMachine === null) {
      setSelectedMachine(ids[0]);
    }
    return ids;
  }, [dsiData, selectedMachine]);

  const machineData = useMemo(() => {
    if (selectedMachine === null) return [];
    return dsiData.filter((d) => d.engine_id === selectedMachine);
  }, [dsiData, selectedMachine]);

  const latestData = machineData[machineData.length - 1];

  const averageData = useMemo(() => {
    const grouped: Record<number, number[]> = {};

    dsiData.forEach((row) => {
      if (!grouped[row.cycle]) grouped[row.cycle] = [];
      grouped[row.cycle].push(row.DSI);
    });

    return Object.entries(grouped).map(([cycle, values]) => ({
      cycle: Number(cycle),
      avgDsi: values.reduce((sum, v) => sum + v, 0) / values.length,
    }));
  }, [dsiData]);

  const avgMachineDsi =
    machineData.reduce((sum, d) => sum + d.DSI, 0) / (machineData.length || 1);

  const maxDsi =
    machineData.length > 0 ? Math.max(...machineData.map((d) => d.DSI)) : 0;

  const minDsi =
    machineData.length > 0 ? Math.min(...machineData.map((d) => d.DSI)) : 0;

  /* ---------------- GUARDS (SAFE NOW) ---------------- */

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Degradation Speed Index (DSI)"
          description="Upload data to view degradation speed"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to compute the Degradation Speed Index (DSI) and analyze deterioration trends.
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

  /* ---------------- UI ---------------- */

  return (
    <MainLayout>
      <PageHeader
        title="Degradation Speed Index (DSI)"
        description="Monitor degradation velocity and maintenance urgency"
      >
        <MachineSelector
          machines={machineIds}
          value={selectedMachine}
          onChange={setSelectedMachine}
        />
      </PageHeader>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
        <MetricCard
          title="Current DSI"
          value={latestData?.DSI.toFixed(3) || "0.000"}
          subtitle="Latest measurement"
          icon={TrendingDown}
        />

        <MetricCard
          title="Average DSI"
          value={avgMachineDsi.toFixed(3)}
          subtitle="Machine average"
          icon={BarChart3}
        />

        <MetricCard
          title="Peak DSI"
          value={maxDsi.toFixed(3)}
          subtitle="Maximum recorded"
          icon={Zap}
        />

        <MetricCard
          title="DSI Range"
          value={`${minDsi.toFixed(3)} - ${maxDsi.toFixed(3)}`}
          subtitle="Min to max"
          icon={BarChart3}
        />
      </div>

      {/* Chart */}
      <div className="dashboard-card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              DSI vs Time for Engine {selectedMachine}
            </h2>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Higher DSI indicates faster degradation and higher maintenance
                  urgency.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Switch
              id="show-average"
              checked={showAverage}
              onCheckedChange={setShowAverage}
            />
            <Label
              htmlFor="show-average"
              className="text-xs sm:text-sm text-muted-foreground cursor-pointer"
            >
              Show Fleet Average
            </Label>
          </div>
        </div>

        <DSIChart
          data={machineData.map((d) => ({
            cycle: d.cycle,
            dsi: d.DSI,
          }))}
          averageData={averageData}
          showAverage={showAverage}
        />
      </div>
    </MainLayout>
  );
}
