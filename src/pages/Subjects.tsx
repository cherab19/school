import React, { useState, useEffect } from 'react';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Dialog } from '../components/ui/dialog';
import { AlertCircle, CheckCircle2, Plus, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';

interface Subject {
  id: number;
  name: string;
  grade_id: number;
  status: 'ACTIVE' | 'INACTIVE';
  grade_name: string;
}

interface Grade {
  id: number;
  name: string;
}

export const Subjects: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [filterGradeId, setFilterGradeId] = useState<string>('');

  // Dialog & Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = () => {
    try {
      const gradesRows = dbSelect<Grade>('SELECT * FROM grades ORDER BY id ASC');
      setGrades(gradesRows);
      
      if (gradesRows.length > 0 && !filterGradeId) {
        setFilterGradeId(String(gradesRows[0].id));
      }

      const subjectRows = dbSelect<Subject>(`
        SELECT s.*, g.name as grade_name
        FROM subjects s
        JOIN grades g ON s.grade_id = g.id
        ORDER BY s.name ASC
      `);
      setSubjects(subjectRows);
    } catch (err) {
      setError('Failed to load subjects data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setSubjectId(null);
    setSubjectName('');
    setSelectedGrade(filterGradeId || (grades.length > 0 ? String(grades[0].id) : ''));
    setStatus('ACTIVE');
    setError('');
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (sub: Subject) => {
    setDialogMode('edit');
    setSubjectId(sub.id);
    setSubjectName(sub.name);
    setSelectedGrade(String(sub.grade_id));
    setStatus(sub.status);
    setError('');
    setIsDialogOpen(true);
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!subjectName.trim()) {
      setError('Subject Name is required');
      return;
    }
    if (!selectedGrade) {
      setError('Grade assignment is required');
      return;
    }

    const trimmedName = subjectName.trim();

    try {
      if (dialogMode === 'add') {
        // Check duplicate name per grade
        const exists = dbSelect('SELECT id FROM subjects WHERE name = ? AND grade_id = ?', [trimmedName, Number(selectedGrade)]);
        if (exists.length > 0) {
          setError(`Subject "${trimmedName}" is already defined for this grade.`);
          return;
        }

        dbRun(
          'INSERT INTO subjects (name, grade_id, status) VALUES (?, ?, ?)',
          [trimmedName, Number(selectedGrade), 'ACTIVE']
        );
        await saveDatabase();

        const gradeName = grades.find(g => g.id === Number(selectedGrade))?.name || '';
        await logAudit('CREATE', 'SUBJECT', trimmedName, `Added subject "${trimmedName}" to ${gradeName}`);
        setSuccess(`Subject "${trimmedName}" added successfully.`);
      } else {
        dbRun(
          'UPDATE subjects SET name = ?, grade_id = ?, status = ? WHERE id = ?',
          [trimmedName, Number(selectedGrade), status, subjectId]
        );
        await saveDatabase();
        await logAudit('UPDATE', 'SUBJECT', String(subjectId), `Updated details for subject ID ${subjectId}`);
        setSuccess(`Subject "${trimmedName}" details updated.`);
      }

      setIsDialogOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save subject.');
    }
  };

  const handleToggleStatus = async (sub: Subject) => {
    setError('');
    setSuccess('');
    const newStatus = sub.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      // Safety check: check if scores already exist for this subject
      const marksCount = dbSelect<{ count: number }>(
        'SELECT COUNT(*) as count FROM marks WHERE subject_id = ?',
        [sub.id]
      );
      if (newStatus === 'INACTIVE' && marksCount[0].count > 0) {
        setError(`Cannot deactivate "${sub.name}" because active student scores are recorded under it.`);
        return;
      }

      dbRun('UPDATE subjects SET status = ? WHERE id = ?', [newStatus, sub.id]);
      await saveDatabase();
      await logAudit('TOGGLE_STATUS', 'SUBJECT', String(sub.id), `Toggled subject status to ${newStatus} for "${sub.name}"`);
      setSuccess(`Subject "${sub.name}" is now ${newStatus.toLowerCase()}.`);
      loadData();
    } catch (err: any) {
      setError('Failed to update subject status.');
    }
  };

  // Filter subjects based on selected Grade Level in UI
  const filteredSubjects = subjects.filter(
    sub => filterGradeId === '' || sub.grade_id === Number(filterGradeId)
  );

  const activeFilterGradeName = grades.find(g => g.id === Number(filterGradeId))?.name || 'All Grades';

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Subjects</h1>
          <p className="text-muted-foreground text-sm font-light mt-1">Configure custom subjects and assign them to grade levels.</p>
        </div>
        <Button onClick={handleOpenAddDialog} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add Subject
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-4 text-sm text-destructive font-medium border border-destructive/20 animate-in slide-in-from-top-1">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-4 text-sm text-emerald-600 font-medium border border-emerald-500/20 animate-in slide-in-from-top-1">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left pane: Grade Filter */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Grade Selection</CardTitle>
            <CardDescription>Filter subjects by grade level.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {grades.map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    setFilterGradeId(String(g.id));
                    setError('');
                    setSuccess('');
                  }}
                  className={`w-full px-6 py-4 text-left transition-colors cursor-pointer text-sm ${
                    filterGradeId === String(g.id)
                      ? 'bg-primary/5 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right pane: Subjects list */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Subjects for {activeFilterGradeName}</CardTitle>
            <CardDescription>All academic subjects defined for this grade level.</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredSubjects.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm font-light">
                No subjects defined for {activeFilterGradeName} yet. Click "Add Subject" above to create one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject Name</TableHead>
                    <TableHead>Assigned Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubjects.map(sub => (
                    <TableRow key={sub.id} className={sub.status === 'INACTIVE' ? 'opacity-65' : ''}>
                      <TableCell className="font-semibold text-foreground">{sub.name}</TableCell>
                      <TableCell>{sub.grade_name}</TableCell>
                      <TableCell>
                        {sub.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                            Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditDialog(sub)}
                          title="Edit Subject"
                          className="cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(sub)}
                          title={sub.status === 'ACTIVE' ? 'Deactivate Subject' : 'Activate Subject'}
                          className={`cursor-pointer ${sub.status === 'ACTIVE' ? 'text-yellow-600' : 'text-emerald-600'}`}
                        >
                          {sub.status === 'ACTIVE' ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog for Add/Edit Subject */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={dialogMode === 'add' ? 'Add Custom Subject' : 'Edit Subject Details'}
      >
        <form onSubmit={handleSaveSubject} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/15 p-3 text-xs text-destructive font-medium border border-destructive/10">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subject Name</label>
            <Input
              value={subjectName}
              onChange={e => setSubjectName(e.target.value)}
              placeholder="e.g. Mathematics"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Grade Assignment</label>
            <Select
              value={selectedGrade}
              onChange={e => setSelectedGrade(e.target.value)}
              options={grades.map(g => ({ value: g.id, label: g.name }))}
            />
          </div>

          {dialogMode === 'edit' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={status}
                onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                options={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' }
                ]}
              />
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {dialogMode === 'add' ? 'Add Subject' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
