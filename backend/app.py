import json
import os
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import AnalysisHistory, get_db
from ml.models import ModelBundle
from ml.preprocessing import SENSOR_COLS, generate_rul_and_health
from run_migrations import run_migrations

API_VERSION = "1.0.0"
MAX_UPLOAD_MB = float(os.environ.get("MAX_UPLOAD_MB", "20"))
RELIABILITY_LAMBDA = 2.0
ID_COLS = ["engine_id", "cycle"]

models = ModelBundle()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global models
    try:
        run_migrations()
    except Exception as e:
        # The API still serves predictions without the history log
        print(f"Database migrations failed: {e}")
    models = ModelBundle.load()
    yield


app = FastAPI(title="Prognosys – Predictive Maintenance API", version=API_VERSION, lifespan=lifespan)


def _allowed_origins() -> List[str]:
    origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # FRONTEND_URL may hold several comma-separated origins
    extra = os.environ.get("FRONTEND_URL", "")
    origins += [o.strip().rstrip("/") for o in extra.split(",") if o.strip()]
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=os.environ.get("FRONTEND_ORIGIN_REGEX") or None,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# --------------------------------------------------
# RESPONSE SCHEMAS
# --------------------------------------------------
class ExplanationItem(BaseModel):
    sensor: str
    impact: float


class ExplanationResponse(BaseModel):
    engine_id: int
    health_explanation: List[ExplanationItem]
    rul_explanation: List[ExplanationItem]
    health_method: str
    rul_method: str


class CompletePredictionResponse(ExplanationResponse):
    cycle: int
    health_score: float
    predicted_rul: int
    rul_model: str
    risk_level: str
    reliability: float
    cluster: int


class RulPredictionItem(BaseModel):
    engine_id: int
    cycle: int
    predicted_rul: int
    model: str


class HealthPredictionItem(BaseModel):
    engine_id: int
    cycle: int
    health: float


# --------------------------------------------------
# INPUT HANDLING
# --------------------------------------------------
def load_csv(file: UploadFile) -> pd.DataFrame:
    """
    Parses and validates an uploaded CSV. Requires engine_id, cycle and sensor_1..sensor_21
    (the models were trained on all 21 C-MAPSS sensors). Returns a frame sorted by
    (engine_id, cycle) with a fresh RangeIndex.
    """
    f = file.file
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"File is larger than the {MAX_UPLOAD_MB:g} MB limit")

    try:
        df = pd.read_csv(f)
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not parse CSV file: {e}")

    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")

    missing = [c for c in ID_COLS + SENSOR_COLS if c not in df.columns]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Missing required columns: {', '.join(missing)}. "
                            "Expected engine_id, cycle and sensor_1 … sensor_21.")

    df = df[ID_COLS + SENSOR_COLS].apply(pd.to_numeric, errors="coerce")
    df = df.dropna(subset=ID_COLS)
    if df.empty:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV contains no rows with a numeric engine_id and cycle")
    df[ID_COLS] = df[ID_COLS].astype(int)
    df = df.sort_values(ID_COLS).drop_duplicates(ID_COLS, keep="last")

    # Fill isolated gaps from neighbouring cycles of the same engine
    df[SENSOR_COLS] = df.groupby("engine_id")[SENSOR_COLS].transform(lambda s: s.ffill().bfill())
    empty_sensors = [c for c in SENSOR_COLS if df[c].isna().any()]
    if empty_sensors:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Some engines have no numeric values for: {', '.join(empty_sensors)}")

    return df.reset_index(drop=True)


def require_models():
    if not models.ready:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            models.load_error or "Models are not loaded")


def select_engine(df: pd.DataFrame, engine_id: Optional[int]) -> pd.DataFrame:
    if engine_id is None:
        engine_id = int(df["engine_id"].iloc[0])
    engine_df = df[df["engine_id"] == engine_id]
    if engine_df.empty:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"engine_id {engine_id} is not in the uploaded file")
    return engine_df.reset_index(drop=True)


# --------------------------------------------------
# ANALYTICS
# --------------------------------------------------
def risk_level(rul: float) -> str:
    if rul > 80:
        return "LOW"
    if rul >= 30:
        return "MEDIUM"
    return "HIGH"


def reliability_from_health(health):
    """Heuristic reliability index (0–1): exp(-λ · (1 - health))."""
    return np.exp(-RELIABILITY_LAMBDA * (1.0 - health))


