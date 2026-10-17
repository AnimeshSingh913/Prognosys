"""
Prognosys model training pipeline (NASA C-MAPSS FD001).

Usage:
    python train_models.py            # health + RF RUL + LSTM RUL
    python train_models.py --no-lstm  # skip the LSTM (no TensorFlow needed)

All reported metrics are computed on engines held out from training
(80/20 split by engine_id), plus a 5-fold GroupKFold CV for the health model.
Final artifacts are then refit on all engines.
"""
import argparse
import datetime
import json
from pathlib import Path

import joblib
import numpy as np
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import MinMaxScaler

from ml.explain import aggregate_by_sensor, health_contributions, rf_path_contributions
from ml.preprocessing import (
    RUL_CAP,
    SENSOR_COLS,
    SEQ_LEN,
    extract_health_features,
    generate_lstm_sequences,
    generate_rul_and_health,
    load_cmapss_data,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"
MODEL_DIR = BASE_DIR / "ml"
SEED = 42
DEGRADING_U = 0.65  # life fraction above which an engine is in the "degrading regime"

XGB_PARAMS = dict(
    n_estimators=200, max_depth=6, learning_rate=0.03,
    subsample=1.0, colsample_bytree=0.8, random_state=SEED, n_jobs=-1,
    objective="reg:squarederror",
)
RF_PARAMS = dict(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=SEED, n_jobs=-1)


def regression_stats(y_true, y_pred) -> dict:
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
    }


def fit_health(X_train, y_train):
    scaler = MinMaxScaler()
    model = xgb.XGBRegressor(**XGB_PARAMS)
    model.fit(scaler.fit_transform(X_train), y_train)
    return scaler, model


def build_lstm(n_features: int):
    from tensorflow.keras.layers import LSTM, Dense, Input, Rescaling
    from tensorflow.keras.models import Sequential

    # The network learns RUL as a 0-1 fraction of RUL_CAP; Rescaling turns it back into
    # cycles. Without this the raw 0-125 target stalls training at the mean prediction.
    model = Sequential([
        Input(shape=(SEQ_LEN, n_features)),
        LSTM(128, return_sequences=True),
        LSTM(64),
        Dense(32, activation="relu"),
        Dense(1),
        Rescaling(float(RUL_CAP)),
    ])
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    return model


def ranked(importance: dict) -> list:
    total = sum(importance.values()) or 1.0
    rows = [{"sensor": s, "importance": round(v / total, 4)} for s, v in importance.items()]
    return sorted(rows, key=lambda r: r["importance"], reverse=True)


