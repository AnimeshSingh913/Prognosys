import os
import sys
import json
import time
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, List

from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV

import xgboost as xgb
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense
from tensorflow.keras.callbacks import EarlyStopping

# Setup paths
OUT_DIR = Path(__file__).resolve().parent
BASE_DIR = OUT_DIR.parent  # backend/
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"

sys.path.append(str(BASE_DIR))
from ml.preprocessing import load_cmapss_data, generate_rul_and_health

def add_engineered_features(df: pd.DataFrame, sensor_cols: List[str]) -> Tuple[pd.DataFrame, List[str]]:
    """
    Step 1 Feature Engineering:
    - 5-cycle rolling mean & rolling std per sensor (per engine_id)
    - Delta from engine's cycle-1 baseline value
    - current_cycle itself as a raw feature
    """
    df = df.copy()
    df = df.sort_values(["engine_id", "cycle"]).reset_index(drop=True)
    
    engineered_cols = []
    
    print("Engineering rolling features (window=5) and baseline deltas...")
    for col in sensor_cols:
        # Rolling mean & std
        roll_mean_col = f"{col}_roll_mean_5"
        roll_std_col = f"{col}_roll_std_5"
        df[roll_mean_col] = df.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1).mean())
        df[roll_std_col] = df.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1).std()).fillna(0.0)
        engineered_cols.extend([roll_mean_col, roll_std_col])
        
        # Delta from cycle-1 baseline
        base_col = df.groupby("engine_id")[col].transform("first")
        delta_col = f"{col}_delta"
        df[delta_col] = df[col] - base_col
        engineered_cols.append(delta_col)
        
    # Raw cycle feature
    engineered_cols.append("cycle")
    
    all_features = sensor_cols + engineered_cols
    print(f"Total features after engineering: {len(all_features)} (from original {len(sensor_cols)})")
    return df, all_features

def generate_lstm_health_sequences(
    df: pd.DataFrame, 
    sensor_cols: List[str], 
    target_col: str = "health",
    seq_len: int = 20
) -> Tuple[np.ndarray, np.ndarray]:
    sequences = []
    targets = []
    
    for _, group in df.groupby("engine_id"):
        group = group.sort_values("cycle")
        sensors = group[sensor_cols].values
        health_vals = group[target_col].values
        
        for i in range(len(group) - seq_len):
            sequences.append(sensors[i : i + seq_len])
            targets.append(health_vals[i + seq_len])
            
    return np.array(sequences), np.array(targets)

def compute_piecewise_health(df: pd.DataFrame, threshold: float = 0.65) -> pd.Series:
    """
    Piecewise degradation:
    Health stays at 1.0 for first 65% of life (u <= 0.65),
    then linearly decays from 1.0 to 0.0 over the remaining 35% of life.
    """
    max_cycles = df.groupby("engine_id")["cycle"].transform("max")
    u = df["cycle"] / max_cycles
    
    # Piecewise formula
    health_pw = np.where(u <= threshold, 1.0, 1.0 - (u - threshold) / (1.0 - threshold))
    return pd.Series(np.clip(health_pw, 0.0, 1.0), index=df.index)

def print_metrics(name: str, y_true: np.ndarray, y_pred: np.ndarray):
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    print(f"[{name}] MAE: {mae:.4f} | RMSE: {rmse:.4f} | R2: {r2:.4f}")
    return {"mae": mae, "rmse": rmse, "r2": r2}

