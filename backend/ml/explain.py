"""
Local feature attributions for the production models.

- Health (XGBoost): exact TreeSHAP values from XGBoost's native `pred_contribs`.
  The 84 engineered features are summed back to their 21 physical sensors, which is
  valid because SHAP values are additive.
- RUL (Random Forest): exact decision-path attribution (Saabas method). Every split on
  the path moves the prediction from the parent node's mean to the child node's mean, and
  that change is credited to the split feature. bias + sum(contributions) == prediction.

Neither needs the `shap` package, so explanations work on lightweight deployments.
"""
from typing import Dict, List

import numpy as np
import xgboost as xgb

from ml.preprocessing import feature_to_sensor

HEALTH_METHOD = "TreeSHAP (XGBoost native)"
RUL_METHOD = "Decision-path attribution (Random Forest)"


def _top_k(contribs: Dict[str, float], k: int, digits: int) -> List[Dict[str, float]]:
    items = [{"sensor": s, "impact": round(float(v), digits)} for s, v in contribs.items()]
    items.sort(key=lambda x: abs(x["impact"]), reverse=True)
    return items[:k]


def health_contributions(health_model, X_health_scaled: np.ndarray, feature_names: List[str]) -> np.ndarray:
    """Returns TreeSHAP values of shape (n_rows, n_features); the bias column is dropped."""
    booster = health_model.get_booster()
    contribs = booster.predict(xgb.DMatrix(X_health_scaled), pred_contribs=True)
    return contribs[:, : len(feature_names)]


def aggregate_by_sensor(values: np.ndarray, feature_names: List[str]) -> Dict[str, float]:
    """Sums a 1-D vector of per-feature values into per-sensor totals."""
    totals: Dict[str, float] = {}
    for name, val in zip(feature_names, values):
        sensor = feature_to_sensor(name)
        totals[sensor] = totals.get(sensor, 0.0) + float(val)
    return totals


def explain_health(health_model, X_health_row: np.ndarray, feature_names: List[str], k: int = 5):
    row_contribs = health_contributions(health_model, X_health_row.reshape(1, -1), feature_names)[0]
    return _top_k(aggregate_by_sensor(row_contribs, feature_names), k, digits=4)


def rf_path_contributions(rf, x_row: np.ndarray) -> np.ndarray:
    """Exact per-feature path contributions for one row, averaged over the forest."""
    x = np.asarray(x_row, dtype=np.float32).ravel()  # sklearn trees split on float32
    contribs = np.zeros(x.shape[0], dtype=np.float64)
    for est in rf.estimators_:
        tree = est.tree_
        node = 0
        while tree.children_left[node] != -1:
            feat = tree.feature[node]
            if x[feat] <= tree.threshold[node]:
                child = tree.children_left[node]
            else:
                child = tree.children_right[node]
            contribs[feat] += tree.value[child][0][0] - tree.value[node][0][0]
            node = child
    return contribs / len(rf.estimators_)


def explain_rul(rul_model, x_scaled_row: np.ndarray, sensor_names: List[str], k: int = 5):
    contribs = rf_path_contributions(rul_model, x_scaled_row)
    return _top_k(dict(zip(sensor_names, contribs)), k, digits=2)
