import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { AlertCircle, CheckCircle2, CircleDot, Play, Lock } from 'lucide-react';

interface AcademicYear {
  id: number;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface Semester {
  id: number;
  academic_year_id: number;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'FINALIZED';
}

export const AcademicYears: React.FC = () => {
  const { refreshState, activeYearId } = useApp();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [newYearName, setNewYearName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = () => {
    try {
      // Retrieve only active year, fallback to latest created year if none are active
      let yearRows = dbSelect<AcademicYear>('SELECT * FROM academic_years WHERE status = "ACTIVE" LIMIT 1');
      if (yearRows.length === 0) {
        yearRows = dbSelect<AcademicYear>('SELECT * FROM academic_years ORDER BY id DESC LIMIT 1');
      }
      setYears(yearRows);

      if (activeYearId) {
        const semRows = dbSelect<Semester>(
          'SELECT * FROM semesters WHERE academic_year_id = ? ORDER BY name ASC',
          [activeYearId]
        );
        setSemesters(semRows);
      } else {
        setSemesters([]);
      }
    } catch (err: any) {
      setError('Failed to load academic years data');
    }
  };

  useEffect(() => {
    loadData();
  }, [activeYearId]);

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!/^\d{4}\/\d{4}$/.test(newYearName)) {
      setError('Academic Year must follow YYYY/YYYY format (e.g. 2027/2028)');
      return;
    }

    try {
      // Check duplicate
      const exist = dbSelect('SELECT id FROM academic_years WHERE name = ?', [newYearName]);
      if (exist.length > 0) {
        setError('Academic year already exists');
        return;
      }

      // If no active years exist, make this active. Otherwise inactive.
      const activeYears = dbSelect('SELECT id FROM academic_years WHERE status = "ACTIVE"');
      const initialStatus = activeYears.length === 0 ? 'ACTIVE' : 'INACTIVE';

      dbRun('INSERT INTO academic_years (name, status) VALUES (?, ?)', [newYearName, initialStatus]);
      
      // Auto-create semesters
      dbRun(`
        INSERT INTO semesters (academic_year_id, name, status) 
        VALUES 
          ((SELECT id FROM academic_years WHERE name = ?), 'Semester 1', 'ACTIVE'),
          ((SELECT id FROM academic_years WHERE name = ?), 'Semester 2', 'DRAFT')
      `, [newYearName, newYearName]);

      await saveDatabase();
      await logAudit('CREATE', 'ACADEMIC_YEAR', newYearName, `Created academic year ${newYearName} with initial semesters`);

      setSuccess(`Academic year ${newYearName} created successfully!`);
      setNewYearName('');
      refreshState();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create academic year');
    }
  };

  const handleSetYearActive = async (year: AcademicYear) => {
    setError('');
    setSuccess('');
    try {
      // Set all to inactive
      dbRun('UPDATE academic_years SET status = "INACTIVE"');
      // Set selected to active
      dbRun('UPDATE academic_years SET status = "ACTIVE" WHERE id = ?', [year.id]);

      await saveDatabase();
      await logAudit('SET_ACTIVE', 'ACADEMIC_YEAR', year.name, `Set academic year ${year.name} as active`);

      setSuccess(`Academic year ${year.name} is now active.`);
      refreshState();
      loadData();
    } catch (err: any) {
      setError('Failed to update active year');
    }
  };

