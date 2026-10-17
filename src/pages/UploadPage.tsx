import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/ui/page-header";
import { FileUpload } from "@/components/FileUpload";
import { FileText, Database, CheckCircle2, Download, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

import { api } from "@/lib/api";
import { useAppData } from "@/context/AppContext";

export default function UploadPage() {
  const { setFile } = useAppData();

  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const navigate = useNavigate();

  const handleUpload = async (file: File) => {
    setIsLoading(true);

    // Errors propagate to FileUpload (failed state); the API layer shows them as a toast
    try {
      await api.analyze(file);

      // Store file globally for other pages
      setFile(file);

      // Track upload history
      setUploadedFiles((prev) => [...prev, file.name]);
    } finally {
      setIsLoading(false);
    }
  };

  const trySample = async () => {
    try {
      const res = await fetch("/samples/fleet_in_service.csv");
      const blob = await res.blob();
      await handleUpload(new File([blob], "fleet_in_service.csv", { type: "text/csv" }));
      navigate("/");
    } catch {
      // Reported by the API layer
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Upload Sensor Data"
        description="Upload CSV files containing machine sensor readings for analysis"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="dashboard-card">
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Upload CSV File
          </h2>
          <FileUpload onUpload={handleUpload} isLoading={isLoading} />
          <div className="mt-4 flex items-center gap-3 border-t border-border/50 pt-4">
            <Button variant="outline" onClick={trySample} disabled={isLoading}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Try the sample fleet
            </Button>
            <span className="text-xs text-muted-foreground">5 NASA C-MAPSS engines, part-way through their life</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="dashboard-card">
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Data Requirements
          </h2>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                <FileText className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm sm:text-base">CSV Format</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  File must be in comma-separated values format with headers
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                <Database className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm sm:text-base">Required Columns</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  engine_id, cycle and all 21 sensor columns (sensor_1 …
                  sensor_21), in the NASA C-MAPSS layout the models were trained on
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-muted p-3 sm:p-4">
              <p className="text-xs sm:text-sm font-medium text-foreground mb-2">
                Example Data:
              </p>
              <pre className="text-[11px] sm:text-xs text-muted-foreground font-mono overflow-x-auto p-1 max-w-full">
                {`engine_id,cycle,sensor_1,sensor_2,sensor_3,…,sensor_21
1,1,518.67,641.82,1589.70,…,23.4190
1,2,518.67,642.15,1591.82,…,23.4236
1,3,518.67,642.35,1587.99,…,23.3442
...`}
              </pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="/samples/fleet_in_service.csv"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Sample: in-service fleet
              </a>
              <a
                href="/samples/fleet_run_to_failure.csv"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Sample: run-to-failure (for evaluation)
              </a>
            </div>
          </div>
        </div>

        {/* Upload History */}
        {uploadedFiles.length > 0 && (
          <div className="lg:col-span-2 dashboard-card">
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4">
              Uploaded Files
            </h2>
            <div className="space-y-2">
              {uploadedFiles.map((fileName, index) => (
                <div
                  key={index}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="h-5 w-5 text-status-healthy shrink-0" />
                    <span className="font-medium text-foreground text-sm truncate">
                      {fileName}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground shrink-0">
                    Processed successfully
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
