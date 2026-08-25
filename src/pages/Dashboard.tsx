import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect } from '../services/db';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/card';
import { Users, GraduationCap, School, BookOpen, Clock, FileSpreadsheet, FileText, Database, ArrowRight } from 'lucide-react';

interface Stats {
  studentsCount: number;
  subjectsCount: number;
  gradesCount: number;
  sectionsCount: number;
}

interface RecentLog {
  id: number;
  timestamp: string;
  action: string;
  description: string;
}

export const Dashboard: React.FC = () => {
  const { setView, activeYearId, activeSemesterId, settings } = useApp();
  const [stats, setStats] = useState<Stats>({
    studentsCount: 0,
    subjectsCount: 0,
    gradesCount: 0,
    sectionsCount: 0,
  });
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [academicYearName, setAcademicYearName] = useState('N/A');
  const [semesterName, setSemesterName] = useState('N/A');

  useEffect(() => {
    try {
      // 1. Fetch counts
      const students = dbSelect<{ count: number }>('SELECT COUNT(*) as count FROM students WHERE status = "ACTIVE"');
      const subjects = dbSelect<{ count: number }>('SELECT COUNT(*) as count FROM subjects WHERE status = "ACTIVE"');
      const grades = dbSelect<{ count: number }>('SELECT COUNT(*) as count FROM grades');
      const sections = dbSelect<{ count: number }>('SELECT COUNT(*) as count FROM sections');

      setStats({
        studentsCount: students[0]?.count || 0,
        subjectsCount: subjects[0]?.count || 0,
        gradesCount: grades[0]?.count || 0,
        sectionsCount: sections[0]?.count || 0,
      });

      // 2. Fetch recent logs
      const logs = dbSelect<RecentLog>(
        'SELECT id, timestamp, action, description FROM audit_logs ORDER BY id DESC LIMIT 5'
      );
      setRecentLogs(logs);

      // 3. Fetch Year & Semester names
      if (activeYearId) {
        const yearRow = dbSelect<{ name: string }>('SELECT name FROM academic_years WHERE id = ?', [activeYearId]);
        if (yearRow.length > 0) setAcademicYearName(yearRow[0].name);
      }
      if (activeSemesterId) {
        const semRow = dbSelect<{ name: string }>('SELECT name FROM semesters WHERE id = ?', [activeSemesterId]);
        if (semRow.length > 0) setSemesterName(semRow[0].name);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }, [activeYearId, activeSemesterId]);

  return (
    <div className="space-y-8 animate-in fade-in-50">
      
      {/* Welcome & Context Banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 rounded-2xl border border-primary/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Welcome to {settings.school_name}</h1>
        </div>
        <div className="flex items-center gap-3 bg-card px-4 py-2.5 rounded-xl border border-border shadow-sm">
          <div className="text-xs">
            <span className="text-muted-foreground">Active Term: </span>
            <strong className="text-foreground">{academicYearName} — {semesterName}</strong>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-all border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Students</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.studentsCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Active enrollments in section rosters</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-l-4 border-l-indigo-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Subjects</CardTitle>
            <BookOpen className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.subjectsCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Assigned evaluation courses</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configured Grades</CardTitle>
            <GraduationCap className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.gradesCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Academic grade tiers active</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Sections</CardTitle>
            <School className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sectionsCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Registered classroom sections</p>
          </CardContent>
        </Card>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Quick Actions Hub */}
        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">Quick Actions Hub</CardTitle>
              <CardDescription>Shortcut utilities to manage grading records and backups</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <button 
                onClick={() => setView('mark-entry')}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Mark Entry</h3>
                    <p className="text-[10px] text-muted-foreground">Input scores horizontally</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

              <button 
                onClick={() => setView('reports')}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Reports & Export</h3>
                    <p className="text-[10px] text-muted-foreground">Generate PDFs and Excel sheets</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

              <button 
                onClick={() => setView('grades-sections')}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <School className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Grades & Sections</h3>
                    <p className="text-[10px] text-muted-foreground">Manage school classroom groups</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

              <button 
                onClick={() => setView('backup-restore')}
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Backup & Restore</h3>
                    <p className="text-[10px] text-muted-foreground">Local sandbox & backups</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>

            </CardContent>
          </Card>
        </div>

        {/* Right Column: Mini Audit Logs */}
        <div className="lg:col-span-5">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Recent System Logs</CardTitle>
                <CardDescription>Security activity logs for local node modifications</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {recentLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm font-light">
                  No system logs recorded yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="p-3 rounded-xl border border-border bg-muted/20 text-xs space-y-1">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wider text-[8px] px-1.5 py-0.5 rounded bg-muted-foreground/10 text-foreground">
                          {log.action}
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-foreground font-medium pt-0.5">{log.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

    </div>
  );
};
