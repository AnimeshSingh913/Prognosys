import datetime
import os
from pathlib import Path

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Defaults to a SQLite file next to this module; override with DATABASE_URL.
BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'prognosys.db'}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


class AnalysisHistory(Base):
    """
    Log of /predict-complete runs.
    """
    __tablename__ = "analysis_history"

    id = Column(Integer, primary_key=True, index=True)
    engine_id = Column(Integer, nullable=True)
    health_score = Column(Float, nullable=False)
    predicted_rul = Column(Integer, nullable=False)
    reliability = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False)
    filename = Column(String(255), nullable=False)
    health_explanation = Column(Text, nullable=True)
    rul_explanation = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=_utcnow)


def get_db():
    """
    Dependency helper to acquire a DB session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
