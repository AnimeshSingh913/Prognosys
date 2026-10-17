import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

/** Shown while the uploaded file is being analyzed (errors are reported as toasts). */
export function LoadingState() {
  return (
    <MainLayout>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Analyzing sensor data…</p>
        <p className="text-xs text-muted-foreground">
          Taking too long or seeing an error?{" "}
          <Link to="/upload" className="font-semibold text-primary hover:underline">
            Upload a different file
          </Link>
        </p>
      </div>
    </MainLayout>
  );
}
