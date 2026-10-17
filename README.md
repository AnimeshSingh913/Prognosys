# Prognosys – Predictive Maintenance & Remaining Useful Life

Prognosys estimates the **health** and **remaining useful life (RUL)** of turbofan engines from time-series sensor data, groups engines by how fast they degrade, and explains every prediction sensor by sensor.

- **Backend:** FastAPI · XGBoost · scikit-learn · TensorFlow/Keras (optional at serve time) · SQLAlchemy
- **Frontend:** React · TypeScript · Vite · Tailwind · shadcn/ui · Recharts
- **Data:** NASA C-MAPSS FD001 (100 run-to-failure turbofan engines, 21 sensors)

---

## Models

| Model | Task | Inputs | Hold-out result (20 unseen engines) |
|---|---|---|---|
| XGBoost regressor | Health index (0–1) | 84 features from raw sensors | MAE 0.034 · R² 0.972 (degrading regime R² 0.950) |
| Random Forest | RUL (cycles) | 21 scaled sensors, current cycle | MAE 13.6 · RMSE 18.5 · R² 0.80 |
| Stacked LSTM | RUL (cycles) | last 20 cycles × 21 sensors | MAE 11.5 · RMSE 16.4 · R² 0.85 |

Health model 5-fold GroupKFold CV (degrading regime, life fraction > 0.65): **R² 0.937 ± 0.013**.

Your numbers will be within noise of these after retraining. The exact values are written to `backend/ml/metrics.json` and shown on the **Model Evaluation** page.

**How the targets are defined**
- `RUL = max_cycle − cycle`, capped at 125 cycles.
- Health: `1.0` until 40 % of an engine's life, then `1 − ((u − 0.4) / 0.6)^1.8`, where `u = cycle / max_cycle`.

**Health features (84):** for each of the 21 sensors, the raw value, a trailing 5-cycle rolling mean and standard deviation, and the drift from the engine's first reading. The cycle number is deliberately excluded, because on its own it predicts life fraction and would leak the target.

**Evaluation protocol:** metrics are computed on engines that were never seen in training, with the split done by `engine_id`. The deployed models are then refit on all 100 engines, so scores on FD001 data in the app are in-sample.

**RUL model choice at inference:** the LSTM is used once an engine has 20 cycles of history and TensorFlow is installed. Otherwise the Random Forest is used. Each RUL value in the API says which model produced it.

## Explanations

| Prediction | Method | Unit |
|---|---|---|
| Health | Exact TreeSHAP from XGBoost (`pred_contribs`), with the 84 features summed back to their 21 sensors | health points |
| RUL | Exact decision-path attribution of the Random Forest (Saabas) | cycles |

Both are computed directly from the trees, so the API does not need the `shap` package. Global sensor importance is measured on held-out engines during training.

## Project layout

```
backend/
  app.py               FastAPI app and endpoints
  train_models.py      training pipeline (writes backend/ml/*)
  database.py          SQLAlchemy model for the analysis history
  run_migrations.py    creates/updates the history table
  upload_to_hf.py      pushes trained models to a Hugging Face model repo
  ml/
    preprocessing.py   labels, feature engineering, LSTM windows
    models.py          artifact loading and inference
    explain.py         TreeSHAP / decision-path attributions
  research/            model-selection and leakage audits (not used at runtime)
  data/train_FD001.txt NASA C-MAPSS FD001
public/samples/        sample CSVs (in-service fleet, run-to-failure fleet)
src/                   React frontend
```

## Running locally

**Backend** (Python 3.11)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements-train.txt
python train_models.py         # ~5 min on CPU; add --no-lstm to skip TensorFlow
uvicorn app:app --reload --port 8000
```

API docs are at http://127.0.0.1:8000/docs.

**Frontend**

```bash
npm install
npm run dev
```

Open http://localhost:8080 and click **Try the sample fleet** on the Upload page. If the API runs elsewhere, set `VITE_API_URL` (see `.env.example`).

## CSV format

```
engine_id,cycle,sensor_1,sensor_2,...,sensor_21
1,1,518.67,641.82,...,23.4190
```

- All 21 C-MAPSS sensor columns are required.
- Gaps inside an engine's history are filled from neighbouring cycles.
- The upload limit is 20 MB (`MAX_UPLOAD_MB`).

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/status` | Whether models are loaded and the LSTM is enabled |
| POST | `/analyze` | Health, DSI, reliability, RUL, clusters and insights in one call |
| POST | `/predict-complete?engine_id=` | Full diagnosis of one engine's latest cycle (logged to the DB) |
| POST | `/explain?engine_id=` | Top-5 sensor attributions for health and RUL |
| POST | `/predict-health`, `/predict-rul` | Per-cycle health / RUL |
| POST | `/health`, `/dsi`, `/reliability`, `/clusters`, `/insights` | Single parts of `/analyze` |
| POST | `/evaluate-dataset` | MAE/RMSE/R² against labels from an uploaded **run-to-failure** file |
| GET | `/metrics` | Hold-out metrics and global sensor importance from training |
| GET | `/history?limit=` | Recent `/predict-complete` results |

`POST` endpoints take a multipart `file` field.

## Deployment

**API (Render):** `render.yaml` installs `backend/requirements.txt`. That set runs the XGBoost and Random Forest models without TensorFlow, and RUL falls back to the Random Forest. Model files are not committed, so either:
- run `python upload_to_hf.py` and set `HF_MODEL_ID` and `HF_TOKEN`, so models download at startup, or
- bake `backend/ml/*` into the image.

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Allowed CORS origin(s), comma-separated |
| `FRONTEND_ORIGIN_REGEX` | Optional regex for preview deployments |
| `HF_MODEL_ID`, `HF_TOKEN` | Download models from a Hugging Face repo |
| `DATABASE_URL` | Defaults to SQLite in `backend/prognosys.db` |
| `MAX_UPLOAD_MB` | Upload size limit (default 20) |

**Frontend (Vercel):** `vercel.json` builds the Vite app. Set `VITE_API_URL` to the API URL.

## Limitations

- The models are trained only on FD001: one operating condition, one fault mode. Other machines need their own data and a retrain.
- The health index is a modelled target, not a measured quantity.
- Reliability is a heuristic: `exp(−2 · (1 − health))`.
- `/evaluate-dataset` assumes each engine's last row is its failure point.

## Author

Animesh Singh