  const handleUpdateSemesterStatus = async (sem: Semester, newStatus: 'ACTIVE' | 'FINALIZED') => {
    setError('');
    setSuccess('');
    try {
      if (newStatus === 'ACTIVE') {
        if (sem.name.toLowerCase().includes('semester 2')) {
          // Check if Semester 1 is finalized
          const sem1 = dbSelect<Semester>(
            "SELECT status FROM semesters WHERE academic_year_id = ? AND name LIKE '%Semester 1%'",
            [sem.academic_year_id]
          );
          if (sem1.length > 0 && sem1[0].status !== 'FINALIZED') {
            setError('Chronological Order Constraint: Semester 1 must be FINALIZED before Semester 2 can be activated.');
            return;
          }
        }

        // Set other semesters of this academic year to DRAFT (or keep finalized)
        dbRun(
          'UPDATE semesters SET status = "DRAFT" WHERE academic_year_id = ? AND status = "ACTIVE"',
          [sem.academic_year_id]
        );
      }

      dbRun('UPDATE semesters SET status = ? WHERE id = ?', [newStatus, sem.id]);

      await saveDatabase();
      await logAudit(
        'UPDATE_STATUS', 
        'SEMESTER', 
        sem.name, 
        `Updated semester ${sem.name} status to ${newStatus} for academic year ID ${sem.academic_year_id}`
      );

      setSuccess(`Semester updated to ${newStatus} successfully.`);
      refreshState();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update semester status');
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Academic Structure</h1>
          <p className="text-muted-foreground text-sm font-light mt-1">Configure academic cycles and manage semester states.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-4 text-sm text-destructive font-medium border border-destructive/20 animate-in fade-in-50">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-4 text-sm text-emerald-600 font-medium border border-emerald-500/20 animate-in fade-in-50">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Create and List Academic Years */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Academic Years</CardTitle>
              <CardDescription>All configured academic cycles. Activate one to manage its grading lifecycle.</CardDescription>
            </CardHeader>
            <CardContent>
              {years.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No academic years configured. Use the form on the right to add one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Academic Year</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {years.map((year) => {
                      const isActive = year.status === 'ACTIVE';
                      return (
                        <TableRow key={year.id} className={isActive ? 'bg-primary/5' : ''}>
                          <TableCell className="font-semibold text-foreground">
                            {year.name}
                          </TableCell>
                          <TableCell>
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                Inactive
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetYearActive(year)}
                                className="gap-1.5"
                              >
                                <Play className="h-3 w-3" /> Set Active
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Form & Semesters Panel */}
        <div className="space-y-6">
          {/* Add Year Card */}
          <Card>
            <CardHeader>
              <CardTitle>New Academic Year</CardTitle>
              <CardDescription>Introduce a new academic year to the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateYear} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Year Name</label>
                  <Input
                    value={newYearName}
                    onChange={(e) => setNewYearName(e.target.value)}
                    placeholder="e.g. 2027/2028"
                  />
                  <p className="text-[11px] text-muted-foreground">Must be YYYY/YYYY format.</p>
                </div>
                <Button type="submit" className="w-full">
                  Create Academic Year
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Semesters Card for active year */}
          <Card>
            <CardHeader>
              <CardTitle>Semesters Status</CardTitle>
              <CardDescription>Manage states for the current active academic year.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {semesters.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Select an active academic year to configure semesters.
                </div>
              ) : (
                semesters.map((sem) => (
                  <div 
                    key={sem.id} 
                    className={`p-4 rounded-xl border flex flex-col gap-3 transition-colors ${
                      sem.status === 'ACTIVE' 
                        ? 'border-primary/30 bg-primary/5' 
                        : sem.status === 'FINALIZED'
                        ? 'border-border bg-muted/40 opacity-80'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-foreground">{sem.name}</h4>
                      <div>
                        {sem.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-600">
                            <CircleDot className="h-2.5 w-2.5" /> Draft
                          </span>
                        )}
                        {sem.status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            <Play className="h-2.5 w-2.5 animate-pulse" /> Active
                          </span>
                        )}
                        {sem.status === 'FINALIZED' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            <Lock className="h-2.5 w-2.5" /> Locked
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {sem.status === 'DRAFT' && (
                        <Button 
                          variant="primary" 
                          size="sm" 
                          className="flex-1 text-xs h-8"
                          onClick={() => handleUpdateSemesterStatus(sem, 'ACTIVE')}
                        >
                          Activate
                        </Button>
                      )}
                      {sem.status === 'ACTIVE' && (
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="flex-1 text-xs h-8"
                          onClick={() => handleUpdateSemesterStatus(sem, 'FINALIZED')}
                        >
                          Lock & Finalize
                        </Button>
                      )}
                      {sem.status === 'FINALIZED' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-xs h-8 border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10 cursor-pointer"
                          onClick={() => handleUpdateSemesterStatus(sem, 'ACTIVE')}
                        >
                          Unlock Semester
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
