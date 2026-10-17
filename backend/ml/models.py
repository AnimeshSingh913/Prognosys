"""
Loads the trained artifacts once and exposes consistent inference helpers.

Every caller passes a DataFrame that is sorted by (engine_id, cycle) with a fresh
RangeIndex and RAW sensor values; scaling happens here, exactly as in training:
- health: 84 engineered features from raw sensors -> health_scaler -> XGBoost
- RUL:    21 raw sensors -> sensor_scaler -> Random Forest (per row) / LSTM (20-row windows)
"""
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd

from ml.explain import HEALTH_METHOD, RUL_METHOD, explain_health, explain_rul
from ml.preprocessing import RUL_CAP, SENSOR_COLS, SEQ_LEN, build_inference_windows, extract_health_features

MODEL_DIR = Path(__file__).resolve().parent

REQUIRED_ARTIFACTS = [
    "health_xgb.joblib",
    "health_scaler.joblib",
    "rul_rf.joblib",
    "sensor_scaler.joblib",
    "health_features.json",
]
OPTIONAL_ARTIFACTS = ["lstm_rul.keras", "metrics.json"]


def _resolve_artifacts() -> Dict[str, Optional[Path]]:
    """Returns local paths for every artifact, downloading from Hugging Face Hub when HF_MODEL_ID is set."""
    repo_id = os.environ.get("HF_MODEL_ID")
    if not repo_id:
        return {name: (MODEL_DIR / name if (MODEL_DIR / name).exists() else None)
                for name in REQUIRED_ARTIFACTS + OPTIONAL_ARTIFACTS}

    from huggingface_hub import hf_hub_download

    token = os.environ.get("HF_TOKEN")
    paths: Dict[str, Optional[Path]] = {}
    for name in REQUIRED_ARTIFACTS + OPTIONAL_ARTIFACTS:
        try:
            paths[name] = Path(hf_hub_download(repo_id=repo_id, filename=name, token=token))
        except Exception as e:
            print(f"Could not download {name} from {repo_id}: {e}")
            paths[name] = None
    return paths


class ModelBundle:
    def __init__(self):
        self.health_model = None
        self.health_scaler = None
        self.rul_model = None
        self.sensor_scaler = None
        self.lstm_model = None
        self.health_features: List[str] = []
        self.metrics: Optional[dict] = None
        self.load_error: Optional[str] = None

    @classmethod
    def load(cls) -> "ModelBundle":
        bundle = cls()
        paths = _resolve_artifacts()

        missing = [name for name in REQUIRED_ARTIFACTS if paths.get(name) is None]
        if missing:
            bundle.load_error = f"Missing model artifacts: {', '.join(missing)}. Run 'python train_models.py'."
            print(bundle.load_error)
            return bundle

        try:
            bundle.health_model = joblib.load(paths["health_xgb.joblib"])
            bundle.health_scaler = joblib.load(paths["health_scaler.joblib"])
            bundle.rul_model = joblib.load(paths["rul_rf.joblib"])
            bundle.sensor_scaler = joblib.load(paths["sensor_scaler.joblib"])
            bundle.health_features = json.loads(paths["health_features.json"].read_text())
        except Exception as e:
            bundle.load_error = f"Failed to load model artifacts: {e}"
            print(bundle.load_error)
            return bundle

        if paths.get("metrics.json"):
            bundle.metrics = json.loads(paths["metrics.json"].read_text())

        if paths.get("lstm_rul.keras"):
            try:
                from tensorflow.keras.models import load_model
                bundle.lstm_model = load_model(paths["lstm_rul.keras"])
            except ImportError:
                print("TensorFlow is not installed; RUL will use the Random Forest model only.")
            except Exception as e:
                print(f"Could not load LSTM model ({e}); RUL will use the Random Forest model only.")

        print(f"Models loaded (LSTM {'enabled' if bundle.lstm_model is not None else 'disabled'}).")
        return bundle

    @property
    def ready(self) -> bool:
        return self.load_error is None and self.health_model is not None

    # ---------------- inference ----------------

    def _health_matrix(self, df: pd.DataFrame) -> np.ndarray:
        feat_df, feat_cols = extract_health_features(df, SENSOR_COLS)
        if feat_cols != self.health_features:
            raise RuntimeError("Health feature layout does not match the trained model; retrain the models.")
        return self.health_scaler.transform(feat_df[feat_cols].to_numpy(dtype=float))

    def predict_health(self, df: pd.DataFrame) -> np.ndarray:
        X = self._health_matrix(df)
        return np.clip(self.health_model.predict(X).astype(np.float64), 0.0, 1.0)

    def _scaled_sensors(self, df: pd.DataFrame) -> np.ndarray:
        return self.sensor_scaler.transform(df[SENSOR_COLS].to_numpy(dtype=float))

    def predict_rul_rf(self, df: pd.DataFrame) -> np.ndarray:
        return np.clip(self.rul_model.predict(self._scaled_sensors(df)), 0, RUL_CAP)

    def predict_rul_lstm(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        LSTM predictions for every row with at least SEQ_LEN cycles of history (including
        itself). Returns (predictions, row positions); both are empty without an LSTM.
        """
        if self.lstm_model is None:
            return np.empty(0), np.empty(0, dtype=int)
        X = self._scaled_sensors(df)
        windows, positions = [], []
        for idx in df.groupby("engine_id", sort=False).indices.values():
            w, p = build_inference_windows(X[idx], SEQ_LEN)
            if len(p):
                windows.append(w)
                positions.append(idx[p])
        if not windows:
            return np.empty(0), np.empty(0, dtype=int)
        preds = self.lstm_model.predict(np.concatenate(windows), batch_size=512, verbose=0).ravel()
        return np.clip(preds, 0, RUL_CAP), np.concatenate(positions)

    def predict_rul(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Returns (rul, source) for every row: the LSTM where a full window exists and the
        LSTM is loaded, the Random Forest everywhere else.
        """
        rul = self.predict_rul_rf(df)
        source = np.full(len(df), "rf", dtype=object)
        lstm_pred, pos = self.predict_rul_lstm(df)
        rul[pos] = lstm_pred
        source[pos] = "lstm"
        return np.round(rul).astype(int), source

    def explain(self, engine_df: pd.DataFrame, k: int = 5) -> dict:
        """Explains the latest cycle of a single engine (engine_df sorted by cycle)."""
        X_health = self._health_matrix(engine_df)
        X_sensors = self._scaled_sensors(engine_df)
        return {
            "health_explanation": explain_health(self.health_model, X_health[-1], self.health_features, k),
            "rul_explanation": explain_rul(self.rul_model, X_sensors[-1], SENSOR_COLS, k),
            "health_method": HEALTH_METHOD,
            "rul_method": RUL_METHOD,
        }