def health_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df[ID_COLS].copy()
    out["health"] = models.predict_health(df)
    out["DSI"] = -out.groupby("engine_id")["health"].diff().fillna(0.0)
    out["reliability"] = reliability_from_health(out["health"])
    return out


def cluster_engines(h: pd.DataFrame) -> pd.DataFrame:
    """
    Groups engines by degradation behaviour with KMeans on standardized features.
    Cluster ids are ordered by mean degradation span: 0 = slowest, k-1 = fastest.
    """
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    features = h.groupby("engine_id").agg(
        avg_health=("health", "mean"),
        min_health=("health", "min"),
        degradation_span=("health", lambda x: x.iloc[0] - x.iloc[-1]),
        cycles=("cycle", "max"),
    )
    k = min(3, len(features))
    if k < 2:
        features["cluster"] = 0
    else:
        X = StandardScaler().fit_transform(features.values)
        raw = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(X)
        order = features.groupby(raw)["degradation_span"].mean().sort_values().index
        remap = {old: new for new, old in enumerate(order)}
        features["cluster"] = [remap[c] for c in raw]
    return features.reset_index().round(4)


def build_insights(h: pd.DataFrame, clusters: pd.DataFrame) -> dict:
    latest = h.groupby("engine_id").tail(1).set_index("engine_id")
    worst_id = int(latest["health"].idxmin())
    mean_dsi = h.groupby("engine_id")["DSI"].mean()
    fastest_id = int(mean_dsi.idxmax())
    return {
        "summary": f"Analyzed {len(latest)} engine(s) across {len(h)} cycles.",
        "worst_engine": worst_id,
        "lowest_health": round(float(latest.loc[worst_id, "health"]), 4),
        "fastest_degrader": fastest_id,
        "fastest_mean_dsi": round(float(mean_dsi.loc[fastest_id]), 5),
        "fleet_avg_health": round(float(latest["health"].mean()), 4),
        "cluster": int(clusters.set_index("engine_id").loc[worst_id, "cluster"]),
    }


def rul_records(df: pd.DataFrame) -> List[dict]:
    rul, source = models.predict_rul(df)
    out = df[ID_COLS].copy()
    out["predicted_rul"] = rul
    out["model"] = source
    return out.to_dict("records")


def records(h: pd.DataFrame, column: str) -> List[dict]:
    return h[ID_COLS + [column]].round({column: 5}).to_dict("records")


# --------------------------------------------------
# ENDPOINTS
# --------------------------------------------------
@app.get("/")
def root():
    return {"name": "Prognosys API", "version": API_VERSION, "docs": "/docs"}


@app.get("/status")
def model_status():
    return {
        "models_ready": models.ready,
        "lstm_enabled": models.lstm_model is not None,
        "error": models.load_error,
        "trained_at": (models.metrics or {}).get("trained_at"),
    }


@app.post("/analyze")
def analyze(file: UploadFile = File(...)):
    """One-shot analysis used by the dashboard: health, DSI, reliability, RUL, clusters and insights."""
    require_models()
    df = load_csv(file)
    h = health_frame(df)
    clusters = cluster_engines(h)
    return {
        "health": records(h, "health"),
        "dsi": records(h, "DSI"),
        "reliability": records(h, "reliability"),
        "rul": rul_records(df),
        "clusters": clusters.to_dict("records"),
        "insights": build_insights(h, clusters),
    }


@app.post("/predict-health", response_model=List[HealthPredictionItem])
def predict_health(file: UploadFile = File(...)):
    require_models()
    return records(health_frame(load_csv(file)), "health")


@app.post("/predict-rul", response_model=List[RulPredictionItem])
def predict_rul(file: UploadFile = File(...)):
    """RUL for every cycle: LSTM where 20 cycles of history exist (and TensorFlow is available), else Random Forest."""
    require_models()
    return rul_records(load_csv(file))


