import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Activity,
  TrendingDown,
  GitBranch,
  Shield,
  Lightbulb,
  Info,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Brain,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppData } from '@/context/AppContext';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

export const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Upload Data', href: '/upload', icon: Upload },
  { title: 'Machine Health', href: '/health', icon: Activity },
  { title: 'Degradation Speed', href: '/degradation', icon: TrendingDown },
  { title: 'Pattern Clustering', href: '/clustering', icon: GitBranch },
  { title: 'Reliability', href: '/reliability', icon: Shield },
  { title: 'Insights', href: '/insights', icon: Lightbulb },
  { title: 'Explainable AI', href: '/explainability', icon: Brain },
  { title: 'Model Evaluation', href: '/evaluation', icon: Cpu },
  { title: 'About', href: '/about', icon: Info },
];

export function Sidebar() {
  const { 
    sidebarCollapsed: collapsed, 
    setSidebarCollapsed: setCollapsed,
    mobileMenuOpen,
    setMobileMenuOpen
  } = useAppData();
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  return (
    <>
      {/* 📱 MOBILE BACKDROP */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs md:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 📱 MOBILE SLIDE-OVER DRAWER */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar transition-transform duration-300 ease-in-out md:hidden shadow-2xl',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Cpu className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-sidebar-foreground">Prognosys</span>
              <span className="text-[10px] text-sidebar-foreground/60 leading-none">Machine Analytics</span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Nav Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-all duration-200',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs'
                    : 'text-sidebar-foreground/75'
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile Drawer Footer */}
        <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/50 text-center">
          Prognosys v1.0
        </div>
      </div>

      {/* 💻 DESKTOP SIDEBAR */}
      <aside
        className={cn(
          'hidden md:flex flex-col fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className={cn('flex items-center gap-3', collapsed && 'justify-center w-full')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <Cpu className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-lg font-bold text-sidebar-foreground leading-tight">Prognosys</span>
                <span className="text-[10px] text-sidebar-foreground/60 leading-none truncate">Machine Analytics</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="flex-1 overflow-y-auto flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.href}
                to={item.href}
                title={collapsed ? item.title : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-sidebar-foreground/70',
                  collapsed && 'justify-center px-2'
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            'absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-elevated',
            'hover:bg-primary-hover transition-colors z-50'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </aside>
    </>
  );
}

