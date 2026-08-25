import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthPortal } from './pages/AuthPortal';
import { Dashboard } from './pages/Dashboard';
import { AcademicYears } from './pages/AcademicYears';
import { GradesSections } from './pages/GradesSections';
import { Students } from './pages/Students';
import { Subjects } from './pages/Subjects';
import { MarkEntry } from './pages/MarkEntry';
import { Reports } from './pages/Reports';
import { BackupRestore } from './pages/BackupRestore';
import { SettingsPage } from './pages/SettingsPage';
import { 
  LayoutDashboard, 
  CalendarRange, 
  GraduationCap, 
  Users, 
  BookOpen, 
  FileSpreadsheet, 
  FileText, 
  DatabaseBackup, 
  Settings, 
  LogOut,
  ShieldCheck
} from 'lucide-react';

const SidebarLink: React.FC<{
  view: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
        active 
          ? 'bg-primary text-primary-foreground shadow-md' 
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
};

const AppContent: React.FC = () => {
  const { 
    dbLoaded, 
    dbError,
    currentView, 
    setView, 
    logout, 
    settings
  } = useApp();

  if (dbError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md w-full p-6 bg-card border border-destructive/20 rounded-xl shadow-lg text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <span className="text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-bold text-foreground">Database Initialization Failed</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {dbError.includes('fetching of the wasm failed') 
              ? 'This desktop application must be opened inside Electron. Standard web browsers cannot read or write to the local system database files directly.'
              : `Error: ${dbError}`}
          </p>
          <div className="text-xs text-left bg-muted/50 p-3 rounded-lg border border-border space-y-1 text-muted-foreground font-mono">
            <p><strong>Environment:</strong> Browser Preview Mode</p>
            <p><strong>Guidance:</strong> Launch Sabyan Result System via the desktop installer shortcut or run npm run dev inside Electron.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dbLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground animate-pulse text-sm">Loading Sabyan Result System Database...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'onboarding' || currentView === 'login') return <AuthPortal />;

  const renderActiveView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'academic-years':
        return <AcademicYears />;
      case 'grades-sections':
        return <GradesSections />;
      case 'students':
        return <Students />;
      case 'subjects':
        return <Subjects />;
      case 'mark-entry':
        return <MarkEntry />;
      case 'reports':
        return <Reports />;
      case 'backup-restore':
        return <BackupRestore />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        {/* Branding header */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border shadow-sm shrink-0 bg-white">
            <img src="logo.png" className="h-full w-full object-contain" alt="Logo" />
          </div>
          <div>
            <h2 className="font-bold text-sm leading-tight text-foreground truncate max-w-[150px]">{settings.school_name}</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-3 w-3 text-emerald-500" /> School Admin
            </p>
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <SidebarLink 
            view="dashboard" 
            icon={<LayoutDashboard className="h-4 w-4" />} 
            label="Dashboard" 
            active={currentView === 'dashboard'} 
            onClick={() => setView('dashboard')} 
          />
          
          <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Academic Setup
          </div>
          <SidebarLink 
            view="academic-years" 
            icon={<CalendarRange className="h-4 w-4" />} 
            label="Academic Years" 
            active={currentView === 'academic-years'} 
            onClick={() => setView('academic-years')} 
          />
          <SidebarLink 
            view="grades-sections" 
            icon={<GraduationCap className="h-4 w-4" />} 
            label="Grades & Sections" 
            active={currentView === 'grades-sections'} 
            onClick={() => setView('grades-sections')} 
          />
          <SidebarLink 
            view="students" 
            icon={<Users className="h-4 w-4" />} 
            label="Students" 
            active={currentView === 'students'} 
            onClick={() => setView('students')} 
          />
          <SidebarLink 
            view="subjects" 
            icon={<BookOpen className="h-4 w-4" />} 
            label="Subjects" 
            active={currentView === 'subjects'} 
            onClick={() => setView('subjects')} 
          />

          <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Grading Engine
          </div>
          <SidebarLink 
            view="mark-entry" 
            icon={<FileSpreadsheet className="h-4 w-4" />} 
            label="Mark Entry" 
            active={currentView === 'mark-entry'} 
            onClick={() => setView('mark-entry')} 
          />

          <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Reports & Utility
          </div>
          <SidebarLink 
            view="reports" 
            icon={<FileText className="h-4 w-4" />} 
            label="Reports & Export" 
            active={currentView === 'reports'} 
            onClick={() => setView('reports')} 
          />
          <SidebarLink 
            view="backup-restore" 
            icon={<DatabaseBackup className="h-4 w-4" />} 
            label="Backup & Restore" 
            active={currentView === 'backup-restore'} 
            onClick={() => setView('backup-restore')} 
          />
          <SidebarLink 
            view="settings" 
            icon={<Settings className="h-4 w-4" />} 
            label="Settings" 
            active={currentView === 'settings'} 
            onClick={() => setView('settings')} 
          />
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3">
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border hover:border-destructive/20 rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-background/50">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
