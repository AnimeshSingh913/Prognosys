import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useAppData } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Menu, Cpu, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarCollapsed, mobileMenuOpen, setMobileMenuOpen, file } = useAppData();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar />

      {/* 📱 TOP BAR FOR MOBILE DEVICES */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 backdrop-blur-md px-4 md:hidden shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors active:scale-95"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold leading-none tracking-tight">Prognosys</span>
              <span className="text-[9px] text-muted-foreground leading-tight">Predictive Maintenance</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {file ? (
            <span className="inline-flex items-center rounded-full bg-status-healthy-bg px-2.5 py-1 text-xs font-semibold text-status-healthy border border-status-healthy/20">
              <span className="h-1.5 w-1.5 rounded-full bg-status-healthy mr-1.5 animate-pulse" />
              Data Active
            </span>
          ) : (
            <Link
              to="/upload"
              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Upload className="h-3 w-3" />
              Upload
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className={cn(
          'flex-1 w-full min-w-0 transition-all duration-300',
          'pt-16 md:pt-0', // Account for mobile top bar
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
        )}
      >
        <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

