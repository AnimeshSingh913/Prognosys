import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, List

from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV

import xgboost as xgb

OUT_DIR = Path(__file__).resolve().parent
BASE_DIR = OUT_DIR.parent  # backend/
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"

sys.path.append(str(BASE_DIR))
from ml.preprocessing import load_cmapss_data, generate_rul_and_health

def run_audit():
    print("=" * 70)
    print("RUNNING HEALTH MODEL AUDIT: LEAKAGE & ROBUSTNESS VERIFICATION")
    print("=" * 70)
    
    # 1. Load data
    df = load_cmapss_data(str(DATA_PATH))
    df = generate_rul_and_health(df)
    
    # -------------------------------------------------------------------------
    # STEP 1: Verify Train/Test Split Methodology
    # -------------------------------------------------------------------------
    print("\n[STEP 1] Inspecting Split Methodology...")
    engine_ids = df["engine_id"].unique()
    np.random.seed(42)
    shuffled_engines = engine_ids.copy()
    np.random.shuffle(shuffled_engines)
    
    split_idx = int(len(shuffled_engines) * 0.8)
    train_engines = shuffled_engines[:split_idx]
    test_engines = shuffled_engines[split_idx:]
    
    # Evidence checks:
    overlap = set(train_engines).intersection(set(test_engines))
    print(f"Total engines: {len(engine_ids)}")
    print(f"Train engines: {len(train_engines)} engines: {train_engines[:5]}...")
    print(f"Test engines: {len(test_engines)} engines: {test_engines[:5]}...")
    print(f"Engine overlap between Train and Test: {len(overlap)} (Must be 0)")
    
    train_df_raw = df[df["engine_id"].isin(train_engines)].copy()
    test_df_raw = df[df["engine_id"].isin(test_engines)].copy()
    print(f"Train rows: {len(train_df_raw)}, Test rows: {len(test_df_raw)}")
    
    # -------------------------------------------------------------------------
    # STEP 2: Audit current_cycle as a Feature for Label Leakage
    # -------------------------------------------------------------------------
    print("\n[STEP 2] Auditing current_cycle and max_cycle distribution...")
    engine_max_cycles = df.groupby("engine_id")["cycle"].max()
    print(f"max_cycle distribution across all 100 engines in FD001:")
    print(f"  Min:  {engine_max_cycles.min()}")
    print(f"  Max:  {engine_max_cycles.max()}")
    print(f"  Mean: {engine_max_cycles.mean():.2f}")
    print(f"  Std:  {engine_max_cycles.std():.2f}")
    print(f"  25%:  {engine_max_cycles.quantile(0.25):.2f}")
    print(f"  50%:  {engine_max_cycles.median():.2f}")
    print(f"  75%:  {engine_max_cycles.quantile(0.75):.2f}")
    
    # Test: Train model using ONLY current_cycle
    print("\nTraining RandomForest on ONLY current_cycle...")
    X_train_cycle_only = train_df_raw[["cycle"]].values
    X_test_cycle_only = test_df_raw[["cycle"]].values
    y_train = train_df_raw["health"].values
    y_test = test_df_raw["health"].values
    
    rf_cycle_only = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
    rf_cycle_only.fit(X_train_cycle_only, y_train)
    pred_cycle_only = rf_cycle_only.predict(X_test_cycle_only)
    
    mae_cycle = mean_absolute_error(y_test, pred_cycle_only)
    rmse_cycle = np.sqrt(mean_squared_error(y_test, pred_cycle_only))
    r2_cycle = r2_score(y_test, pred_cycle_only)
    print(f"--> [Model with ONLY cycle feature]: MAE: {mae_cycle:.4f} | RMSE: {rmse_cycle:.4f} | R2: {r2_cycle:.4f}")
    
    # -------------------------------------------------------------------------
    # STEP 3: Re-run with a Leakage-Safe Feature Set (NO cycle feature)
    # -------------------------------------------------------------------------
    print("\n[STEP 3] Re-running with Leakage-Safe Features (Strictly Sensor-Derived)...")
    sensor_cols = [c for c in df.columns if c.startswith("sensor")]
    
    def engineer_leakage_safe_features(data: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        data = data.copy()
        data = data.sort_values(["engine_id", "cycle"]).reset_index(drop=True)
        feature_cols = []
        
        for col in sensor_cols:
            # Strictly backward rolling: center=False by default in pandas
            roll_mean_col = f"{col}_roll_mean_5"
            roll_std_col = f"{col}_roll_std_5"
            data[roll_mean_col] = data.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1, center=False).mean())
            data[roll_std_col] = data.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1, center=False).std()).fillna(0.0)
            feature_cols.extend([roll_mean_col, roll_std_col])
            
            # Baseline delta: first cycle of THIS engine
            base = data.groupby("engine_id")[col].transform("first")
            delta_col = f"{col}_delta"
            data[delta_col] = data[col] - base
            feature_cols.append(delta_col)
            
        all_cols = sensor_cols + feature_cols
        return data, all_cols
    
    df_safe, safe_feature_cols = engineer_leakage_safe_features(df)
    print(f"Total safe sensor-derived features: {len(safe_feature_cols)} (NO raw cycle feature)")
    
    train_df_safe = df_safe[df_safe["engine_id"].isin(train_engines)].copy()
    test_df_safe = df_safe[df_safe["engine_id"].isin(test_engines)].copy()
    
    scaler_safe = MinMaxScaler()
    X_train_safe = scaler_safe.fit_transform(train_df_safe[safe_feature_cols].values)
    X_test_safe = scaler_safe.transform(test_df_safe[safe_feature_cols].values)
    
    # 3A. Random Forest on Safe Feature Set
    print("\nEvaluating Random Forest on Leakage-Safe Features (Linear Health)...")
    rf_safe = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
    rf_safe.fit(X_train_safe, y_train)
    pred_rf_safe = rf_safe.predict(X_test_safe)
    
    mae_rf_safe = mean_absolute_error(y_test, pred_rf_safe)
    rmse_rf_safe = np.sqrt(mean_squared_error(y_test, pred_rf_safe))
    r2_rf_safe = r2_score(y_test, pred_rf_safe)
    print(f"--> [RF Safe Features]: MAE: {mae_rf_safe:.4f} | RMSE: {rmse_rf_safe:.4f} | R2: {r2_rf_safe:.4f}")
    
    # 3B. XGBoost on Safe Feature Set
    print("\nEvaluating XGBoost on Leakage-Safe Features (Linear Health)...")
    xgb_safe = xgb.XGBRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.03, 
        subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
        objective="reg:squarederror"
    )
    xgb_safe.fit(X_train_safe, y_train)
    pred_xgb_safe = xgb_safe.predict(X_test_safe)
    
    mae_xgb_safe = mean_absolute_error(y_test, pred_xgb_safe)
    rmse_xgb_safe = np.sqrt(mean_squared_error(y_test, pred_xgb_safe))
    r2_xgb_safe = r2_score(y_test, pred_xgb_safe)
    print(f"--> [XGBoost Safe Features]: MAE: {mae_xgb_safe:.4f} | RMSE: {rmse_xgb_safe:.4f} | R2: {r2_xgb_safe:.4f}")
    
    # -------------------------------------------------------------------------
    # STEP 4: Re-run Piecewise Label Experiment Cleanly (NO cycle feature)
    # -------------------------------------------------------------------------
    print("\n[STEP 4] Evaluating Piecewise Degradation on Leakage-Safe Features...")
    max_c = df_safe.groupby("engine_id")["cycle"].transform("max")
    u = df_safe["cycle"] / max_c
    df_safe["health_pw"] = np.where(u <= 0.65, 1.0, 1.0 - (u - 0.65) / 0.35)
    df_safe["health_pw"] = df_safe["health_pw"].clip(0.0, 1.0)
    
    y_train_pw = df_safe[df_safe["engine_id"].isin(train_engines)]["health_pw"].values
    y_test_pw = df_safe[df_safe["engine_id"].isin(test_engines)]["health_pw"].values
    
    # Retrain XGBoost on safe features with piecewise target
    xgb_pw_safe = xgb.XGBRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.03, 
        subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
        objective="reg:squarederror"
    )
    xgb_pw_safe.fit(X_train_safe, y_train_pw)
    pred_pw_safe = xgb_pw_safe.predict(X_test_safe)
    
    mae_pw_safe = mean_absolute_error(y_test_pw, pred_pw_safe)
    rmse_pw_safe = np.sqrt(mean_squared_error(y_test_pw, pred_pw_safe))
    r2_pw_safe = r2_score(y_test_pw, pred_pw_safe)
    print(f"--> [XGBoost Safe Features on Piecewise Label]: MAE: {mae_pw_safe:.4f} | RMSE: {rmse_pw_safe:.4f} | R2: {r2_pw_safe:.4f}")
    
    # Also Retrain RF on piecewise target
    rf_pw_safe = RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=4, random_state=42, n_jobs=-1)
    rf_pw_safe.fit(X_train_safe, y_train_pw)
    pred_rf_pw_safe = rf_pw_safe.predict(X_test_safe)
    
    mae_rf_pw = mean_absolute_error(y_test_pw, pred_rf_pw_safe)
    rmse_rf_pw = np.sqrt(mean_squared_error(y_test_pw, pred_rf_pw_safe))
    r2_rf_pw = r2_score(y_test_pw, pred_rf_pw_safe)
    print(f"--> [RF Safe Features on Piecewise Label]:      MAE: {mae_rf_pw:.4f} | RMSE: {rmse_rf_pw:.4f} | R2: {r2_rf_pw:.4f}")
    
    # Save audit metrics to JSON
    audit_results = {
        "cycle_only": {"mae": mae_cycle, "rmse": rmse_cycle, "r2": r2_cycle},
        "rf_safe_linear": {"mae": mae_rf_safe, "rmse": rmse_rf_safe, "r2": r2_rf_safe},
        "xgb_safe_linear": {"mae": mae_xgb_safe, "rmse": rmse_xgb_safe, "r2": r2_xgb_safe},
        "rf_safe_pw": {"mae": mae_rf_pw, "rmse": rmse_rf_pw, "r2": r2_rf_pw},
        "xgb_safe_pw": {"mae": mae_pw_safe, "rmse": rmse_pw_safe, "r2": r2_pw_safe}
    }
    with open(OUT_DIR / "audit_results.json", "w") as f:
        json.dump(audit_results, f, indent=4)
        
    print("\n" + "=" * 70)
    print("AUDIT EXECUTION COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    run_audit()
