import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { MachineSelector } from "@/components/MachineSelector";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from "recharts";
import { 
  Brain, 
  TrendingDown, 
  TrendingUp,
  Cpu, 
  Upload, 
  Info, 
  ShieldAlert, 
  ShieldCheck 
} from "lucide-react";
import { api, ignoreReported, type Explanation, type HealthRow, type SensorImportance } from "@/lib/api";
import { formatSensorName } from "@/lib/sensors";
import { useAppData } from "@/context/AppContext";

export default function ExplainabilityPage() {
  const { file } = useAppData();
  const [healthData, setHealthData] = useState<HealthRow[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [globalImportance, setGlobalImportance] = useState<SensorImportance[]>([]);

  // Fetch machine IDs
  useEffect(() => {
    if (!file) return;
    setHealthData([]);
    setExplanation(null);
    setSelectedMachine(null);
    api.health(file).then(setHealthData).catch(ignoreReported);
  }, [file]);

  // Global importance on held-out engines, computed at training time
  useEffect(() => {
    api.metrics()
      .then((m) =>
        setGlobalImportance(
          m.sensor_importance.health.slice(0, 10).map((r) => ({ ...r, sensor: formatSensorName(r.sensor) }))
        )
      )
      .catch(() => setGlobalImportance([]));
  }, []);

  const machineIds = useMemo(() => {
    return Array.from(new Set(healthData.map((d) => d.engine_id))).sort((a, b) => a - b);
  }, [healthData]);

  // Set default machine ID
  useEffect(() => {
    if (machineIds.length && selectedMachine === null) {
      setSelectedMachine(machineIds[0]);
    }
  }, [machineIds, selectedMachine]);

  // Fetch explanations for selected machine
  useEffect(() => {
    if (!file || selectedMachine === null) return;
    setLoading(true);
    api.explain(file, selectedMachine)
      .then(setExplanation)
      .catch(ignoreReported)
      .finally(() => setLoading(false));
  }, [file, selectedMachine]);

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Explainable AI"
          description="Model transparency and features local attribution tracking"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <Upload className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No Active Machine Data</h2>
          <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
            Please upload a CSV file with your sensor data to see which sensors drive each prediction.
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

  const healthChartData = explanation?.health_explanation.map(item => ({
    name: formatSensorName(item.sensor),
    impact: item.impact,
  })).sort((a, b) => b.impact - a.impact) || [];

  const rulChartData = explanation?.rul_explanation.map(item => ({
    name: formatSensorName(item.sensor),
    impact: item.impact,
  })).sort((a, b) => b.impact - a.impact) || [];

  // Find key drivers
  const topHealthDriver = explanation?.health_explanation?.[0];
  const topRulDriver = explanation?.rul_explanation?.[0];

  return (
    <MainLayout>
      <PageHeader
        title="Explainable AI"
        description="Local and global feature attributions for the health and RUL models"
      >
        {selectedMachine !== null && (
          <MachineSelector
            machines={machineIds}
            value={selectedMachine}
            onChange={setSelectedMachine}
          />
        )}
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8">
        <MetricCard
          title="Explainability Core"
          value="TreeSHAP"
          subtitle="Health model (exact, additive)"
          icon={Brain}
        />
        <MetricCard
          title="Analyzed Engine"
          value={`Engine ${selectedMachine}`}
          subtitle="Local explanation context"
          icon={Cpu}
        />
        <MetricCard
          title="Top Health Driver"
          value={topHealthDriver ? formatSensorName(topHealthDriver.sensor) : "N/A"}
          subtitle={topHealthDriver ? `Impact: ${topHealthDriver.impact > 0 ? "+" : ""}${topHealthDriver.impact}` : ""}
          icon={topHealthDriver && topHealthDriver.impact < 0 ? ShieldAlert : ShieldCheck}
        />
        <MetricCard
          title="Top RUL Driver"
          value={topRulDriver ? formatSensorName(topRulDriver.sensor) : "N/A"}
          subtitle={topRulDriver ? `Impact: ${topRulDriver.impact > 0 ? "+" : ""}${topRulDriver.impact} Cycles` : ""}
          icon={topRulDriver && topRulDriver.impact < 0 ? ShieldAlert : ShieldCheck}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
        {/* Global Feature Importance Card */}
        <div className="dashboard-card">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Global Feature Importance</h2>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-4 sm:mb-6">
            Share of mean |TreeSHAP| attribution per sensor for the health model, measured on engines held out from training.
          </p>
          <div className="h-[280px] sm:h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={globalImportance}
                layout="vertical"
                margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis dataKey="sensor" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={65} />
                <Tooltip 
                  cursor={{ fill: "transparent" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-popover border border-border p-2 rounded-lg text-xs shadow-md">
                          <p className="font-semibold">{payload[0].payload.sensor}</p>
                          <p className="text-primary mt-1">Share of attribution: {(Number(payload[0].value) * 100).toFixed(1)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="importance" fill="#8884d8" radius={[0, 4, 4, 0]}>
                  {globalImportance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#6366f1" : "#818cf8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Local Explanations Overview */}
        <div className="dashboard-card flex flex-col justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Local Explanation Summary</h2>
            <p className="text-xs text-muted-foreground mb-4 sm:mb-6 leading-relaxed">
              Every machine prediction is a combination of baseline (average) parameters shifted by local sensor observations. Attributions measure how much each sensor pushed the prediction away from that baseline:
            </p>
            <div className="space-y-3 sm:space-y-4">
              <div className="p-3 bg-muted/50 rounded-xl border border-border/40">
                <h4 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                  <span className="h-2 w-2 rounded-full bg-status-healthy shrink-0" />
                  Health Index Attribution
                </h4>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  Positive impact increases predicted health index score towards 1.0 (indicating better status), whereas negative values show sensors pulling the health rating down.
                </p>
              </div>

              <div className="p-3 bg-muted/50 rounded-xl border border-border/40">
                <h4 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                  <span className="h-2 w-2 rounded-full bg-status-moderate shrink-0" />
                  RUL Cycle Attribution
                </h4>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  RUL attributions (Random Forest decision paths) are in cycles. For example, a sensor impact of -15.4 cycles signifies that this sensor's value shortened the predicted machine lifespan by 15.4 cycles.
                </p>
              </div>
            </div>
          </div>
          <div className="text-[11px] sm:text-xs text-muted-foreground border-t border-border/50 pt-4 mt-6">
            Use the machine selector in the header to change the engine and recalculate attributions.
          </div>
        </div>
      </div>

      {/* Local Bar Charts */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[250px]">
          <span className="text-xs sm:text-sm text-muted-foreground animate-pulse">Calculating feature attributions...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health explanations */}
          <div className="dashboard-card">
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-1">Top Sensors Affecting Health</h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-4 sm:mb-6">
              Positive contribution increases health index, negative decreases health index.
            </p>
            {healthChartData.length > 0 ? (
              <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={healthChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={65} />
                    <ReferenceLine x={0} stroke="#666" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const val = Number(payload[0].value);
                          return (
                            <div className="bg-popover border border-border p-2 rounded-lg text-xs shadow-md">
                              <p className="font-semibold">{payload[0].payload.name}</p>
                              <p className={val >= 0 ? "text-status-healthy mt-1" : "text-status-critical mt-1"}>
                                Impact: {val > 0 ? "+" : ""}{val}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="impact">
                      {healthChartData.map((entry, idx) => (
                        <Cell 
                          key={`cell-${idx}`} 
                          fill={entry.impact >= 0 ? "#10b981" : "#ef4444"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] sm:h-[300px] text-xs text-muted-foreground">
                No explanation data available.
              </div>
            )}
          </div>

          {/* RUL explanations */}
          <div className="dashboard-card">
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-1">Top Sensors Affecting RUL</h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-4 sm:mb-6">
              Influence on estimated remaining useful life (cycles).
            </p>
            {rulChartData.length > 0 ? (
              <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rulChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={65} />
                    <ReferenceLine x={0} stroke="#666" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const val = Number(payload[0].value);
                          return (
                            <div className="bg-popover border border-border p-2 rounded-lg text-xs shadow-md">
                              <p className="font-semibold">{payload[0].payload.name}</p>
                              <p className={val >= 0 ? "text-status-healthy mt-1" : "text-status-critical mt-1"}>
                                RUL shift: {val > 0 ? "+" : ""}{val} cycles
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="impact">
                      {rulChartData.map((entry, idx) => (
                        <Cell 
                          key={`cell-${idx}`} 
                          fill={entry.impact >= 0 ? "#10b981" : "#ef4444"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] sm:h-[300px] text-xs text-muted-foreground">
                No explanation data available.
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
