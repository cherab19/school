import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Dialog } from '../components/ui/dialog';
import { AlertCircle, CheckCircle2, Lock, Unlock, Eye } from 'lucide-react';

interface Grade {
  id: number;
  name: string;
}

interface Section {
  id: number;
  grade_id: number;
  name: string;
}

interface Subject {
  id: number;
  name: string;
  grade_id: number;
}

interface StudentResult {
  student_id: string;
  student_name: string;
  total_score: number;
  status: 'DRAFT' | 'REVIEWED' | 'FINALIZED';
}

export const Results: React.FC = () => {
  const { activeSemesterId, settings } = useApp();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [currentLifecycleStatus, setCurrentLifecycleStatus] = useState<string>('DRAFT');

  // Modal Unlock Confirmation State
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load basic dropdown options
  useEffect(() => {
    try {
      const gRows = dbSelect<Grade>('SELECT * FROM grades ORDER BY id ASC');
      setGrades(gRows);
      if (gRows.length > 0) {
        setSelectedGradeId(String(gRows[0].id));
      }
    } catch (err) {
      setError('Failed to load grades.');
    }
  }, []);

  // Filter sections and subjects based on selected grade
  useEffect(() => {
    if (!selectedGradeId) return;
    try {
      const secRows = dbSelect<Section>(
        'SELECT * FROM sections WHERE grade_id = ? ORDER BY name ASC',
        [Number(selectedGradeId)]
      );
      setSections(secRows);
      if (secRows.length > 0) {
        setSelectedSectionId(String(secRows[0].id));
      } else {
        setSelectedSectionId('');
      }

      const subRows = dbSelect<Subject>(
        'SELECT * FROM subjects WHERE grade_id = ? AND status = "ACTIVE" ORDER BY name ASC',
        [Number(selectedGradeId)]
      );
      setSubjects(subRows);
      if (subRows.length > 0) {
        setSelectedSubjectId(String(subRows[0].id));
      } else {
        setSelectedSubjectId('');
      }
    } catch (err) {
      setError('Failed to load sections/subjects.');
    }
  }, [selectedGradeId]);

  const loadResults = () => {
    setError('');
    setSuccess('');
    
    if (!activeSemesterId || !selectedSectionId || !selectedSubjectId) {
      setStudentResults([]);
      setCurrentLifecycleStatus('DRAFT');
      return;
    }

    try {
      const rows = dbSelect<StudentResult>(
        `SELECT r.student_id, s.name as student_name, r.total_score, r.status
         FROM results r
         JOIN students s ON r.student_id = s.id
         WHERE r.semester_id = ? AND r.subject_id = ? AND s.section_id = ?
         ORDER BY s.name ASC`,
        [activeSemesterId, Number(selectedSubjectId), Number(selectedSectionId)]
      );
      setStudentResults(rows);

      if (rows.length > 0) {
        // Find consensus status (e.g. if any is finalized, we treat the section as finalized)
        const statuses = rows.map(r => r.status);
        if (statuses.includes('FINALIZED')) {
          setCurrentLifecycleStatus('FINALIZED');
        } else if (statuses.includes('REVIEWED')) {
          setCurrentLifecycleStatus('REVIEWED');
        } else {
          setCurrentLifecycleStatus('DRAFT');
        }
      } else {
        setCurrentLifecycleStatus('DRAFT');
      }
    } catch (err) {
      setError('Failed to load student scores.');
    }
  };

  useEffect(() => {
    loadResults();
  }, [activeSemesterId, selectedSectionId, selectedSubjectId]);

  const handleUpdateStatus = async (newStatus: 'REVIEWED' | 'FINALIZED') => {
    setError('');
    setSuccess('');
    
    if (studentResults.length === 0) {
      setError('No marks to transition. Enter marks first.');
      return;
    }

    try {
      dbRun(
        `UPDATE results SET status = ? 
         WHERE semester_id = ? AND subject_id = ? AND student_id IN (
           SELECT id FROM students WHERE section_id = ?
         )`,
        [newStatus, activeSemesterId, Number(selectedSubjectId), Number(selectedSectionId)]
      );
      await saveDatabase();

      const subName = subjects.find(s => s.id === Number(selectedSubjectId))?.name || '';
      const secName = sections.find(s => s.id === Number(selectedSectionId))?.name || '';
      await logAudit(
        'LIFECYCLE_UPDATE',
        'RESULTS',
        selectedSubjectId,
        `Updated results lifecycle status to ${newStatus} for subject "${subName}" (Section ${secName})`
      );

      setSuccess(`Results successfully updated to ${newStatus.toLowerCase()}.`);
      loadResults();
    } catch (err) {
      setError('Failed to update result lifecycle status.');
    }
  };

  const handleUnlockResults = async () => {
    setError('');
    setSuccess('');
    setIsUnlockOpen(false);

    try {
      dbRun(
        `UPDATE results SET status = 'DRAFT' 
         WHERE semester_id = ? AND subject_id = ? AND student_id IN (
           SELECT id FROM students WHERE section_id = ?
         )`,
        [activeSemesterId, Number(selectedSubjectId), Number(selectedSectionId)]
      );
      await saveDatabase();

      const subName = subjects.find(s => s.id === Number(selectedSubjectId))?.name || '';
      const secName = sections.find(s => s.id === Number(selectedSectionId))?.name || '';
      await logAudit(
        'UNLOCK_RESULTS',
        'RESULTS',
        selectedSubjectId,
        `Unlocked academic results (Draft state restored) for subject "${subName}" (Section ${secName}). Reason: ${unlockReason || 'Correction'}`
      );

      setSuccess('Results unlocked and reverted to DRAFT status.');
      setUnlockReason('');
      loadResults();
    } catch (err) {
      setError('Failed to unlock results.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Results & Lock</h1>
        <p className="text-muted-foreground text-sm font-light mt-1">Review calculated totals and finalize/lock marks to prevent modifications.</p>
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

      {/* Selectors Bar */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grade Level</label>
            <Select
              value={selectedGradeId}
              onChange={e => setSelectedGradeId(e.target.value)}
              options={grades.map(g => ({ value: g.id, label: g.name }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Section</label>
            <Select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              placeholder={sections.length === 0 ? "No Sections Configured" : "Select Section"}
              options={sections.map(s => ({ value: s.id, label: s.name }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject Profile</label>
            <Select
              value={selectedSubjectId}
              onChange={e => setSelectedSubjectId(e.target.value)}
              placeholder={subjects.length === 0 ? "No Subjects Configured" : "Select Subject"}
              options={subjects.map(sub => ({ value: sub.id, label: sub.name }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Results details */}
      {selectedSubjectId && selectedSectionId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List Scores Table */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Calculated Subject Totals</CardTitle>
                <CardDescription>Recalculated scores for this section.</CardDescription>
              </CardHeader>
              <CardContent>
                {studentResults.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm font-light">
                    No results found. Go to Mark Entry to enter marks and compute totals.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead className="text-right">Subject Score (100%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentResults.map(res => (
                        <TableRow key={res.student_id}>
                          <TableCell className="font-semibold text-muted-foreground">{res.student_id}</TableCell>
                          <TableCell className="font-medium text-foreground">{res.student_name}</TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {res.total_score.toFixed(settings.precision)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lifecycle control sidebar */}
          <div className="space-y-6">
            <Card className={currentLifecycleStatus === 'FINALIZED' ? 'border-red-500/30 bg-red-500/5' : ''}>
              <CardHeader>
                <CardTitle>Lifecycle Status</CardTitle>
                <CardDescription>Current status of these evaluation results.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                  {currentLifecycleStatus === 'FINALIZED' ? (
                    <Lock className="h-6 w-6 text-red-600" />
                  ) : (
                    <Unlock className="h-6 w-6 text-yellow-600 animate-pulse" />
                  )}
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-foreground">
                      {currentLifecycleStatus}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {currentLifecycleStatus === 'FINALIZED' 
                        ? 'Marks are locked. Score updates and assessments configurations are frozen.'
                        : 'Editable. Administrative revisions or mark logging is fully enabled.'
                      }
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {currentLifecycleStatus === 'DRAFT' && (
                    <Button 
                      variant="outline" 
                      onClick={() => handleUpdateStatus('REVIEWED')}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" /> Mark as Reviewed
                    </Button>
                  )}
                  
                  {currentLifecycleStatus !== 'FINALIZED' && (
                    <Button 
                      variant="primary" 
                      onClick={() => handleUpdateStatus('FINALIZED')}
                      className="bg-red-600 hover:bg-red-700 text-white gap-2"
                    >
                      <Lock className="h-4 w-4" /> Finalize & Lock
                    </Button>
                  )}

                  {currentLifecycleStatus === 'FINALIZED' && (
                    <Button 
                      variant="outline" 
                      onClick={() => setIsUnlockOpen(true)}
                      className="border-red-500/30 text-red-600 hover:bg-red-500/10 gap-2 cursor-pointer"
                    >
                      <Unlock className="h-4 w-4" /> Request Unlock
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Unlock Confirmation Dialog */}
      <Dialog
        isOpen={isUnlockOpen}
        onClose={() => setIsUnlockOpen(false)}
        title="Unlock Finalized Results"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-700 text-xs leading-relaxed">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Audit Trail Lock Override</p>
              <p className="mt-1">Unlocking finalized results will allow mark entries again. This override action will be permanently recorded in the system audit logs.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reason for unlocking (Optional)</label>
            <input
              type="text"
              value={unlockReason}
              onChange={e => setUnlockReason(e.target.value)}
              placeholder="e.g. Typing error in final exam scores"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsUnlockOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUnlockResults}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              I Understand, Unlock
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
