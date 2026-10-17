import pandas as pd
import numpy as np
from typing import List, Tuple

SENSOR_COLS = [f"sensor_{i}" for i in range(1, 22)]
SEQ_LEN = 20
RUL_CAP = 125


def load_cmapss_data(file_path: str) -> pd.DataFrame:
    """
    Loads the NASA C-MAPSS FD001 dataset and assigns appropriate column names.
    """
    df = pd.read_csv(file_path, sep=" ", header=None)
    df = df.dropna(axis=1)

    df.columns = (
        ["engine_id", "cycle"] +
        [f"op_{i}" for i in range(1, 4)] +
        SENSOR_COLS
    )
    return df


def generate_rul_and_health(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generates Remaining Useful Life (RUL) and health labels for run-to-failure data.

    RUL = max_cycle - current_cycle, clipped to RUL_CAP.
    health = 1 - cycle / max_cycle (linear baseline, kept for the research scripts).
    health_smooth (the production health target), with u = cycle / max_cycle:
        - u <= 0.40: 1.0
        - u >  0.40: 1.0 - ((u - 0.40) / 0.60) ** 1.8
    """
    max_cycles = df.groupby("engine_id")["cycle"].transform("max")

    df["RUL"] = (max_cycles - df["cycle"]).clip(upper=RUL_CAP)
    df["health"] = 1 - (df["cycle"] / max_cycles)

    u = df["cycle"] / max_cycles
    t = np.clip((u - 0.40) / 0.60, 0.0, 1.0)
    df["health_smooth"] = np.where(u <= 0.40, 1.0, 1.0 - (t ** 1.8)).clip(0.0, 1.0)
    df["life_fraction"] = u
    return df


def extract_health_features(df: pd.DataFrame, sensor_cols: List[str] = None) -> Tuple[pd.DataFrame, List[str]]:
    """
    Extracts 84 leakage-safe, strictly sensor-derived features for health prediction
    from RAW (unscaled) sensor values:
    - 21 raw sensor values
    - per sensor: trailing rolling mean (window=5), trailing rolling std (window=5),
      and baseline delta (sensor_t - first reading of that engine)

    current_cycle is excluded to prevent target leakage.
    The returned frame is sorted by (engine_id, cycle) with a fresh RangeIndex.
    """
    df = df.copy()
    if "engine_id" in df.columns and "cycle" in df.columns:
        df = df.sort_values(["engine_id", "cycle"]).reset_index(drop=True)
        group_col = "engine_id"
    else:
        group_col = None

    if sensor_cols is None:
        sensor_cols = [c for c in df.columns if c.startswith("sensor")]

    feature_cols = []
    new_cols = {}
    for col in sensor_cols:
        roll_mean_col = f"{col}_roll_mean_5"
        roll_std_col = f"{col}_roll_std_5"
        delta_col = f"{col}_delta"

        if group_col:
            grouped = df.groupby(group_col)[col]
            new_cols[roll_mean_col] = grouped.transform(lambda s: s.rolling(5, min_periods=1).mean())
            new_cols[roll_std_col] = grouped.transform(lambda s: s.rolling(5, min_periods=1).std()).fillna(0.0)
            base_val = grouped.transform("first")
        else:
            new_cols[roll_mean_col] = df[col].rolling(5, min_periods=1).mean()
            new_cols[roll_std_col] = df[col].rolling(5, min_periods=1).std().fillna(0.0)
            base_val = df[col].iloc[0] if len(df) > 0 else 0.0
        new_cols[delta_col] = df[col] - base_val

        feature_cols.extend([roll_mean_col, roll_std_col, delta_col])

    df = pd.concat([df, pd.DataFrame(new_cols, index=df.index)], axis=1)
    return df, sensor_cols + feature_cols


def feature_to_sensor(feature_name: str) -> str:
    """Maps an engineered feature name (e.g. 'sensor_4_roll_mean_5') back to its sensor."""
    for suffix in ("_roll_mean_5", "_roll_std_5", "_delta"):
        if feature_name.endswith(suffix):
            return feature_name[: -len(suffix)]
    return feature_name


def generate_lstm_sequences(
    df: pd.DataFrame,
    sensor_cols: List[str],
    seq_len: int = SEQ_LEN
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Builds sliding windows for LSTM training. Each window covers rows [i, i + seq_len)
    and is labelled with the RUL of its LAST row, so at inference time a window ending
    at the current cycle predicts the current RUL.
    """
    sequences = []
    targets = []

    for _, group in df.groupby("engine_id"):
        group = group.sort_values("cycle")
        sensors = group[sensor_cols].values
        ruls = group["RUL"].values

        for i in range(len(group) - seq_len + 1):
            sequences.append(sensors[i : i + seq_len])
            targets.append(ruls[i + seq_len - 1])

    return np.array(sequences), np.array(targets)


def build_inference_windows(group_sensors: np.ndarray, seq_len: int = SEQ_LEN) -> Tuple[np.ndarray, np.ndarray]:
    """
    Builds one window per row that has at least seq_len rows of history (including itself).
    Returns (windows of shape (k, seq_len, n_features), row positions of shape (k,)).
    """
    n = len(group_sensors)
    if n < seq_len:
        return np.empty((0, seq_len, group_sensors.shape[1])), np.empty((0,), dtype=int)
    positions = np.arange(seq_len - 1, n)
    windows = np.stack([group_sensors[p - seq_len + 1 : p + 1] for p in positions])
    return windows, positions
