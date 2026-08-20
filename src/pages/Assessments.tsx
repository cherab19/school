import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Dialog } from '../components/ui/dialog';
import { AlertCircle, CheckCircle2, Plus, Edit2, Trash2, ShieldAlert, Scale } from 'lucide-react';

interface Assessment {
  id: number;
  subject_id: number;
  semester_id: number;
  section_id: number;
  name: string;
  max_mark: number;
  weight: number;
  sequence: number;
  status: 'ACTIVE' | 'INACTIVE';
}

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
  status: 'ACTIVE' | 'INACTIVE';
}

export const Assessments: React.FC = () => {
  const { activeSemesterId } = useApp();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const [assessments, setAssessments] = useState<Assessment[]>([]);

  // Dialog & Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [assessmentName, setAssessmentName] = useState('');
  const [maxMark, setMaxMark] = useState('');
  const [weight, setWeight] = useState('');
  const [sequence, setSequence] = useState('1');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

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

  // Load assessments based on selections
  const loadAssessments = () => {
    if (!activeSemesterId || !selectedSectionId || !selectedSubjectId) {
      setAssessments([]);
      return;
    }

    try {
      const rows = dbSelect<Assessment>(
        `SELECT * FROM assessments 
         WHERE semester_id = ? AND section_id = ? AND subject_id = ? 
         ORDER BY sequence ASC`,
        [activeSemesterId, Number(selectedSectionId), Number(selectedSubjectId)]
      );
      setAssessments(rows);
    } catch (err) {
      setError('Failed to load assessments.');
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [activeSemesterId, selectedSectionId, selectedSubjectId]);

  // Calculations
  const activeAssessments = assessments.filter(a => a.status === 'ACTIVE');
  const totalWeight = activeAssessments.reduce((sum, a) => sum + a.weight, 0);
  const isWeightValid = totalWeight === 100;

  const handleOpenAddDialog = () => {
    setError('');
    setSuccess('');
    if (!activeSemesterId) {
      setError('No active semester configured. Please activate a semester first.');
      return;
    }
    if (!selectedSectionId) {
      setError('A section must be selected.');
      return;
    }
    if (!selectedSubjectId) {
      setError('A subject must be selected.');
      return;
    }

    setDialogMode('add');
    setAssessmentId(null);
    setAssessmentName('');
    setMaxMark('');
    setWeight('');
    setSequence(String(assessments.length + 1));
    setStatus('ACTIVE');
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (ass: Assessment) => {
    setError('');
    setSuccess('');
    setDialogMode('edit');
    setAssessmentId(ass.id);
    setAssessmentName(ass.name);
    setMaxMark(String(ass.max_mark));
    setWeight(String(ass.weight));
    setSequence(String(ass.sequence));
    setStatus(ass.status);
    setIsDialogOpen(true);
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!assessmentName.trim()) {
      setError('Assessment name is required.');
      return;
    }
    
    const maxVal = parseFloat(maxMark);
    if (isNaN(maxVal) || maxVal <= 0) {
      setError('Maximum mark must be a number greater than 0.');
      return;
    }

    const weightVal = parseFloat(weight);
    if (isNaN(weightVal) || weightVal <= 0) {
      setError('Weight must be a number greater than 0%.');
      return;
    }

    const seqVal = parseInt(sequence, 10);
    if (isNaN(seqVal) || seqVal < 0) {
      setError('Ordering sequence must be a non-negative number.');
      return;
    }

    // Weight limit validation: sum of weights for ACTIVE assessments in this subject must not exceed 100%
    const currentActiveWeightOfOthers = activeAssessments
      .filter(a => dialogMode === 'add' || a.id !== assessmentId)
      .reduce((sum, a) => sum + a.weight, 0);

    if (status === 'ACTIVE' && (currentActiveWeightOfOthers + weightVal > 100)) {
      setError(`Cannot save: Total active weight would be ${currentActiveWeightOfOthers + weightVal}%, which exceeds the 100% maximum weight limit.`);
      return;
    }

    try {
      if (dialogMode === 'add') {
        // Unique name validation for the section-semester-subject
        const exist = dbSelect(
          `SELECT id FROM assessments 
           WHERE semester_id = ? AND section_id = ? AND subject_id = ? AND name = ?`,
          [activeSemesterId, Number(selectedSectionId), Number(selectedSubjectId), assessmentName.trim()]
        );
        if (exist.length > 0) {
          setError(`Assessment "${assessmentName.trim()}" already exists for this subject profile.`);
          return;
        }

        dbRun(
          `INSERT INTO assessments (subject_id, semester_id, section_id, name, max_mark, weight, sequence, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [Number(selectedSubjectId), activeSemesterId, Number(selectedSectionId), assessmentName.trim(), maxVal, weightVal, seqVal, 'ACTIVE']
        );
        await saveDatabase();
        await logAudit('CREATE', 'ASSESSMENT', assessmentName.trim(), `Created assessment "${assessmentName.trim()}" (${weightVal}%) for subject ID ${selectedSubjectId}`);
        setSuccess(`Assessment "${assessmentName.trim()}" created.`);
      } else {
        dbRun(
          `UPDATE assessments SET name = ?, max_mark = ?, weight = ?, sequence = ?, status = ? WHERE id = ?`,
          [assessmentName.trim(), maxVal, weightVal, seqVal, status, assessmentId]
        );
        await saveDatabase();
        await logAudit('UPDATE', 'ASSESSMENT', String(assessmentId), `Updated assessment "${assessmentName.trim()}"`);
        setSuccess(`Assessment "${assessmentName.trim()}" updated.`);
      }

      setIsDialogOpen(false);
      loadAssessments();
    } catch (err: any) {
      setError(err.message || 'Failed to save assessment configuration.');
    }
  };

  const handleDeleteAssessment = async (ass: Assessment) => {
    setError('');
    setSuccess('');

    try {
      // Safety: verify if student marks exist under this assessment
      const marksCount = dbSelect<{ count: number }>(
        'SELECT COUNT(*) as count FROM marks WHERE assessment_id = ?',
        [ass.id]
      );
      if (marksCount[0].count > 0) {
        setError(`Cannot delete assessment: Student marks are already entered under "${ass.name}". Deactivate it instead.`);
        return;
      }

      dbRun('DELETE FROM assessments WHERE id = ?', [ass.id]);
      await saveDatabase();
      await logAudit('DELETE', 'ASSESSMENT', ass.name, `Deleted assessment profile "${ass.name}" (ID ${ass.id})`);
      setSuccess(`Assessment "${ass.name}" deleted.`);
      loadAssessments();
    } catch (err) {
      setError('Failed to delete assessment.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Assessments</h1>
          <p className="text-muted-foreground text-sm font-light mt-1">Configure subjects evaluation criteria. Active assessment weights must sum to exactly 100%.</p>
        </div>
        <Button onClick={handleOpenAddDialog} className="gap-2 shrink-0" disabled={!selectedSubjectId || !selectedSectionId}>
          <Plus className="h-4 w-4" /> Add Assessment
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-4 text-sm text-destructive font-medium border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-4 text-sm text-emerald-600 font-medium border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Dropdown selectors */}
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

      {/* Assessment Weights Indicator Banner */}
      {selectedSubjectId && selectedSectionId && (
        <Card className={isWeightValid ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
          <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Scale className={`h-6 w-6 ${isWeightValid ? 'text-emerald-600' : 'text-amber-600'}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Assessment Weight Status: {totalWeight}%
                </p>
                <p className="text-xs text-muted-foreground font-light">
                  {isWeightValid 
                    ? "Weight matches 100%! Mark entry for this profile is fully enabled."
                    : `Active weights total ${totalWeight}%. Active weights must sum to exactly 100% before score entries are permitted.`
                  }
                </p>
              </div>
            </div>
            {!isWeightValid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 border border-amber-500/20">
                <ShieldAlert className="h-3 w-3" /> Adjust weights
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assessments list */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Setup</CardTitle>
          <CardDescription>Configure quizzes, finals, and classworks for this evaluation context.</CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedSubjectId || !selectedSectionId ? (
            <div className="text-center py-8 text-muted-foreground text-sm font-light">
              Select a Grade, Section, and Subject above to configure evaluations.
            </div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm font-light">
              No assessments configured yet. Click "Add Assessment" to create the first item.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Seq</TableHead>
                  <TableHead>Assessment Name</TableHead>
                  <TableHead>Maximum Mark</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map(ass => (
                  <TableRow key={ass.id} className={ass.status === 'INACTIVE' ? 'opacity-65' : ''}>
                    <TableCell className="font-semibold text-muted-foreground">{ass.sequence}</TableCell>
                    <TableCell className="font-semibold text-foreground">{ass.name}</TableCell>
                    <TableCell>{ass.max_mark}</TableCell>
                    <TableCell className="font-semibold text-foreground">{ass.weight}%</TableCell>
                    <TableCell>
                      {ass.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600">
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditDialog(ass)}
                        title="Edit Assessment"
                        className="cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAssessment(ass)}
                        title="Delete Assessment"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={dialogMode === 'add' ? 'Add Evaluation Criteria' : 'Edit Evaluation Criteria'}
      >
        <form onSubmit={handleSaveAssessment} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/15 p-3 text-xs text-destructive font-medium border border-destructive/10">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assessment Name</label>
            <Input
              value={assessmentName}
              onChange={e => setAssessmentName(e.target.value)}
              placeholder="e.g. Midterm, Quiz 1, Project"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Maximum Score Value</label>
              <Input
                value={maxMark}
                onChange={e => setMaxMark(e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Weight Percentage (%)</label>
              <Input
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Order Sequence</label>
              <Input
                type="number"
                value={sequence}
                onChange={e => setSequence(e.target.value)}
                placeholder="1"
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
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {dialogMode === 'add' ? 'Add Criteria' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
