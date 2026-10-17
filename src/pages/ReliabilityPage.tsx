import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { ReliabilityGauge } from "@/components/charts/ReliabilityGauge";
import { MachineSelector } from "@/components/MachineSelector";
import { Shield, Clock, TrendingUp, Activity, Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { api, ignoreReported, type ReliabilityRow } from "@/lib/api";
import { useAppData } from "@/context/AppContext";
import { LoadingState } from "@/components/LoadingState";

const pct = (v?: number) => (v ?? 0) * 100;

export default function ReliabilityPage() {
  /** 🔑 ALWAYS FIRST */
  const { file } = useAppData();
  const [reliabilityData, setReliabilityData] = useState<ReliabilityRow[]>([]);

  /** 🔑 SAFE INITIAL VALUE */
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);

  /** 🔑 FETCH */
  useEffect(() => {
    if (!file) return;
    setReliabilityData([]);
    setSelectedMachine(null);
    api.reliability(file).then(setReliabilityData).catch(ignoreReported);
  }, [file]);

  const machineIds = useMemo(
    () => Array.from(new Set(reliabilityData.map((d) => d.engine_id))).sort((a, b) => a - b),
    [reliabilityData]
  );

  /** 🔑 SET DEFAULT MACHINE ONCE */
  useEffect(() => {
    if (machineIds.length && selectedMachine === null) {
      setSelectedMachine(machineIds[0]);
    }
  }, [machineIds, selectedMachine]);

  /** 🔑 DERIVED DATA */
  const machineData = useMemo(() => {
    if (selectedMachine === null) return [];
    return reliabilityData.filter((d) => d.engine_id === selectedMachine);
  }, [reliabilityData, selectedMachine]);

  const latest = machineData[machineData.length - 1];

  const avg20 =
    machineData.slice(-20).reduce((s, d) => s + d.reliability, 0) /
    (machineData.slice(-20).length || 1);

  /** 🔑 EMPTY STATE */
  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Reliability Estimation"
          description="Upload data to view reliability"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to compute and visualize reliability levels and failure risk estimations.
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

  return (
    <MainLayout>
      <PageHeader
        title="Reliability Estimation"
        description="Probability of continued safe operation"
      >
        <MachineSelector
          machines={machineIds}
          value={selectedMachine}
          onChange={setSelectedMachine}
        />
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 sm:mb-8">
        <div className="dashboard-card flex flex-col items-center justify-center py-6 sm:py-8">
          <h2 className="text-base sm:text-lg font-semibold mb-3">
            Engine {selectedMachine}
          </h2>
          <ReliabilityGauge value={pct(latest?.reliability)} size="lg" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:col-span-2">
          <MetricCard
            title="Current Reliability"
            value={`${pct(latest?.reliability).toFixed(1)}%`}
            icon={Shield}
          />
          <MetricCard
            title="20-Cycle Average"
            value={`${pct(avg20).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Operating Cycles"
            value={machineData.length}
            icon={Clock}
          />
          <MetricCard
            title="Fleet Machines"
            value={machineIds.length}
            icon={Activity}
          />
        </div>
      </div>

      <div className="dashboard-card">
        <h3 className="text-sm sm:text-base font-semibold text-foreground mb-4">
          Fleet Machine Reliability Overview
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {machineIds.map((id) => {
            const last = reliabilityData
              .filter((d) => d.engine_id === id)
              .slice(-1)[0];

            return (
              <div key={id} className="p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex justify-between text-xs sm:text-sm font-medium mb-1.5">
                  <span className="text-foreground">Engine {id}</span>
                  <span className="text-muted-foreground">{pct(last?.reliability).toFixed(1)}%</span>
                </div>
                <Progress value={pct(last?.reliability)} className="h-2" />
              </div>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}
