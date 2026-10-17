import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, List

from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import xgboost as xgb

OUT_DIR = Path(__file__).resolve().parent
BASE_DIR = OUT_DIR.parent  # backend/
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"

sys.path.append(str(BASE_DIR))
from ml.preprocessing import load_cmapss_data, generate_rul_and_health

def run_deep_verifications():
    print("=" * 80)
    print("STARTING INDEPENDENT VERIFICATION SUITE (3 TASKS)")
    print("=" * 80)
    
    # 1. Load data
    df = load_cmapss_data(str(DATA_PATH))
    df = generate_rul_and_health(df)
    
    sensor_cols = [c for c in df.columns if c.startswith("sensor")]
    
    # Precompute life fraction u = cycle / max_cycle per engine
    max_c = df.groupby("engine_id")["cycle"].transform("max")
    df["u"] = df["cycle"] / max_c
    df["health_linear"] = df["health"]
    df["health_pw"] = np.where(df["u"] <= 0.65, 1.0, 1.0 - (df["u"] - 0.65) / 0.35).clip(0.0, 1.0)
    
    # Build 84 leakage-safe features (strictly sensor-derived)
    df_sorted = df.sort_values(["engine_id", "cycle"]).reset_index(drop=True)
    feature_cols = []
    for col in sensor_cols:
        roll_mean = f"{col}_roll_mean_5"
        roll_std = f"{col}_roll_std_5"
        df_sorted[roll_mean] = df_sorted.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1, center=False).mean())
        df_sorted[roll_std] = df_sorted.groupby("engine_id")[col].transform(lambda s: s.rolling(5, min_periods=1, center=False).std()).fillna(0.0)
        feature_cols.extend([roll_mean, roll_std])
        
        base = df_sorted.groupby("engine_id")[col].transform("first")
        delta = f"{col}_delta"
        df_sorted[delta] = df_sorted[col] - base
        feature_cols.append(delta)
        
    all_features = sensor_cols + feature_cols
    
    # =========================================================================
    # TASK 1: 5-Fold GroupKFold Cross-Validation (by engine_id)
    # =========================================================================
    print("\n" + "=" * 80)
    print("TASK 1: 5-Fold GroupKFold Cross-Validation on Degrading Regime (u > 0.65)")
    print("=" * 80)
    
    gkf = GroupKFold(n_splits=5)
    groups = df_sorted["engine_id"].values
    
    pw_r2_scores = []
    linear_r2_scores = []
    pw_mae_scores = []
    linear_mae_scores = []
    
    fold = 1
    for train_idx, val_idx in gkf.split(df_sorted, groups=groups):
        train_data = df_sorted.iloc[train_idx]
        val_data = df_sorted.iloc[val_idx]
        
        # Confirm no engine leakage
        tr_eng = set(train_data["engine_id"].unique())
        val_eng = set(val_data["engine_id"].unique())
        assert len(tr_eng.intersection(val_eng)) == 0, f"Engine leak in fold {fold}!"
        
        scaler = MinMaxScaler()
        X_tr = scaler.fit_transform(train_data[all_features].values)
        X_val = scaler.transform(val_data[all_features].values)
        
        y_tr_pw = train_data["health_pw"].values
        y_val_pw = val_data["health_pw"].values
        
        y_tr_lin = train_data["health_linear"].values
        y_val_lin = val_data["health_linear"].values
        
        # Piecewise model
        xgb_pw = xgb.XGBRegressor(
            n_estimators=200, max_depth=6, learning_rate=0.03,
            subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
            objective="reg:squarederror"
        )
        xgb_pw.fit(X_tr, y_tr_pw)
        pred_pw = xgb_pw.predict(X_val)
        
        # Linear model
        xgb_lin = xgb.XGBRegressor(
            n_estimators=200, max_depth=6, learning_rate=0.03,
            subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
            objective="reg:squarederror"
        )
        xgb_lin.fit(X_tr, y_tr_lin)
        pred_lin = xgb_lin.predict(X_val)
        
        # Filter strictly for degrading regime in validation set: u > 0.65
        deg_mask_val = val_data["u"].values > 0.65
        n_deg_val = np.sum(deg_mask_val)
        
        r2_pw_fold = r2_score(y_val_pw[deg_mask_val], pred_pw[deg_mask_val])
        r2_lin_fold = r2_score(y_val_lin[deg_mask_val], pred_lin[deg_mask_val])
        mae_pw_fold = mean_absolute_error(y_val_pw[deg_mask_val], pred_pw[deg_mask_val])
        mae_lin_fold = mean_absolute_error(y_val_lin[deg_mask_val], pred_lin[deg_mask_val])
        
        pw_r2_scores.append(r2_pw_fold)
        linear_r2_scores.append(r2_lin_fold)
        pw_mae_scores.append(mae_pw_fold)
        linear_mae_scores.append(mae_lin_fold)
        
        print(f"Fold {fold} ({len(val_eng)} engines, {n_deg_val} deg cycles): "
              f"Piecewise R2 = {r2_pw_fold:.4f} (MAE={mae_pw_fold:.4f}) | "
              f"Linear R2 = {r2_lin_fold:.4f} (MAE={mae_lin_fold:.4f}) | "
              f"Gap = +{r2_pw_fold - r2_lin_fold:.4f}")
        fold += 1
        
    pw_r2_mean = np.mean(pw_r2_scores)
    pw_r2_std = np.std(pw_r2_scores)
    lin_r2_mean = np.mean(linear_r2_scores)
    lin_r2_std = np.std(linear_r2_scores)
    
    print("-" * 80)
    print(f"Piecewise Degrading R2: Mean = {pw_r2_mean:.4f}, Std = {pw_r2_std:.4f}")
    print(f"Linear Degrading R2:    Mean = {lin_r2_mean:.4f}, Std = {lin_r2_std:.4f}")
    print(f"Consistent Gap:         +{pw_r2_mean - lin_r2_mean:.4f}")
    print("-" * 80)

    # =========================================================================
    # TASK 2: Direct Sensor Flatness Check (CV = std / mean)
    # =========================================================================
    print("\n" + "=" * 80)
    print("TASK 2: Direct Sensor Flatness Check (u <= 0.65 vs u > 0.65)")
    print("=" * 80)
    
    flat_df = df[df["u"] <= 0.65]
    deg_df = df[df["u"] > 0.65]
    
    sensor_stats = []
    for col in sensor_cols:
        # Per engine stats
        flat_std = flat_df.groupby("engine_id")[col].std().mean()
        flat_mean = flat_df.groupby("engine_id")[col].mean().abs().mean()
        flat_cv = flat_std / flat_mean if flat_mean > 1e-6 else 0.0
        
        deg_std = deg_df.groupby("engine_id")[col].std().mean()
        deg_mean = deg_df.groupby("engine_id")[col].mean().abs().mean()
        deg_cv = deg_std / deg_mean if deg_mean > 1e-6 else 0.0
        
        # Absolute drift between baseline (first 5 cycles) and end-of-life (last 5 cycles)
        early_val = df.groupby("engine_id")[col].apply(lambda s: s.iloc[:5].mean()).mean()
        late_val = df.groupby("engine_id")[col].apply(lambda s: s.iloc[-5:].mean()).mean()
        mid_val = df.groupby("engine_id")[col].apply(lambda s: s.iloc[int(len(s)*0.6):int(len(s)*0.65)+1].mean()).mean()
        
        drift_to_65 = abs(mid_val - early_val)
        total_drift = abs(late_val - early_val)
        
        # Ratio of drift that happened before 0.65
        pct_drift_early = (drift_to_65 / total_drift * 100) if total_drift > 1e-5 else 0.0
        
        # Is constant?
        overall_std = df[col].std()
        
        sensor_stats.append({
            "sensor": col,
            "overall_std": overall_std,
            "flat_cv": flat_cv,
            "deg_cv": deg_cv,
            "cv_ratio": (deg_cv / flat_cv) if flat_cv > 1e-6 else (999.0 if deg_cv > 1e-6 else 1.0),
            "pct_drift_before_65": pct_drift_early,
            "is_constant": overall_std < 1e-5
        })
        
    stats_df = pd.DataFrame(sensor_stats)
    print(f"{'Sensor':<10} | {'Overall Std':<11} | {'Flat CV':<10} | {'Deg CV':<10} | {'CV Ratio (Deg/Flat)':<20} | {'% Drift Before 65%':<18} | {'Status'}")
    print("-" * 100)
    for _, row in stats_df.iterrows():
        status = "CONSTANT" if row["is_constant"] else ("FLAT EARLY" if row["pct_drift_before_65"] < 15.0 else "EARLY DRIFT")
        print(f"{row['sensor']:<10} | {row['overall_std']:<11.4f} | {row['flat_cv']:<10.5f} | {row['deg_cv']:<10.5f} | {row['cv_ratio']:<20.2f} | {row['pct_drift_before_65']:<17.1f}% | {status}")
    print("-" * 100)
    
    # =========================================================================
    # TASK 3: Programmatic Residual Analysis & Compression Test
    # =========================================================================
    print("\n" + "=" * 80)
    print("TASK 3: Programmatic Residual & Decile Calibration Audit (Degrading Regime)")
    print("=" * 80)
    
    # Recreate the fixed 20-engine test split evaluation
    engine_ids = df["engine_id"].unique()
    np.random.seed(42)
    shuffled_engines = engine_ids.copy()
    np.random.shuffle(shuffled_engines)
    split_idx = int(len(shuffled_engines) * 0.8)
    train_engines = shuffled_engines[:split_idx]
    test_engines = shuffled_engines[split_idx:]
    
    train_df = df_sorted[df_sorted["engine_id"].isin(train_engines)].copy()
    test_df = df_sorted[df_sorted["engine_id"].isin(test_engines)].copy()
    
    scaler = MinMaxScaler()
    X_tr = scaler.fit_transform(train_df[all_features].values)
    X_te = scaler.transform(test_df[all_features].values)
    
    xgb_pw = xgb.XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.03, subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1, objective="reg:squarederror")
    xgb_pw.fit(X_tr, train_df["health_pw"].values)
    pred_pw = xgb_pw.predict(X_te)
    
    xgb_lin = xgb.XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.03, subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1, objective="reg:squarederror")
    xgb_lin.fit(X_tr, train_df["health_linear"].values)
    pred_lin = xgb_lin.predict(X_te)
    
    deg_mask = test_df["u"].values > 0.65
    y_true_pw_deg = test_df["health_pw"].values[deg_mask]
    y_pred_pw_deg = pred_pw[deg_mask]
    res_pw = y_pred_pw_deg - y_true_pw_deg
    abs_res_pw = np.abs(res_pw)
    
    y_true_lin_deg = test_df["health_linear"].values[deg_mask]
    y_pred_lin_deg = pred_lin[deg_mask]
    res_lin = y_pred_lin_deg - y_true_lin_deg
    abs_res_lin = np.abs(res_lin)
    
    print("Residual Summary Statistics (Degrading Regime Only):")
    print(f"{'Statistic':<25} | {'Piecewise XGBoost (0.0-1.0)':<28} | {'Linear XGBoost (0.0-0.35)'}")
    print("-" * 75)
    print(f"{'Mean Residual (bias)':<25} | {np.mean(res_pw):<28.5f} | {np.mean(res_lin):.5f}")
    print(f"{'Std of Residuals':<25} | {np.std(res_pw):<28.5f} | {np.std(res_lin):.5f}")
    print(f"{'Median Absolute Error':<25} | {np.median(abs_res_pw):<28.5f} | {np.median(abs_res_lin):.5f}")
    print(f"{'90th Percentile Abs Err':<25} | {np.percentile(abs_res_pw, 90):<28.5f} | {np.percentile(abs_res_lin, 90):.5f}")
    print(f"{'95th Percentile Abs Err':<25} | {np.percentile(abs_res_pw, 95):<28.5f} | {np.percentile(abs_res_lin, 95):.5f}")
    print(f"{'Max Absolute Error':<25} | {np.max(abs_res_pw):<28.5f} | {np.max(abs_res_lin):.5f}")
    print("-" * 75)
    
    # Decile Calibration / Compression Check for Piecewise Model
    print("\nCalibration / Dynamic Range Check for Piecewise Model (Testing for Compression):")
    bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    bin_labels = ["[0.0, 0.2]", "[0.2, 0.4]", "[0.4, 0.6]", "[0.6, 0.8]", "[0.8, 1.0]"]
    test_bins = pd.cut(y_true_pw_deg, bins=bins, include_lowest=True, labels=bin_labels)
    
    print(f"{'Target Health Bin':<20} | {'Count':<8} | {'Mean Actual':<14} | {'Mean Predicted':<16} | {'Bin Calibration Error'}")
    print("-" * 75)
    for b in bin_labels:
        mask_b = (test_bins == b)
        cnt = np.sum(mask_b)
        mean_act = np.mean(y_true_pw_deg[mask_b])
        mean_pred = np.mean(y_pred_pw_deg[mask_b])
        diff = mean_pred - mean_act
        print(f"{b:<20} | {cnt:<8} | {mean_act:<14.4f} | {mean_pred:<16.4f} | {diff:+.4f}")
    print("-" * 75)
    
    # Save results to JSON
    summary_data = {
        "kfold_pw_r2": [float(x) for x in pw_r2_scores],
        "kfold_lin_r2": [float(x) for x in linear_r2_scores],
        "kfold_pw_r2_mean": float(pw_r2_mean),
        "kfold_pw_r2_std": float(pw_r2_std),
        "kfold_lin_r2_mean": float(lin_r2_mean),
        "kfold_lin_r2_std": float(lin_r2_std),
        "residuals_pw": {
            "mean": float(np.mean(res_pw)),
            "std": float(np.std(res_pw)),
            "median_abs_err": float(np.median(abs_res_pw)),
            "p90_abs_err": float(np.percentile(abs_res_pw, 90)),
            "p95_abs_err": float(np.percentile(abs_res_pw, 95)),
            "max_abs_err": float(np.max(abs_res_pw))
        }
    }
    with open(OUT_DIR / "verification_audit_results.json", "w") as f:
        json.dump(summary_data, f, indent=4)
        
    print("\nVERIFICATION SUITE COMPLETE")

if __name__ == "__main__":
    run_deep_verifications()
