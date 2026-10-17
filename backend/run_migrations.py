import sys
from pathlib import Path

# Add backend directory to python path if run standalone
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import inspect, text

from database import Base, engine

# Columns added after the first release, as (name, SQL type)
ADDED_COLUMNS = [
    ("health_explanation", "TEXT"),
    ("rul_explanation", "TEXT"),
    ("engine_id", "INTEGER"),
]


def run_migrations():
    """Creates missing tables and adds columns introduced after the first release."""
    print(f"Running database migrations on: {engine.url.render_as_string(hide_password=True)}")
    Base.metadata.create_all(bind=engine)

    existing = {col["name"] for col in inspect(engine).get_columns("analysis_history")}
    with engine.begin() as conn:
        for name, sql_type in ADDED_COLUMNS:
            if name not in existing:
                print(f"Adding column '{name}' to 'analysis_history'")
                conn.execute(text(f"ALTER TABLE analysis_history ADD COLUMN {name} {sql_type}"))
    print("Database migrations applied.")


if __name__ == "__main__":
    try:
        run_migrations()
    except Exception as e:
        print(f"Error applying database migrations: {e}", file=sys.stderr)
        sys.exit(1)
