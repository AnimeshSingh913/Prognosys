import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import {
  Cpu,
  Brain,
  Database,
  GitBranch,
  Layers,
  Target,
  BookOpen,
  Github,
} from 'lucide-react';

export default function AboutPage() {
  return (
    <MainLayout>
      <PageHeader
        title="About Prognosys"
        description="Intelligent Machine Health & Degradation Analytics Platform"
      />

      {/* Hero Section */}
      <div className="dashboard-card mb-6 sm:mb-8 bg-gradient-to-br from-primary/5 to-accent/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-primary">
            <Cpu className="h-7 w-7 sm:h-8 sm:w-8 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              Prognosys
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-3 leading-relaxed">
              A predictive maintenance platform that estimates engine health,
              remaining useful life (RUL), degradation speed and reliability
              from time-series sensor data, and explains which sensors drive
              each prediction.
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              The bundled models are trained on NASA C-MAPSS FD001 turbofan
              data and expect its 21 sensor channels. Other machine types need
              their own training data and a retrain with train_models.py.
            </p>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Brain className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Machine Learning</h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            XGBoost health model on 84 leakage-safe features (raw sensors,
            rolling statistics, baseline drift) and a Random Forest RUL model.
          </p>
        </div>

        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Layers className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Deep Learning</h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Stacked LSTM network that forecasts remaining useful life from
            the last 20 cycles of sensor readings.
          </p>
        </div>

        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <GitBranch className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">
              Unsupervised Learning
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            KMeans clustering for identifying degradation behavior groups and
            fleet-wide pattern analysis without labeled data.
          </p>
        </div>

        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Database className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Data Pipeline</h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Robust CSV processing pipeline with sensor normalization, feature
            engineering, and real-time analytics computation.
          </p>
        </div>

        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Target className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">
              Predictive Analytics
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Degradation Speed Index (DSI) and reliability estimation for
            proactive maintenance scheduling and failure prevention.
          </p>
        </div>

        <div className="dashboard-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <BookOpen className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Reference Dataset</h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            NASA C-MAPSS (Commercial Modular Aero-Propulsion System Simulation)
            dataset used for demonstration and model validation.
          </p>
        </div>
      </div>

      {/* Technical Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="dashboard-card">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Target Users
          </h3>
          <ul className="space-y-3">
            {[
              'Maintenance Engineers',
              'Reliability Engineers',
              'Industrial Analysts',
              'Academic Evaluators',
            ].map((user) => (
              <li
                key={user}
                className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground"
              >
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                {user}
              </li>
            ))}
          </ul>
        </div>

        <div className="dashboard-card">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Technical Stack
          </h3>
          <ul className="space-y-3">
            {[
              'Frontend: React + TypeScript',
              'Backend: FastAPI (Python)',
              'Charts: Recharts',
              'ML: XGBoost, scikit-learn, TensorFlow/Keras',
              'Deployment: CPU-based implementation',
            ].map((tech) => (
              <li
                key={tech}
                className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground"
              >
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                {tech}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Academic Note */}
      <div className="dashboard-card bg-accent/30">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-primary">
            <Github className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base mb-1">
              Open Source
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Model metrics shown in the app are measured on engines held out
              from training, and every prediction comes with a per-sensor
              explanation. Retrain the models any time with train_models.py.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
