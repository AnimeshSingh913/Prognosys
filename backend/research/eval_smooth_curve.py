import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import xgboost as xgb

OUT_DIR = Path(__file__).resolve().parent
BASE_DIR = OUT_DIR.parent  # backend/
DATA_PATH = BASE_DIR / "data" / "train_FD001.txt"

sys.path.append(str(BASE_DIR))
from ml.preprocessing import load_cmapss_data, generate_rul_and_health

def run_smooth_curve_eval():
    print("=" * 80)
    print("TESTING SMOOTH 'HOCKEY-STICK' HEALTH DEGRADATION LABELS (5-FOLD GROUPKFOLD)")
    print("=" * 80)
    
    # 1. Load Data
    df = load_cmapss_data(str(DATA_PATH))
    df = generate_rul_and_health(df)
    
    sensor_cols = [c for c in df.columns if c.startswith("sensor")]
    max_c = df.groupby("engine_id")["cycle"].transform("max")
    df["u"] = df["cycle"] / max_c
    u = df["u"].values
    
    # Define candidate labels:
    # 1. Baseline Linear: 1 - u
    df["label_linear"] = df["health"].values
    
    # 2. Hard Piecewise: 1.0 for u <= 0.65, else 1 - (u - 0.65)/0.35
    df["label_hard_pw"] = np.where(u <= 0.65, 1.0, 1.0 - (u - 0.65) / 0.35).clip(0.0, 1.0)
    
    # 3. Smooth Candidate A: Power / Exponential Curve (gamma = 2.8)
    # At u=0.40: 1 - 0.40^2.8 = 0.925 (7.5% wear)
    # At u=0.65: 1 - 0.65^2.8 = 0.701 (29.9% wear, ~70% wear in final third)
    df["label_power_28"] = (1.0 - u**2.8).clip(0.0, 1.0)
    
    # 4. Smooth Candidate B: Cubic Spline onset at u=0.40
    # For u <= 0.40: 1.0
    # For u > 0.40: smooth polynomial decay to 0 at u=1.0 with continuous derivative at 0.40
    # t = (u - 0.4) / 0.6. decay = t^2 (accelerating). At u=0.65, t = 0.25/0.6 = 0.4167. t^2 = 0.1736 (17.4% wear).
    t = np.clip((u - 0.40) / 0.60, 0.0, 1.0)
    df["label_spline_40"] = np.where(u <= 0.40, 1.0, 1.0 - (t**1.8)).clip(0.0, 1.0)
    
    # 5. Smooth Candidate C: Calibrated Sigmoidal decay
    # Logistic transition centered at u=0.75, scale 8.0, normalized so h(0)=1, h(1)=0
    raw_sig = 1.0 / (1.0 + np.exp(8.0 * (u - 0.75)))
    sig_0 = 1.0 / (1.0 + np.exp(8.0 * (0.0 - 0.75)))
    sig_1 = 1.0 / (1.0 + np.exp(8.0 * (1.0 - 0.75)))
    df["label_sigmoid"] = ((raw_sig - sig_1) / (sig_0 - sig_1)).clip(0.0, 1.0)
    
    # Print curve characteristics at key points (u=0.2, 0.4, 0.65, 0.8, 1.0)
    key_u = [0.0, 0.2, 0.4, 0.65, 0.8, 1.0]
    print("\nDegradation Curves Comparison at Milestones:")
    print(f"{'Lifecycle Ratio u':<20} | {'Linear':<10} | {'Hard Piecewise':<16} | {'Power (u^2.8)':<14} | {'Smooth Spline':<14} | {'Calibrated Sigmoid'}")
    print("-" * 95)
    for ku in key_u:
        lin_v = 1.0 - ku
        hard_v = 1.0 if ku <= 0.65 else (1.0 - (ku - 0.65) / 0.35)
        pow_v = 1.0 - ku**2.8
        t_v = max(0.0, (ku - 0.40) / 0.60)
        spl_v = 1.0 if ku <= 0.40 else (1.0 - t_v**1.8)
        s_raw = 1.0 / (1.0 + np.exp(8.0 * (ku - 0.75)))
        sig_v = (s_raw - sig_1) / (sig_0 - sig_1)
        print(f"u = {ku:<16.2f} | {lin_v:<10.3f} | {hard_v:<16.3f} | {pow_v:<14.3f} | {spl_v:<14.3f} | {sig_v:.3f}")
    print("-" * 95)
    
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
    
    # 5-Fold GroupKFold Evaluation
    gkf = GroupKFold(n_splits=5)
    groups = df_sorted["engine_id"].values
    
    candidates = {
        "Linear": "label_linear",
        "Hard Piecewise (0.65)": "label_hard_pw",
        "Smooth Spline (onset 0.40)": "label_spline_40",
        "Power Curve (u^2.8)": "label_power_28",
        "Calibrated Sigmoid": "label_sigmoid"
    }
    
    cv_results = {c: {"deg_r2": [], "deg_mae": [], "all_r2": [], "all_mae": []} for c in candidates}
    
    fold = 1
    for train_idx, val_idx in gkf.split(df_sorted, groups=groups):
        train_data = df_sorted.iloc[train_idx]
        val_data = df_sorted.iloc[val_idx]
        
        scaler = MinMaxScaler()
        X_tr = scaler.fit_transform(train_data[all_features].values)
        X_val = scaler.transform(val_data[all_features].values)
        
        deg_mask = val_data["u"].values > 0.65
        
        for cand_name, target_col in candidates.items():
            y_tr = train_data[target_col].values
            y_val = val_data[target_col].values
            
            model = xgb.XGBRegressor(
                n_estimators=200, max_depth=6, learning_rate=0.03,
                subsample=1.0, colsample_bytree=0.8, random_state=42, n_jobs=-1,
                objective="reg:squarederror"
            )
            model.fit(X_tr, y_tr)
            pred_val = model.predict(X_val)
            
            # Metrics on degrading regime
            r2_deg = r2_score(y_val[deg_mask], pred_val[deg_mask])
            mae_deg = mean_absolute_error(y_val[deg_mask], pred_val[deg_mask])
            
            # Metrics across all cycles
            r2_all = r2_score(y_val, pred_val)
            mae_all = mean_absolute_error(y_val, pred_val)
            
            cv_results[cand_name]["deg_r2"].append(r2_deg)
            cv_results[cand_name]["deg_mae"].append(mae_deg)
            cv_results[cand_name]["all_r2"].append(r2_all)
            cv_results[cand_name]["all_mae"].append(mae_all)
            
        print(f"Fold {fold} complete.")
        fold += 1
        
    print("\n" + "=" * 90)
    print("5-FOLD CROSS-VALIDATION SUMMARY (GROUPED BY ENGINE_ID)")
    print("=" * 90)
    print(f"{'Candidate Formulation':<28} | {'Degrading R2 (Mean ± Std)':<26} | {'Degrading MAE':<15} | {'Full-Set R2'}")
    print("-" * 90)
    for cand_name in candidates:
        d_r2_m = np.mean(cv_results[cand_name]["deg_r2"])
        d_r2_s = np.std(cv_results[cand_name]["deg_r2"])
        d_mae_m = np.mean(cv_results[cand_name]["deg_mae"])
        a_r2_m = np.mean(cv_results[cand_name]["all_r2"])
        print(f"{cand_name:<28} | {d_r2_m:.4f} ± {d_r2_s:.4f}{'':<12} | {d_mae_m:<15.4f} | {a_r2_m:.4f}")
    print("-" * 90)
    
    # Save results to json
    final_output = {}
    for cand_name in candidates:
        final_output[cand_name] = {
            "deg_r2_mean": float(np.mean(cv_results[cand_name]["deg_r2"])),
            "deg_r2_std": float(np.std(cv_results[cand_name]["deg_r2"])),
            "deg_mae_mean": float(np.mean(cv_results[cand_name]["deg_mae"])),
            "all_r2_mean": float(np.mean(cv_results[cand_name]["all_r2"])),
            "folds_deg_r2": [float(x) for x in cv_results[cand_name]["deg_r2"]]
        }
    with open(OUT_DIR / "smooth_curve_eval_results.json", "w") as f:
        json.dump(final_output, f, indent=4)
        
    print("\nSmooth curve evaluation completed successfully. Results saved to smooth_curve_eval_results.json")

if __name__ == "__main__":
    run_smooth_curve_eval()
