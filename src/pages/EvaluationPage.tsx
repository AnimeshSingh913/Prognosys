import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { api, type RegressionStats, type SensorImportance } from "@/lib/api";
import { formatSensorName, sensorDescription } from "@/lib/sensors";
import { Cpu, ShieldCheck, TrendingDown, HelpCircle, Brain, Upload, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type EvaluationMetrics = {
  health: RegressionStats;
  rul_rf: RegressionStats;
  rul_lstm: RegressionStats | null;
};

const fmt = (value: number | null | undefined, digits: number) =>
  value === null || value === undefined ? "—" : value.toFixed(digits);

export default function EvaluationPage() {
  const { file } = useAppData();
  const [liveMetrics, setLiveMetrics] = useState<EvaluationMetrics | null>(null);
  const [liveInfo, setLiveInfo] = useState<{ engines: number; rows: number; note: string } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<EvaluationMetrics | null>(null);
  const [benchmarkInfo, setBenchmarkInfo] = useState<{ engines: number; trainedAt: string } | null>(null);
  const [importance, setImportance] = useState<SensorImportance[]>([]);
  const [showBenchmark, setShowBenchmark] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Hold-out benchmark from training (does not need an upload)
  useEffect(() => {
    api.metrics()
      .then((m) => {
        setBenchmarkMetrics({ health: m.health, rul_rf: m.rul_rf, rul_lstm: m.rul_lstm });
        setBenchmarkInfo({ engines: m.dataset.test_engines, trainedAt: m.trained_at });
        setImportance(m.sensor_importance.health.slice(0, 10));
      })
      .catch(() => setBenchmarkMetrics(null));
  }, []);

  // Live evaluation of the uploaded file
  useEffect(() => {
    if (!file) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLiveError(null);
    api.evaluateDataset(file)
      .then((data) => {
        setLiveMetrics({ health: data.health, rul_rf: data.rul_rf, rul_lstm: data.rul_lstm });
        setLiveInfo({ engines: data.engine_count, rows: data.total_rows, note: `${data.assumption} ${data.note}` });
      })
      .catch((err: Error) => {
        setLiveMetrics(null);
        setLiveError(err.message);
      })
      .finally(() => setIsLoading(false));
  }, [file]);

  if (!file) {
    return (
      <MainLayout>
        <PageHeader
          title="Model Performance & Evaluation"
          description="Comprehensive evaluation metrics for the Prognosys predictive maintenance model suite"
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-card rounded-2xl border border-border/50 max-w-3xl mx-auto shadow-sm mt-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6 animate-pulse">
            <BarChart3 className="h-8 w-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">No Evaluation Data</h2>
          <p className="text-muted-foreground text-xs sm:text-sm max-w-md mb-8 leading-relaxed">
            Upload your machine sensor dataset first. Model performance metrics (MAE, RMSE, R²) and SHAP-based sensor rankings will be dynamically computed once the data is processed.
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

  const useBenchmark = (showBenchmark || !liveMetrics) && benchmarkMetrics !== null;
  const activeMetrics = useBenchmark ? benchmarkMetrics : liveMetrics;

  return (
    <MainLayout>
      <PageHeader
        title="Model Performance & Evaluation"
        description="Comprehensive evaluation metrics for the Prognosys predictive maintenance model suite"
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="ml-3 text-muted-foreground font-medium">Evaluating models on uploaded dataset...</span>
        </div>
      ) : !activeMetrics ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive mb-6">
          <p className="font-semibold">Error Loading Metrics</p>
          <p className="text-sm">{liveError || "No metrics available. Train the models and check that the API is running."}</p>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Dynamic Evaluation Banner & Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-status-healthy animate-ping shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {useBenchmark ? "Hold-out Benchmark (NASA C-MAPSS FD001)" : "Live Dataset Evaluation"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {useBenchmark
                    ? `Measured on ${benchmarkInfo?.engines ?? 20} engines held out from training${benchmarkInfo ? ` (trained ${new Date(benchmarkInfo.trainedAt).toLocaleDateString()})` : ""}.${liveError ? ` Live evaluation unavailable: ${liveError}` : ""}`
                    : `Evaluated on '${file.name}' (${liveInfo?.engines ?? 0} engines, ${liveInfo?.rows ?? 0} rows). ${liveInfo?.note ?? ""}`}
                </p>
              </div>
            </div>

            {benchmarkMetrics && liveMetrics && (
              <button
                onClick={() => setShowBenchmark(!showBenchmark)}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-muted/50 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted shrink-0"
              >
                {showBenchmark ? "← View Uploaded Dataset Evaluation" : "Compare with Hold-out Benchmark →"}
              </button>
            )}
          </div>

          {/* Overview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Health Model Card */}
            <div className="dashboard-card border border-border/50 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">Health Model</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">XGBoost Regressor · 84 features</p>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-6">
                Estimates the health index (0–1) from raw sensors, 5-cycle rolling statistics and drift from each engine's first reading.
              </p>
              
              <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-4">
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    MAE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Mean Absolute Error: Lower is better.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.health.mae, 4)}</p>
                </div>
                <div className="text-center border-x border-border/50">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    RMSE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Root Mean Squared Error: Penalizes larger errors. Lower is better.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.health.rmse, 4)}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    R² Score
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Coefficient of determination: Closer to 1.0 is better.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.health.r2, 4)}</p>
                </div>
              </div>
            </div>

            {/* RF RUL Model Card */}
            <div className="dashboard-card border border-border/50 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-status-moderate" />
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">RF RUL Model</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">RandomForestRegressor</p>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-status-moderate/10 text-status-moderate">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-6">
                Predicts RUL directly from current sensor variables. Serves as a sequence-independent fallback.
              </p>
              
              <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-4">
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    MAE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Average error in predicted remaining cycles.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_rf.mae, 1)}</p>
                </div>
                <div className="text-center border-x border-border/50">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    RMSE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Root Mean Squared Error for predicted cycles.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_rf.rmse, 1)}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    R² Score
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>R2 regression score. Proportion of variance explained.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_rf.r2, 3)}</p>
                </div>
              </div>
            </div>

            {/* LSTM RUL Model Card */}
            <div className="dashboard-card border border-border/50 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-accent-foreground" />
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground">LSTM RUL Model</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Keras Sequence Network</p>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
                  <Cpu className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-6">
                Uses the last 20 cycles of sensor readings. Applied once an engine has 20 cycles of history and TensorFlow is installed on the server.
              </p>
              
              <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-4">
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    MAE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Average error in predicted remaining cycles (sequence based).</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_lstm?.mae, 1)}</p>
                </div>
                <div className="text-center border-x border-border/50">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    RMSE
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>Root Mean Squared Error of sequence forecasting.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_lstm?.rmse, 1)}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                    R² Score
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                      <TooltipContent>R2 score for sequence model. Higher is better.</TooltipContent>
                    </Tooltip>
                  </span>
                  <p className="text-sm sm:text-lg font-bold text-foreground mt-1 font-mono">{fmt(activeMetrics.rul_lstm?.r2, 3)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Details Explanation */}
          <div className="dashboard-card">
            <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Metric Definitions & Evaluation Standard</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="rounded-lg bg-muted/40 p-3.5 sm:p-4 border border-border/30">
                <p className="font-semibold text-sm text-foreground mb-1">Mean Absolute Error (MAE)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Measures the average magnitude of errors in a set of predictions, without considering their direction. It is the average absolute difference between the predicted and actual values.
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3.5 sm:p-4 border border-border/30">
                <p className="font-semibold text-sm text-foreground mb-1">Root Mean Squared Error (RMSE)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A quadratic metric that measures the average magnitude of error. It gives a relatively high weight to large errors, meaning RMSE is most useful when large errors are particularly undesirable.
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3.5 sm:p-4 border border-border/30">
                <p className="font-semibold text-sm text-foreground mb-1">R² (Coefficient of Determination)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Represents the proportion of variance in the dependent variable that is predictable from the independent variables. A score of 1.0 indicates perfect prediction.
                </p>
              </div>
            </div>
          </div>

          {/* Most Influential Sensors */}
          <div className="dashboard-card">
            <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary shrink-0" />
              Most Influential Sensors
            </h3>
            <p className="text-xs text-muted-foreground mb-4 sm:mb-6">
              Top 10 sensors by share of mean |TreeSHAP| attribution for the health model, measured on held-out engines.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {importance.map((row, idx) => ({
                rank: idx + 1,
                sensor: formatSensorName(row.sensor),
                desc: `${sensorDescription(row.sensor)} · ${(row.importance * 100).toFixed(1)}%`,
              })).map((item) => (
                <div key={item.rank} className="p-3 bg-muted/40 rounded-xl border border-border/30 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs sm:text-sm">
                    {item.rank}
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-foreground truncate">{item.sensor}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
