import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LoadingState } from "@/components/LoadingState";

// Each page loads on demand so the first paint does not wait for every chart
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const DegradationPage = lazy(() => import("./pages/DegradationPage"));
const ClusteringPage = lazy(() => import("./pages/ClusteringPage"));
const ReliabilityPage = lazy(() => import("./pages/ReliabilityPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const EvaluationPage = lazy(() => import("./pages/EvaluationPage"));
const ExplainabilityPage = lazy(() => import("./pages/ExplainabilityPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const App = () => (
  <TooltipProvider>
    <Toaster richColors closeButton />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/degradation" element={<DegradationPage />} />
          <Route path="/clustering" element={<ClusteringPage />} />
          <Route path="/reliability" element={<ReliabilityPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/explainability" element={<ExplainabilityPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
