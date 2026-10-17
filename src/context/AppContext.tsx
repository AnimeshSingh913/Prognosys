import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearStoredFile, loadStoredFile, storeFile } from "@/lib/fileStore";

type AppContextType = {
  file: File | null;
  setFile: (file: File | null) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;

  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [file, setFileState] = useState<File | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Restore the last uploaded CSV so a page refresh keeps the analysis
  useEffect(() => {
    let cancelled = false;
    loadStoredFile().then((stored) => {
      if (stored && !cancelled) setFileState((current) => current ?? stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setFile = useCallback((next: File | null) => {
    setFileState(next);
    if (next) storeFile(next);
    else clearStoredFile();
  }, []);

  return (
    <AppContext.Provider
      value={{
        file,
        setFile,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used inside AppProvider");
  return ctx;
}
