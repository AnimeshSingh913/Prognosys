import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, List

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT_DIR = Path(__file__).resolve().parent
BASE_DIR = OUT_DIR.parent  # backend/
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"

sys.path.append(str(BASE_DIR))
from ml.preprocessing import load_cmapss_data, generate_rul_and_health

def run_regime_audit():
    print("=" * 75)
    print("AUDITING DEGRADING VS. FLAT REGIMES ON HEALTH MODELS")
    print("=" * 75)
    
    # 1. Load data
    df = load_cmapss_data(str(DATA_PATH))
    df = generate_rul_and_health(df)
    
    # Engine-wise train/test split (seed 42, 80/20)
    engine_ids = df["engine_id"].unique()
    np.random.seed(42)
    shuffled_engines = engine_ids.copy()
    np.random.shuffle(shuffled_engines)
    
    split_idx = int(len(shuffled_engines) * 0.8)
    train_engines = shuffled_engines[:split_idx]
    test_engines = shuffled_engines[split_idx:]
    
    sensor_cols = [c for c in df.columns if c.startswith("sensor")]
    
    # 2. Engineer 84 leakage-safe features (strictly sensor-derived, no cycle)
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
    
    # Labels
    # Linear health: 1 - cycle / max_cycle
    max_c = df_sorted.groupby("engine_id")["cycle"].transform("max")
    u = df_sorted["cycle"] / max_c
    df_sorted["u"] = u
    df_sorted["health_linear"] = df_sorted["health"]
    
    # Piecewise health: 1.0 if u <= 0.65, else 1.0 - (u - 0.65) / 0.35
    df_sorted["health_pw"] = np.where(u <= 0.65, 1.0, 1.0 - (u - 0.65) / 0.35)
    df_sorted["health_pw"] = df_sorted["health_pw"].clip(0.0, 1.0)
    
    # Train / Test split
    train_df = df_sorted[df_sorted["engine_id"].isin(train_engines)].copy()
    test_df = df_sorted[df_sorted["engine_id"].isin(test_engines)].copy()
    
    scaler = MinMaxScaler()
    X_train = scaler.fit_transform(train_df[all_features].values)
    X_test = scaler.transform(test_df[all_features].values)
    
    y_train_linear = train_df["health_linear"].values
    y_test_linear = test_df["health_linear"].values
    
    y_train_pw = train_df["health_pw"].values
    y_test_pw = test_df["health_pw"].values
    
    # Train Clean Step 2 Model: Linear XGBoost
    print("Training Linear XGBoost on Safe Features...")
    xgb_linear = xgb.XGBRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.03, 
        subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
        objective="reg:squarederror"
    )
    xgb_linear.fit(X_train, y_train_linear)
    pred_test_linear = xgb_linear.predict(X_test)
    
    # Train Clean Step 4 Model: Piecewise XGBoost
    print("Training Piecewise XGBoost on Safe Features...")
    xgb_pw = xgb.XGBRegressor(
        n_estimators=200, max_depth=6, learning_rate=0.03, 
        subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
        objective="reg:squarederror"
    )
    xgb_pw.fit(X_train, y_train_pw)
    pred_test_pw = xgb_pw.predict(X_test)
    
    # Step 1: Segment test set
    test_u = test_df["u"].values
    flat_mask = (test_u <= 0.65)
    degrading_mask = (test_u > 0.65)
    
    n_total = len(test_df)
    n_flat = np.sum(flat_mask)
    n_degrading = np.sum(degrading_mask)
    pct_flat = (n_flat / n_total) * 100
    pct_degrading = (n_degrading / n_total) * 100
    
    print("\n" + "-" * 75)
    print("STEP 1: Test Set Segmentation Statistics")
    print("-" * 75)
    print(f"Total test cycles across 20 engines: {n_total}")
    print(f"Flat regime cycles (u <= 0.65):      {n_flat} ({pct_flat:.2f}%)")
    print(f"Degrading regime cycles (u > 0.65):   {n_degrading} ({pct_degrading:.2f}%)")
    
    # Step 2 & 3: Compute metrics separately per segment
    def compute_segment_metrics(y_true, y_pred, name):
        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        var_y = np.var(y_true)
        if var_y == 0:
            r2 = float("nan")
        else:
            r2 = float(r2_score(y_true, y_pred))
        return {"mae": mae, "rmse": rmse, "r2": r2}
        
    pw_flat_metrics = compute_segment_metrics(y_test_pw[flat_mask], pred_test_pw[flat_mask], "Piecewise Flat")
    pw_deg_metrics = compute_segment_metrics(y_test_pw[degrading_mask], pred_test_pw[degrading_mask], "Piecewise Degrading")
    
    linear_flat_metrics = compute_segment_metrics(y_test_linear[flat_mask], pred_test_linear[flat_mask], "Linear Flat")
    linear_deg_metrics = compute_segment_metrics(y_test_linear[degrading_mask], pred_test_linear[degrading_mask], "Linear Degrading")
    
    # Also evaluate both models on normalized degradation percentage in degrading regime:
    # In degrading regime, wear severity goes from 0% (at u=0.65) to 100% (at u=1.0).
    # For Piecewise model: predicted wear = 1.0 - pred_test_pw
    # For Linear model: health goes from 0.35 down to 0.0, so relative wear is (0.35 - pred) / 0.35
    # Let's also check this!
    
    print("\n" + "-" * 75)
    print("STEP 2 & 3: Performance Breakdown Table")
    print("-" * 75)
    print(f"{'Model':<20} | {'Regime':<18} | {'N samples':<9} | {'MAE':<8} | {'RMSE':<8} | {'R2':<8}")
    print("-" * 75)
    r2_pw_flat_str = "N/A (Var=0)" if np.isnan(pw_flat_metrics["r2"]) else f"{pw_flat_metrics['r2']:.4f}"
    print(f"{'Piecewise XGBoost':<20} | {'Flat (u <= 0.65)':<18} | {n_flat:<9} | {pw_flat_metrics['mae']:<8.4f} | {pw_flat_metrics['rmse']:<8.4f} | {r2_pw_flat_str:<8}")
    print(f"{'Piecewise XGBoost':<20} | {'Degrading (u > 0.65)':<18} | {n_degrading:<9} | {pw_deg_metrics['mae']:<8.4f} | {pw_deg_metrics['rmse']:<8.4f} | {pw_deg_metrics['r2']:<8.4f}")
    print(f"{'Linear XGBoost':<20} | {'Flat (u <= 0.65)':<18} | {n_flat:<9} | {linear_flat_metrics['mae']:<8.4f} | {linear_flat_metrics['rmse']:<8.4f} | {linear_flat_metrics['r2']:<8.4f}")
    print(f"{'Linear XGBoost':<20} | {'Degrading (u > 0.65)':<18} | {n_degrading:<9} | {linear_deg_metrics['mae']:<8.4f} | {linear_deg_metrics['rmse']:<8.4f} | {linear_deg_metrics['r2']:<8.4f}")
    print("-" * 75)
    
    # Save metrics JSON
    results = {
        "n_total": int(n_total),
        "n_flat": int(n_flat),
        "n_degrading": int(n_degrading),
        "pct_flat": float(pct_flat),
        "pct_degrading": float(pct_degrading),
        "piecewise_flat": pw_flat_metrics,
        "piecewise_degrading": pw_deg_metrics,
        "linear_flat": linear_flat_metrics,
        "linear_degrading": linear_deg_metrics
    }
    with open(OUT_DIR / "regime_audit_results.json", "w") as f:
        json.dump(results, f, indent=4)
        
    # Step 4: Scatter Plot for Degrading Regime
    print("\n[STEP 4] Generating Scatter Plot for Degrading Regime...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6), sharey=False)
    
    # Plot 1: Piecewise Model on Degrading Regime
    y_true_deg_pw = y_test_pw[degrading_mask]
    y_pred_deg_pw = pred_test_pw[degrading_mask]
    
    ax1.scatter(y_true_deg_pw, y_pred_deg_pw, alpha=0.35, color="#2563eb", edgecolors="none", s=25)
    ax1.plot([0, 1], [0, 1], "--", color="#dc2626", linewidth=2, label="Ideal (y = x)")
    ax1.set_title(f"Piecewise XGBoost (Degrading Regime Only)\nMAE: {pw_deg_metrics['mae']:.4f} | RMSE: {pw_deg_metrics['rmse']:.4f} | R²: {pw_deg_metrics['r2']:.4f}", fontsize=11, fontweight="bold")
    ax1.set_xlabel("Actual Piecewise Health", fontsize=10)
    ax1.set_ylabel("Predicted Health", fontsize=10)
    ax1.set_xlim(-0.05, 1.05)
    ax1.set_ylim(-0.05, 1.10)
    ax1.grid(True, linestyle=":", alpha=0.6)
    ax1.legend(loc="upper left")
    
    # Plot 2: Linear Model on Degrading Regime
    y_true_deg_lin = y_test_linear[degrading_mask]
    y_pred_deg_lin = pred_test_linear[degrading_mask]
    
    ax2.scatter(y_true_deg_lin, y_pred_deg_lin, alpha=0.35, color="#10b981", edgecolors="none", s=25)
    # Range of linear target in degrading regime is ~0.0 to ~0.35
    max_deg_val = max(np.max(y_true_deg_lin), 0.40)
    ax2.plot([0, max_deg_val], [0, max_deg_val], "--", color="#dc2626", linewidth=2, label="Ideal (y = x)")
    ax2.set_title(f"Linear XGBoost (Degrading Regime Only)\nMAE: {linear_deg_metrics['mae']:.4f} | RMSE: {linear_deg_metrics['rmse']:.4f} | R²: {linear_deg_metrics['r2']:.4f}", fontsize=11, fontweight="bold")
    ax2.set_xlabel("Actual Linear Health (0.0 to 0.35)", fontsize=10)
    ax2.set_ylabel("Predicted Health", fontsize=10)
    ax2.set_xlim(-0.02, max_deg_val + 0.05)
    ax2.set_ylim(-0.05, max_deg_val + 0.15)
    ax2.grid(True, linestyle=":", alpha=0.6)
    ax2.legend(loc="upper left")
    
    plt.tight_layout()
    plot_path = OUT_DIR / "audit_degrading_regime_scatter.png"
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"Scatter plot saved successfully to {plot_path}")
    print("\n" + "=" * 75)
    print("REGIME AUDIT COMPLETE")
    print("=" * 75)

if __name__ == "__main__":
    run_regime_audit()