@app.post("/predict-complete", response_model=CompletePredictionResponse)
def predict_complete(
    file: UploadFile = File(...),
    engine_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Full diagnosis of the latest cycle of one engine (defaults to the first engine). Logged to the database."""
    require_models()
    df = load_csv(file)
    engine_df = select_engine(df, engine_id)
    target_id = int(engine_df["engine_id"].iloc[0])

    h = health_frame(df)
    clusters = cluster_engines(h).set_index("engine_id")
    engine_h = h[h["engine_id"] == target_id]
    health_score = float(engine_h["health"].iloc[-1])

    rul, source = models.predict_rul(engine_df)
    predicted_rul = int(rul[-1])
    reliability = round(float(reliability_from_health(health_score)) * 100.0, 1)
    risk = risk_level(predicted_rul)
    explanation = models.explain(engine_df)

    try:
        db.add(AnalysisHistory(
            engine_id=target_id,
            health_score=health_score,
            predicted_rul=predicted_rul,
            reliability=reliability,
            risk_level=risk,
            filename=file.filename or "upload.csv",
            health_explanation=json.dumps(explanation["health_explanation"]),
            rul_explanation=json.dumps(explanation["rul_explanation"]),
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Database insertion failed: {e}")

    return CompletePredictionResponse(
        engine_id=target_id,
        cycle=int(engine_df["cycle"].iloc[-1]),
        health_score=round(health_score, 4),
        predicted_rul=predicted_rul,
        rul_model=str(source[-1]),
        risk_level=risk,
        reliability=reliability,
        cluster=int(clusters.loc[target_id, "cluster"]),
        **explanation,
    )


@app.post("/explain", response_model=ExplanationResponse)
def explain(file: UploadFile = File(...), engine_id: Optional[int] = Query(None)):
    """Local feature attributions for the latest cycle of one engine."""
    require_models()
    engine_df = select_engine(load_csv(file), engine_id)
    return ExplanationResponse(engine_id=int(engine_df["engine_id"].iloc[0]), **models.explain(engine_df))


def _stats(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    err = y_true - y_pred
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    r2 = 1.0 - float(np.sum(err ** 2)) / ss_tot if ss_tot > 0 else None
    return {
        "mae": round(float(np.mean(np.abs(err))), 4),
        "rmse": round(float(np.sqrt(np.mean(err ** 2))), 4),
        "r2": round(r2, 4) if r2 is not None else None,
        "rows": int(len(y_true)),
    }


@app.post("/evaluate-dataset")
def evaluate_dataset(file: UploadFile = File(...)):
    """
    Scores the models against labels derived from the uploaded file. Only meaningful for
    run-to-failure data: each engine's last row is treated as its failure point.
    """
    require_models()
    df = load_csv(file)
    labels = generate_rul_and_health(df.copy())
    y_health = labels["health_smooth"].to_numpy()
    y_rul = labels["RUL"].to_numpy(dtype=float)

    lstm_pred, pos = models.predict_rul_lstm(df)
    return {
        "dataset_evaluated": True,
        "engine_count": int(df["engine_id"].nunique()),
        "total_rows": int(len(df)),
        "health": _stats(y_health, models.predict_health(df)),
        "rul_rf": _stats(y_rul, models.predict_rul_rf(df)),
        "rul_lstm": _stats(y_rul[pos], lstm_pred) if len(pos) else None,
        "assumption": "Each engine's last row is treated as its failure point (run-to-failure data).",
        "note": "The deployed models are fit on all 100 FD001 training engines, so scores on that data are "
                "in-sample. Use the hold-out benchmark from /metrics for an unbiased estimate.",
    }


@app.get("/metrics")
def get_metrics():
    """Hold-out metrics and global sensor importance written by train_models.py."""
    if not models.metrics:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No training metrics found. Run 'python train_models.py'.")
    return models.metrics


@app.get("/history")
def history(limit: int = Query(20, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.query(AnalysisHistory).order_by(AnalysisHistory.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "engine_id": r.engine_id,
            "filename": r.filename,
            "health_score": r.health_score,
            "predicted_rul": r.predicted_rul,
            "reliability": r.reliability,
            "risk_level": r.risk_level,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in rows
    ]


# --------------------------------------------------
# SINGLE-METRIC ENDPOINTS (subsets of /analyze)
# --------------------------------------------------
@app.post("/health")
def health(file: UploadFile = File(...)):
    require_models()
    return records(health_frame(load_csv(file)), "health")


@app.post("/dsi")
def dsi(file: UploadFile = File(...)):
    require_models()
    return records(health_frame(load_csv(file)), "DSI")


@app.post("/reliability")
def reliability(file: UploadFile = File(...)):
    require_models()
    return records(health_frame(load_csv(file)), "reliability")


@app.post("/clusters")
def clusters(file: UploadFile = File(...)):
    require_models()
    return cluster_engines(health_frame(load_csv(file))).to_dict("records")


@app.post("/insights")
def insights(file: UploadFile = File(...)):
    require_models()
    h = health_frame(load_csv(file))
    return build_insights(h, cluster_engines(h))