def run_all_experiments():
    print("=" * 60)
    print("STARTING HEALTH MODEL PERFORMANCE EXPERIMENTS")
    print("=" * 60)
    
    df_raw = load_cmapss_data(str(DATA_PATH))
    df_raw = generate_rul_and_health(df_raw)
    
    sensor_cols = [c for c in df_raw.columns if c.startswith("sensor")]
    
    # Fixed Train / Test split matching train_models.py
    engine_ids = df_raw["engine_id"].unique()
    np.random.seed(42)
    np.random.shuffle(engine_ids)
    
    split_idx = int(len(engine_ids) * 0.8)
    train_engines = engine_ids[:split_idx]
    test_engines = engine_ids[split_idx:]
    
    print(f"Train engines: {len(train_engines)}, Test engines: {len(test_engines)}")
    
    # Baseline Model (Replication)
    train_df_base = df_raw[df_raw["engine_id"].isin(train_engines)].copy()
    test_df_base = df_raw[df_raw["engine_id"].isin(test_engines)].copy()
    
    scaler_base = MinMaxScaler()
    X_train_base = scaler_base.fit_transform(train_df_base[sensor_cols].values)
    X_test_base = scaler_base.transform(test_df_base[sensor_cols].values)
    y_train_base = train_df_base["health"].values
    y_test_base = test_df_base["health"].values
    
    print("\n--- BASELINE: RF Health on 21 Raw Sensors ---")
    rf_baseline = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
    rf_baseline.fit(X_train_base, y_train_base)
    pred_base = rf_baseline.predict(X_test_base)
    base_metrics = print_metrics("Baseline RF", y_test_base, pred_base)
    
    # =========================================================================
    # STEP 1: Engineered Features
    # =========================================================================
    print("\n" + "=" * 60)
    print("STEP 1: Random Forest with Engineered Features")
    print("=" * 60)
    df_eng, all_feature_cols = add_engineered_features(df_raw, sensor_cols)
    
    train_df_eng = df_eng[df_eng["engine_id"].isin(train_engines)].copy()
    test_df_eng = df_eng[df_eng["engine_id"].isin(test_engines)].copy()
    
    scaler_eng = MinMaxScaler()
    X_train_eng = scaler_eng.fit_transform(train_df_eng[all_feature_cols].values)
    X_test_eng = scaler_eng.transform(test_df_eng[all_feature_cols].values)
    
    rf_step1 = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
    rf_step1.fit(X_train_eng, y_train_base)
    pred_step1 = rf_step1.predict(X_test_eng)
    step1_metrics = print_metrics("Step 1 - RF with Engineered Features", y_test_base, pred_step1)
    
    # =========================================================================
    # STEP 2: Gradient Boosting (XGBoost)
    # =========================================================================
    print("\n" + "=" * 60)
    print("STEP 2: XGBoost with Hyperparameter Search")
    print("=" * 60)
    xgb_base = xgb.XGBRegressor(random_state=42, n_jobs=-1, objective="reg:squarederror")
    param_dist = {
        "n_estimators": [100, 200, 300],
        "max_depth": [4, 6, 8, 10],
        "learning_rate": [0.03, 0.05, 0.1, 0.2],
        "subsample": [0.8, 1.0],
        "colsample_bytree": [0.8, 1.0]
    }
    
    cv_search = RandomizedSearchCV(
        estimator=xgb_base,
        param_distributions=param_dist,
        n_iter=10,
        cv=3,
        scoring="neg_mean_squared_error",
        random_state=42,
        n_jobs=-1,
        verbose=1
    )
    
    print("Running 3-fold CV Randomized Search for XGBoost...")
    cv_search.fit(X_train_eng, y_train_base)
    best_xgb = cv_search.best_estimator_
    print(f"Best XGBoost Params: {cv_search.best_params_}")
    
    pred_step2 = best_xgb.predict(X_test_eng)
    step2_metrics = print_metrics("Step 2 - Tuned XGBoost", y_test_base, pred_step2)
    
    # =========================================================================
    # STEP 3: LSTM Health Model
    # =========================================================================
    print("\n" + "=" * 60)
    print("STEP 3: LSTM Health Model (20-cycle sliding window)")
    print("=" * 60)
    # Use scaled raw sensors for LSTM as per lstm_rul architecture
    train_df_lstm = train_df_base.copy()
    test_df_lstm = test_df_base.copy()
    train_df_lstm[sensor_cols] = X_train_base
    test_df_lstm[sensor_cols] = X_test_base
    
    SEQ_LEN = 20
    X_seq_train, y_seq_train = generate_lstm_health_sequences(train_df_lstm, sensor_cols, "health", SEQ_LEN)
    X_seq_test, y_seq_test = generate_lstm_health_sequences(test_df_lstm, sensor_cols, "health", SEQ_LEN)
    print(f"LSTM Sequences shape - Train: {X_seq_train.shape}, Test: {X_seq_test.shape}")
    
    lstm_health_model = Sequential([
        LSTM(128, return_sequences=True, input_shape=(SEQ_LEN, len(sensor_cols))),
        LSTM(64),
        Dense(32, activation="relu"),
        Dense(1, activation="sigmoid")  # bounded [0, 1]
    ])
    
    lstm_health_model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    early_stop = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True, verbose=1)
    
    print("Fitting LSTM Health model...")
    lstm_health_model.fit(
        X_seq_train, y_seq_train,
        validation_split=0.15,
        epochs=15,
        batch_size=64,
        callbacks=[early_stop],
        verbose=1
    )
    
    pred_step3 = lstm_health_model.predict(X_seq_test).flatten()
    step3_metrics = print_metrics("Step 3 - LSTM Health", y_seq_test, pred_step3)
    
    # =========================================================================
    # STEP 4: Nonlinear / Piecewise Health Label
    # =========================================================================
    print("\n" + "=" * 60)
    print("STEP 4: Nonlinear / Piecewise Health Label (threshold=0.65)")
    print("=" * 60)
    df_raw["health_pw"] = compute_piecewise_health(df_raw, threshold=0.65)
    df_eng["health_pw"] = df_raw["health_pw"]
    
    train_df_eng_pw = df_eng[df_eng["engine_id"].isin(train_engines)].copy()
    test_df_eng_pw = df_eng[df_eng["engine_id"].isin(test_engines)].copy()
    y_train_pw = train_df_eng_pw["health_pw"].values
    y_test_pw = test_df_eng_pw["health_pw"].values
    
    # Determine best model architecture from Steps 1-3 on linear health:
    # Compare step1 (RF), step2 (XGB), step3 (LSTM)
    models_scores = {
        "RandomForest": step1_metrics["r2"],
        "XGBoost": step2_metrics["r2"],
        "LSTM": step3_metrics["r2"]
    }
    best_model_name = max(models_scores, key=models_scores.get)
    print(f"Top model from Steps 1-3 is: {best_model_name} (R2={models_scores[best_model_name]:.4f})")
    
    if best_model_name == "RandomForest":
        model_pw = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
        model_pw.fit(X_train_eng, y_train_pw)
        pred_step4 = model_pw.predict(X_test_eng)
    elif best_model_name == "XGBoost":
        model_pw = xgb.XGBRegressor(**cv_search.best_params_, random_state=42, n_jobs=-1, objective="reg:squarederror")
        model_pw.fit(X_train_eng, y_train_pw)
        pred_step4 = model_pw.predict(X_test_eng)
    else:
        # LSTM on piecewise
        train_df_lstm_pw = train_df_lstm.copy()
        test_df_lstm_pw = test_df_lstm.copy()
        train_df_lstm_pw["health_pw"] = y_train_pw
        test_df_lstm_pw["health_pw"] = y_test_pw
        X_seq_tr_pw, y_seq_tr_pw = generate_lstm_health_sequences(train_df_lstm_pw, sensor_cols, "health_pw", SEQ_LEN)
        X_seq_te_pw, y_seq_te_pw = generate_lstm_health_sequences(test_df_lstm_pw, sensor_cols, "health_pw", SEQ_LEN)
        
        lstm_pw = Sequential([
            LSTM(128, return_sequences=True, input_shape=(SEQ_LEN, len(sensor_cols))),
            LSTM(64),
            Dense(32, activation="relu"),
            Dense(1, activation="sigmoid")
        ])
        lstm_pw.compile(optimizer="adam", loss="mse", metrics=["mae"])
        lstm_pw.fit(X_seq_tr_pw, y_seq_tr_pw, validation_split=0.15, epochs=15, batch_size=64, callbacks=[early_stop], verbose=1)
        pred_step4 = lstm_pw.predict(X_seq_te_pw).flatten()
        y_test_pw = y_seq_te_pw
        
    step4_metrics = print_metrics(f"Step 4 - {best_model_name} on Piecewise Label", y_test_pw, pred_step4)
    
    # Summary JSON output
    results = {
        "baseline": base_metrics,
        "step1_rf_features": step1_metrics,
        "step2_xgboost": step2_metrics,
        "step3_lstm": step3_metrics,
        "step4_piecewise": step4_metrics,
        "best_model_type": best_model_name
    }
    
    with open(OUT_DIR / "experiment_results.json", "w") as f:
        json.dump(results, f, indent=4)
        
    print("\n" + "=" * 60)
    print("ALL EXPERIMENTS COMPLETE - RESULTS SAVED TO experiment_results.json")
    print("=" * 60)

if __name__ == "__main__":
    run_all_experiments()
