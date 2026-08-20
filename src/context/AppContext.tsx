import React, { createContext, useContext, useState, useEffect } from 'react';
import { initDatabase, dbSelect, dbRun } from '../services/db';

export type ViewType = 
  | 'login'
  | 'onboarding'
  | 'dashboard'
  | 'academic-years'
  | 'grades-sections'
  | 'students'
  | 'subjects'
  | 'mark-entry'
  | 'reports'
  | 'backup-restore'
  | 'settings';

interface AppSettings {
  school_name: string;
  precision: number;
  ranking_enabled: boolean;
  annual_policy: string; // e.g. "50/50" or "none"
}

interface AppContextType {
  dbLoaded: boolean;
  dbError: string | null;
  isFirstRun: boolean;
  currentView: ViewType;
  setView: (view: ViewType) => void;
  currentUser: string | null;
  login: (username: string, passwordHash: string) => Promise<boolean>;
  logout: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  activeYearId: number | null;
  activeSemesterId: number | null;
  setActiveYearId: (id: number | null) => void;
  setActiveSemesterId: (id: number | null) => void;
  refreshState: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [currentView, setView] = useState<ViewType>('login');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  
  const [settings, setSettings] = useState<AppSettings>({
    school_name: 'Sabiyan No.1 Primary and Secondary School',
    precision: 1,
    ranking_enabled: false,
    annual_policy: '50/50'
  });

  const [activeYearId, setActiveYearId] = useState<number | null>(null);
  const [activeSemesterId, setActiveSemesterId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshState = () => setRefreshTrigger(prev => prev + 1);

  // Initialize DB and load configuration
  useEffect(() => {
    async function loadApp() {
      try {
        setDbError(null);
        await initDatabase();
        setDbLoaded(true);

        // Check if Admin exists
        const users = dbSelect('SELECT * FROM users LIMIT 1');
        if (users.length === 0) {
          setIsFirstRun(true);
          setView('onboarding');
        } else {
          setIsFirstRun(false);
          setView('login');
        }

        // Load Settings
        const dbSettings = dbSelect<{ key: string; value: string }>('SELECT * FROM settings');
        const loadedSettings: Partial<AppSettings> = {};
        dbSettings.forEach(s => {
          if (s.key === 'school_name') loadedSettings.school_name = s.value;
          if (s.key === 'precision') loadedSettings.precision = parseInt(s.value, 10);
          if (s.key === 'ranking_enabled') loadedSettings.ranking_enabled = s.value === 'true';
          if (s.key === 'annual_policy') loadedSettings.annual_policy = s.value;
        });
        
        setSettings(prev => ({ ...prev, ...loadedSettings }));

        // Load active year & semester if any
        const activeYear = dbSelect<{ id: number }>('SELECT id FROM academic_years WHERE status = "ACTIVE" LIMIT 1');
        if (activeYear.length > 0) {
          setActiveYearId(activeYear[0].id);
          const activeSem = dbSelect<{ id: number }>(
            'SELECT id FROM semesters WHERE academic_year_id = ? AND status = "ACTIVE" LIMIT 1',
            [activeYear[0].id]
          );
          if (activeSem.length > 0) {
            setActiveSemesterId(activeSem[0].id);
          }
        }
      } catch (err: any) {
        console.error('Database load error in React:', err);
        setDbError(err.message || String(err));
      }
    }
    loadApp();
  }, [refreshTrigger]);

  const login = async (username: string, passwordHash: string): Promise<boolean> => {
    const matched = dbSelect(
      'SELECT * FROM users WHERE username = ? AND password_hash = ?',
      [username.trim().toLowerCase(), passwordHash]
    );
    if (matched.length > 0) {
      setCurrentUser(username);
      setView('dashboard');
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setView('login');
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    Object.entries(newSettings).forEach(([key, val]) => {
      dbRun(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(val)]
      );
    });
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <AppContext.Provider
      value={{
        dbLoaded,
        dbError,
        isFirstRun,
        currentView,
        setView,
        currentUser,
        login,
        logout,
        settings,
        updateSettings,
        activeYearId,
        activeSemesterId,
        setActiveYearId,
        setActiveSemesterId,
        refreshState
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
