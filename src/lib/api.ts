import { toast } from "sonner";

const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export type HealthRow = { engine_id: number; cycle: number; health: number };
export type DsiRow = { engine_id: number; cycle: number; DSI: number };
export type ReliabilityRow = { engine_id: number; cycle: number; reliability: number };
export type RulRow = { engine_id: number; cycle: number; predicted_rul: number; model: "lstm" | "rf" };
export type ClusterRow = {
  engine_id: number;
  avg_health: number;
  min_health: number;
  degradation_span: number;
  cycles: number;
  cluster: number;
};
export type Insights = {
  summary: string;
  worst_engine: number;
  lowest_health: number;
  fastest_degrader: number;
  fastest_mean_dsi: number;
  fleet_avg_health: number;
  cluster: number;
};
export type Analysis = {
  health: HealthRow[];
  dsi: DsiRow[];
  reliability: ReliabilityRow[];
  rul: RulRow[];
  clusters: ClusterRow[];
  insights: Insights;
};
export type ExplanationItem = { sensor: string; impact: number };
export type Explanation = {
  engine_id: number;
  health_explanation: ExplanationItem[];
  rul_explanation: ExplanationItem[];
  health_method: string;
  rul_method: string;
};
export type RegressionStats = { mae: number; rmse: number; r2: number | null; rows?: number };
export type SensorImportance = { sensor: string; importance: number };
export type TrainingMetrics = {
  health: RegressionStats & {
    degrading_regime_mae: number;
    degrading_regime_r2: number;
    cv_degrading_regime_r2_mean: number;
    cv_degrading_regime_r2_std: number;
  };
  rul_rf: RegressionStats;
  rul_lstm: RegressionStats | null;
  sensor_importance: { health: SensorImportance[]; rul: SensorImportance[] };
  dataset: { name: string; engines: number; test_engines: number; rows: number };
  trained_at: string;
};
export type DatasetEvaluation = {
  engine_count: number;
  total_rows: number;
  health: RegressionStats;
  rul_rf: RegressionStats;
  rul_lstm: RegressionStats | null;
  assumption: string;
  note: string;
};

async function parseError(res: Response): Promise<Error> {
  let detail = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (Array.isArray(body?.detail)) {
      detail = body.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(", ");
    }
  } catch {
    // Non-JSON error body
  }
  return new Error(detail);
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, init);
  } catch {
    throw new Error(`Cannot reach the Prognosys API at ${BASE_URL}. Is the backend running?`);
  }
  if (!res.ok) throw await parseError(res);
  return res.json();
}

function postFile<T>(endpoint: string, file: File, engineId?: number): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const query = engineId !== undefined ? `?engine_id=${encodeURIComponent(engineId)}` : "";
  return request<T>(`${endpoint}${query}`, { method: "POST", body: formData });
}

/**
 * Each uploaded file is analyzed once and shared by every page. Failed requests are
 * dropped from the cache so that the next visit retries, and each failure shows a
 * single toast no matter how many components were waiting on it.
 */
const cache = new WeakMap<File, Map<string, Promise<unknown>>>();

function cached<T>(file: File, key: string, load: () => Promise<T>): Promise<T> {
  let entries = cache.get(file);
  if (!entries) {
    entries = new Map();
    cache.set(file, entries);
  }
  const hit = entries.get(key);
  if (hit) return hit as Promise<T>;

  const promise = load();
  entries.set(key, promise);
  promise.catch((err: Error) => {
    entries!.delete(key);
    toast.error(err.message);
  });
  return promise;
}

let metricsPromise: Promise<TrainingMetrics> | null = null;

const analysis = (file: File) => cached(file, "analyze", () => postFile<Analysis>("/analyze", file));

export const api = {
  analyze: analysis,
  health: (file: File) => analysis(file).then((a) => a.health),
  dsi: (file: File) => analysis(file).then((a) => a.dsi),
  reliability: (file: File) => analysis(file).then((a) => a.reliability),
  clusters: (file: File) => analysis(file).then((a) => a.clusters),
  insights: (file: File) => analysis(file).then((a) => a.insights),
  predictRul: (file: File) => analysis(file).then((a) => a.rul),
  explain: (file: File, engineId: number) =>
    cached(file, `explain:${engineId}`, () => postFile<Explanation>("/explain", file, engineId)),
  evaluateDataset: (file: File) =>
    cached(file, "evaluate", () => postFile<DatasetEvaluation>("/evaluate-dataset", file)),
  metrics: () => {
    metricsPromise ??= request<TrainingMetrics>("/metrics").catch((err) => {
      metricsPromise = null;
      throw err;
    });
    return metricsPromise;
  },
};

/** Swallows a rejection that the cache layer has already reported with a toast. */
export const ignoreReported = () => {};