def main(train_lstm: bool):
    print("Starting Prognosys model training pipeline...")
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"NASA C-MAPSS training data not found at {DATA_PATH}")
    MODEL_DIR.mkdir(exist_ok=True)
    np.random.seed(SEED)

    df = generate_rul_and_health(load_cmapss_data(str(DATA_PATH)))
    df = df.sort_values(["engine_id", "cycle"]).reset_index(drop=True)

    engine_ids = df["engine_id"].unique()
    rng = np.random.default_rng(SEED)
    rng.shuffle(engine_ids)
    split_idx = int(len(engine_ids) * 0.8)
    train_engines, test_engines = engine_ids[:split_idx], engine_ids[split_idx:]
    train_mask = df["engine_id"].isin(train_engines).to_numpy()
    test_mask = ~train_mask
    print(f"Hold-out split: {len(train_engines)} training engines, {len(test_engines)} test engines")

    # ---------------- Health model (XGBoost, 84 features from RAW sensors) ----------------
    feat_df, feat_cols = extract_health_features(df, SENSOR_COLS)
    X_feat = feat_df[feat_cols].to_numpy(dtype=float)
    y_health = feat_df["health_smooth"].to_numpy()
    u = feat_df["life_fraction"].to_numpy()
    groups = feat_df["engine_id"].to_numpy()

    print("Training health model (XGBoost, 84 features)...")
    health_scaler, health_model = fit_health(X_feat[train_mask], y_health[train_mask])
    X_health_test = health_scaler.transform(X_feat[test_mask])
    health_pred = np.clip(health_model.predict(X_health_test), 0.0, 1.0)
    deg = u[test_mask] > DEGRADING_U
    metrics_health = regression_stats(y_health[test_mask], health_pred)
    deg_stats = regression_stats(y_health[test_mask][deg], health_pred[deg])
    metrics_health.update({f"degrading_regime_{k}": v for k, v in deg_stats.items()})

    print("Running 5-fold GroupKFold CV for the health model...")
    cv_scores = []
    for fold, (tr, te) in enumerate(GroupKFold(n_splits=5).split(X_feat, y_health, groups), start=1):
        sc, m = fit_health(X_feat[tr], y_health[tr])
        pred = np.clip(m.predict(sc.transform(X_feat[te])), 0.0, 1.0)
        d = u[te] > DEGRADING_U
        cv_scores.append(float(r2_score(y_health[te][d], pred[d])))
        print(f"  fold {fold}: degrading-regime R2 = {cv_scores[-1]:.4f}")
    metrics_health.update({
        "cv_degrading_regime_r2_mean": float(np.mean(cv_scores)),
        "cv_degrading_regime_r2_std": float(np.std(cv_scores)),
        "feature_count": len(feat_cols),
        "model_type": "XGBoost Regressor (n_estimators=200, max_depth=6, lr=0.03)",
        "target": "Smooth degradation curve: 1.0 until 40% of life, then 1 - ((u-0.4)/0.6)^1.8",
    })

    # ---------------- RUL Random Forest (21 scaled sensors) ----------------
    print("Training Random Forest RUL model...")
    sensor_scaler = MinMaxScaler()
    X_sensor_train = sensor_scaler.fit_transform(df.loc[train_mask, SENSOR_COLS].to_numpy(dtype=float))
    X_sensor_test = sensor_scaler.transform(df.loc[test_mask, SENSOR_COLS].to_numpy(dtype=float))
    y_rul = df["RUL"].to_numpy(dtype=float)
    rul_model = RandomForestRegressor(**RF_PARAMS).fit(X_sensor_train, y_rul[train_mask])
    metrics_rul_rf = regression_stats(y_rul[test_mask], rul_model.predict(X_sensor_test))
    metrics_rul_rf["model_type"] = "RandomForestRegressor (n_estimators=100, max_depth=12)"

    # ---------------- Global sensor importance (held-out engines) ----------------
    print("Computing global sensor importance on held-out engines...")
    health_contribs = np.abs(health_contributions(health_model, X_health_test, feat_cols)).mean(axis=0)
    sample = rng.choice(len(X_sensor_test), size=min(500, len(X_sensor_test)), replace=False)
    rul_contribs = np.mean([np.abs(rf_path_contributions(rul_model, X_sensor_test[i])) for i in sample], axis=0)
    sensor_importance = {
        "health": ranked(aggregate_by_sensor(health_contribs, feat_cols)),
        "rul": ranked(dict(zip(SENSOR_COLS, rul_contribs))),
    }

    # ---------------- LSTM RUL ----------------
    metrics_rul_lstm = None
    full_scaler = MinMaxScaler().fit(df[SENSOR_COLS].to_numpy(dtype=float))
    if train_lstm:
        import tensorflow as tf
        from tensorflow.keras.callbacks import EarlyStopping

        tf.keras.utils.set_random_seed(SEED)
        scaled = df.copy()
        scaled[SENSOR_COLS] = scaled[SENSOR_COLS].astype(float)
        scaled.loc[train_mask, SENSOR_COLS] = X_sensor_train
        scaled.loc[test_mask, SENSOR_COLS] = X_sensor_test
        X_seq_train, y_seq_train = generate_lstm_sequences(scaled[train_mask], SENSOR_COLS, SEQ_LEN)
        X_seq_test, y_seq_test = generate_lstm_sequences(scaled[test_mask], SENSOR_COLS, SEQ_LEN)

        print(f"Training LSTM on {len(X_seq_train)} windows (evaluation run)...")
        lstm = build_lstm(len(SENSOR_COLS))
        early_stop = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True, verbose=1)
        history = lstm.fit(X_seq_train, y_seq_train, validation_split=0.15, epochs=30,
                           batch_size=64, callbacks=[early_stop], verbose=2)
        best_epochs = int(np.argmin(history.history["val_loss"]) + 1)
        lstm_pred = np.clip(lstm.predict(X_seq_test, verbose=0).ravel(), 0, RUL_CAP)
        metrics_rul_lstm = regression_stats(y_seq_test, lstm_pred)
        metrics_rul_lstm.update({"model_type": "LSTM(128) -> LSTM(64) -> Dense(32) -> Dense(1)",
                                 "sequence_length": SEQ_LEN, "epochs": best_epochs})

        # Refit on all engines with the same scaler that inference uses
        print(f"Refitting LSTM on all engines for {best_epochs} epochs...")
        tf.keras.utils.set_random_seed(SEED)
        scaled_full = df.copy()
        scaled_full[SENSOR_COLS] = full_scaler.transform(df[SENSOR_COLS].to_numpy(dtype=float))
        X_seq_full, y_seq_full = generate_lstm_sequences(scaled_full, SENSOR_COLS, SEQ_LEN)
        final_lstm = build_lstm(len(SENSOR_COLS))
        final_lstm.fit(X_seq_full, y_seq_full, epochs=best_epochs, batch_size=64, verbose=2)
        final_lstm.save(MODEL_DIR / "lstm_rul.keras")
    else:
        print("Skipping LSTM (--no-lstm).")
        (MODEL_DIR / "lstm_rul.keras").unlink(missing_ok=True)

    # ---------------- Final refit on all engines ----------------
    print("Refitting health and RF RUL models on all engines...")
    final_health_scaler, final_health_model = fit_health(X_feat, y_health)
    final_rul_model = RandomForestRegressor(**RF_PARAMS).fit(
        full_scaler.transform(df[SENSOR_COLS].to_numpy(dtype=float)), y_rul)

    joblib.dump(final_health_model, MODEL_DIR / "health_xgb.joblib")
    joblib.dump(final_health_scaler, MODEL_DIR / "health_scaler.joblib")
    joblib.dump(final_rul_model, MODEL_DIR / "rul_rf.joblib")
    joblib.dump(full_scaler, MODEL_DIR / "sensor_scaler.joblib")
    (MODEL_DIR / "health_features.json").write_text(json.dumps(feat_cols, indent=2))

    metrics = {
        "health": metrics_health,
        "rul_rf": metrics_rul_rf,
        "rul_lstm": metrics_rul_lstm,
        "sensor_importance": sensor_importance,
        "dataset": {
            "name": "NASA C-MAPSS FD001",
            "engines": int(len(engine_ids)),
            "train_engines": int(len(train_engines)),
            "test_engines": int(len(test_engines)),
            "rows": int(len(df)),
            "rul_cap": RUL_CAP,
        },
        "trained_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    }
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE (metrics on held-out engines)")
    print("=" * 60)
    print(f"Health (all cycles): MAE={metrics_health['mae']:.4f}  RMSE={metrics_health['rmse']:.4f}  R2={metrics_health['r2']:.4f}")
    print(f"Health (degrading):  MAE={metrics_health['degrading_regime_mae']:.4f}  R2={metrics_health['degrading_regime_r2']:.4f}")
    print(f"Health 5-fold CV degrading R2: {metrics_health['cv_degrading_regime_r2_mean']:.4f} +/- {metrics_health['cv_degrading_regime_r2_std']:.4f}")
    print(f"RUL Random Forest:   MAE={metrics_rul_rf['mae']:.2f}  RMSE={metrics_rul_rf['rmse']:.2f}  R2={metrics_rul_rf['r2']:.3f}")
    if metrics_rul_lstm:
        print(f"RUL LSTM:            MAE={metrics_rul_lstm['mae']:.2f}  RMSE={metrics_rul_lstm['rmse']:.2f}  R2={metrics_rul_lstm['r2']:.3f}")
    print(f"Artifacts saved in {MODEL_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the Prognosys models.")
    parser.add_argument("--no-lstm", action="store_true", help="Skip LSTM training (no TensorFlow required).")
    args = parser.parse_args()
    main(train_lstm=not args.no_lstm)
