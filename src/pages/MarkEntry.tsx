import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Input } from '../components/ui/input';

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

interface Student {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  name: string;
  scores: Record<number, string>; // subject_id -> score string
  total: number;
  average: number;
  rank: number;
  annualTotal?: number;
  annualAverage?: number;
  annualRank?: number;
}

export const MarkEntry: React.FC = () => {
  const { activeSemesterId } = useApp();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [gridRows, setGridRows] = useState<StudentRow[]>([]);
  const [cellErrors, setCellErrors] = useState<Record<string, Record<number, boolean>>>({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [isSemester2, setIsSemester2] = useState(false);
  const [sem1Marks, setSem1Marks] = useState<Record<string, Record<number, number>>>({});

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 1. Fetch grades on mount
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

  // 2. Fetch sections and active subjects when grade changes
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
    } catch (err) {
      setError('Failed to load sections/subjects.');
    }
  }, [selectedGradeId]);

  // 3. Load students and their scores for the grid
  const loadGrid = () => {
    setError('');
    setSuccess('');
    setCellErrors({});

    if (!activeSemesterId || !selectedSectionId || subjects.length === 0) {
      setStudents([]);
      setGridRows([]);
      return;
    }

    try {
      // Fetch active students in section
      const studRows = dbSelect<Student>(
        'SELECT id, name FROM students WHERE section_id = ? AND status = "ACTIVE" ORDER BY name ASC',
        [Number(selectedSectionId)]
      );
      setStudents(studRows);

      if (studRows.length === 0) {
        setGridRows([]);
        return;
      }

      // Check if current semester is Semester 2
      const semRows = dbSelect<{ academic_year_id: number; name: string }>(
        'SELECT academic_year_id, name FROM semesters WHERE id = ?',
        [activeSemesterId]
      );
      let isSem2 = false;
      let sem1Data: Record<string, Record<number, number>> = {};

      if (semRows.length > 0 && semRows[0].name.toLowerCase().includes('semester 2')) {
        isSem2 = true;
        const sem1Rows = dbSelect<{ id: number }>(
          "SELECT id FROM semesters WHERE academic_year_id = ? AND name LIKE '%Semester 1%'",
          [semRows[0].academic_year_id]
        );
        if (sem1Rows.length > 0) {
          const marks1 = dbSelect<{ student_id: string; subject_id: number; score: number }>(
            'SELECT student_id, subject_id, score FROM marks WHERE semester_id = ?',
            [sem1Rows[0].id]
          );
          marks1.forEach(mk => {
            if (!sem1Data[mk.student_id]) {
              sem1Data[mk.student_id] = {};
            }
            sem1Data[mk.student_id][mk.subject_id] = mk.score;
          });
        }
      }
      setIsSemester2(isSem2);
      setSem1Marks(sem1Data);

      // Fetch all marks for these students in the current semester
      const subIds = subjects.map(s => s.id).join(',');
      const markRows = dbSelect<{ student_id: string; subject_id: number; score: number }>(
        `SELECT student_id, subject_id, score FROM marks 
         WHERE semester_id = ? AND subject_id IN (${subIds})`,
        [activeSemesterId]
      );

      // Map marks into quick-access records
      const marksMap: Record<string, Record<number, string>> = {};
      markRows.forEach(row => {
        if (!marksMap[row.student_id]) {
          marksMap[row.student_id] = {};
        }
        marksMap[row.student_id][row.subject_id] = String(row.score);
      });

      // Construct initial rows and compute calculations
      const initialRows: StudentRow[] = studRows.map(student => {
        const scores: Record<number, string> = {};
        subjects.forEach(sub => {
          scores[sub.id] = (marksMap[student.id] && marksMap[student.id][sub.id]) || '';
        });

        return {
          id: student.id,
          name: student.name,
          scores,
          total: 0,
          average: 0,
          rank: 0
        };
      });

      const updatedRows = calculateTotalsAndRanks(initialRows, sem1Data, isSem2);
      setGridRows(updatedRows);
    } catch (err) {
      setError('Failed to load student marks grid.');
    }
  };

  // Run when section or subjects load/change
  useEffect(() => {
    loadGrid();
  }, [activeSemesterId, selectedSectionId, subjects]);

  // Recalculates Totals, Averages, and Ranks based on row inputs
  const calculateTotalsAndRanks = (rows: StudentRow[], currentSem1Marks = sem1Marks, isSem2 = isSemester2): StudentRow[] => {
    // 1. Calculate Totals & Averages for each row
    const calculated = rows.map(row => {
      let sum = 0;
      let count = 0;
      subjects.forEach(sub => {
        const scoreVal = parseFloat(row.scores[sub.id]);
        if (!isNaN(scoreVal)) {
          sum += scoreVal;
          count++;
        }
      });
      const avg = count > 0 ? sum / count : 0;

      // 2. Compute Annual Results (50% Sem 1 + 50% Sem 2)
      let annualTotal = 0;
      let annualAverage = 0;

      if (isSem2) {
        let annualSum = 0;
        let annualCount = 0;
        subjects.forEach(sub => {
          const sem2Score = parseFloat(row.scores[sub.id]);
          const sem1Score = currentSem1Marks[row.id]?.[sub.id];

          const s1 = (sem1Score !== undefined && !isNaN(sem1Score)) ? sem1Score : 0;
          const s2 = (!isNaN(sem2Score)) ? sem2Score : 0;
          
          const subjectAnnual = (s1 + s2) / 2;
          annualSum += subjectAnnual;
          annualCount++;
        });

        annualTotal = annualSum;
        annualAverage = annualCount > 0 ? annualSum / annualCount : 0;
      }

      return {
        ...row,
        total: sum,
        average: avg,
        annualTotal,
        annualAverage
      };
    });

    // 2. Assign competition rank based on Average descending
    const sorted = [...calculated].sort((a, b) => b.average - a.average);
    const rankMap: Record<string, number> = {};
    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].average < sorted[i - 1].average) {
        currentRank = i + 1;
      }
      rankMap[sorted[i].id] = currentRank;
    }

    // 3. Assign annual rank based on annualAverage descending
    const annualRankMap: Record<string, number> = {};
    if (isSem2) {
      const sortedAnnual = [...calculated].sort((a, b) => b.annualAverage - a.annualAverage);
      let currentAnnRank = 1;
      for (let i = 0; i < sortedAnnual.length; i++) {
        if (i > 0 && sortedAnnual[i].annualAverage < sortedAnnual[i - 1].annualAverage) {
          currentAnnRank = i + 1;
        }
        annualRankMap[sortedAnnual[i].id] = currentAnnRank;
      }
    }

    return calculated.map(row => ({
      ...row,
      rank: rankMap[row.id] || 0,
      annualRank: isSem2 ? (annualRankMap[row.id] || 0) : undefined
    }));
  };

  const handleScoreChange = (studentId: string, subjectId: number, value: string) => {
    setError('');
    setSuccess('');

    // Input validation
    let isErr = false;
    if (value.trim() !== '') {
      const num = Number(value);
      if (isNaN(num) || num < 0 || num > 100) {
        isErr = true;
      }
    }

    setCellErrors(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subjectId]: isErr
      }
    }));

    // Update row cell state
    setGridRows(prevRows => {
      const nextRows = prevRows.map(row => {
        if (row.id === studentId) {
          const nextScores = { ...row.scores, [subjectId]: value };
          return { ...row, scores: nextScores };
        }
        return row;
      });
      return calculateTotalsAndRanks(nextRows);
    });
  };

  // Keyboard navigation helper
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    studentIndex: number,
    subjectIndex: number
  ) => {
    let nextStudentIndex = studentIndex;
    let nextSubjectIndex = subjectIndex;

    switch (e.key) {
      case 'ArrowUp':
        nextStudentIndex = Math.max(0, studentIndex - 1);
        break;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        nextStudentIndex = Math.min(gridRows.length - 1, studentIndex + 1);
        break;
      case 'ArrowLeft':
        if (e.currentTarget.selectionStart === 0) {
          nextSubjectIndex = Math.max(0, subjectIndex - 1);
        } else {
          return; // Allow moving caret inside the input
        }
        break;
      case 'ArrowRight':
        if (e.currentTarget.selectionStart === e.currentTarget.value.length) {
          nextSubjectIndex = Math.min(subjects.length - 1, subjectIndex + 1);
        } else {
          return; // Allow moving caret inside the input
        }
        break;
      default:
        return;
    }

    const nextStudent = gridRows[nextStudentIndex];
    const nextSubject = subjects[nextSubjectIndex];

    if (nextStudent && nextSubject) {
      const refKey = `${nextStudent.id}-${nextSubject.id}`;
      const el = inputRefs.current[refKey];
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    // Check for validation errors
    let hasValidationError = false;
    Object.values(cellErrors).forEach(subjectMap => {
      Object.values(subjectMap).forEach(err => {
        if (err) hasValidationError = true;
      });
    });

    if (hasValidationError) {
      setError('Please correct any invalid scores (scores must be numbers between 0 and 100) before saving.');
      return;
    }

    setSaving(true);
    try {
      dbRun('BEGIN TRANSACTION');

      gridRows.forEach(row => {
        subjects.forEach(sub => {
          const val = row.scores[sub.id];
          if (val.trim() === '') {
            // Delete mark if empty
            dbRun(
              'DELETE FROM marks WHERE student_id = ? AND subject_id = ? AND semester_id = ?',
              [row.id, sub.id, activeSemesterId]
            );
          } else {
            // Insert or replace mark
            dbRun(
              `INSERT OR REPLACE INTO marks (student_id, subject_id, semester_id, score) 
               VALUES (?, ?, ?, ?)`,
              [row.id, sub.id, activeSemesterId, Number(val)]
            );
          }
        });
      });

      dbRun('COMMIT');
      await saveDatabase();
      
      const secName = sections.find(s => String(s.id) === selectedSectionId)?.name || '';
      await logAudit('MARK_ENTRY', 'MARKS', selectedSectionId, `Updated horizontal student scores for Section: ${secName}`);

      setSuccess('Student scores saved successfully and ranks recalculated!');
      loadGrid();
    } catch (err: any) {
      dbRun('ROLLBACK');
      setError(err.message || 'Failed to save student scores.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mark Entry Spreadsheet</h1>
          <p className="text-muted-foreground text-sm font-light mt-1">
            Input student scores out of 100% directly. Real-time class totals, averages, and ranks will calculate dynamically.
          </p>
        </div>
        {gridRows.length > 0 && (
          <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Marks'}
          </Button>
        )}
      </div>

      {/* Select configuration bar */}
      <Card className="bg-card/50">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Grade</label>
            <select
              value={selectedGradeId}
              onChange={e => setSelectedGradeId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              {grades.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Section</label>
            <select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {sections.length === 0 ? (
                <option value="">No Sections Configured</option>
              ) : (
                sections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </select>
          </div>
        </CardContent>
      </Card>

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

      {/* Spreadsheet Grid */}
      {subjects.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm">No active subjects configured for this grade. Please configure subjects first.</p>
        </Card>
      ) : students.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm">No active students registered in this section.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3.5 font-bold text-foreground w-[120px]">Student ID</th>
                  <th className="p-3.5 font-bold text-center text-foreground w-[80px] border-l border-border">Roll No</th>
                  <th className="p-3.5 font-bold text-foreground min-w-[200px] border-l border-border">Student Name</th>
                  {subjects.map(sub => (
                    <th key={sub.id} className="p-3.5 font-bold text-center text-foreground min-w-[120px] bg-primary/5 border-l border-border">
                      <p className="truncate text-xs font-semibold">{sub.name}</p>
                      <p className="text-[10px] text-muted-foreground font-light">Max: 100%</p>
                    </th>
                  ))}
                  <th className="p-3.5 font-bold text-center text-foreground w-[100px] border-l border-border">Total</th>
                  <th className="p-3.5 font-bold text-center text-foreground w-[100px] border-l border-border">Average</th>
                  <th className="p-3.5 font-bold text-center text-primary w-[80px] border-l border-border bg-primary/5">Rank</th>
                  {isSemester2 && (
                    <>
                      <th className="p-3.5 font-bold text-center text-indigo-600 w-[100px] border-l border-border bg-indigo-500/5">Annual Total</th>
                      <th className="p-3.5 font-bold text-center text-indigo-600 w-[100px] border-l border-border bg-indigo-500/5">Annual Avg</th>
                      <th className="p-3.5 font-bold text-center text-indigo-600 w-[80px] border-l border-border bg-indigo-500/10">Annual Rank</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gridRows.map((row, sIdx) => (
                  <tr key={row.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-3.5 font-mono text-xs text-muted-foreground">{row.id}</td>
                    <td className="p-3.5 text-center font-mono text-xs text-foreground font-bold border-l border-border bg-muted/10">{sIdx + 1}</td>
                    <td className="p-3.5 font-semibold text-foreground truncate border-l border-border">{row.name}</td>
                    {subjects.map((sub, subIdx) => {
                      const isErr = cellErrors[row.id]?.[sub.id];
                      return (
                        <td key={sub.id} className="p-2 border-l border-border bg-card/50">
                          <Input
                            ref={el => {
                              inputRefs.current[`${row.id}-${sub.id}`] = el;
                            }}
                            type="text"
                            value={row.scores[sub.id]}
                            onChange={e => handleScoreChange(row.id, sub.id, e.target.value)}
                            onKeyDown={e => handleKeyDown(e, sIdx, subIdx)}
                            className={`h-9 text-center bg-transparent border-0 font-medium focus-visible:ring-1 focus-visible:ring-primary ${
                              isErr ? 'text-destructive focus-visible:ring-destructive bg-destructive/10' : ''
                            }`}
                            placeholder="-"
                          />
                        </td>
                      );
                    })}
                    <td className="p-3.5 text-center font-mono text-xs text-foreground font-bold border-l border-border bg-muted/10">
                      {row.total.toFixed(1)}
                    </td>
                    <td className="p-3.5 text-center font-mono text-xs text-foreground font-bold border-l border-border bg-muted/10">
                      {row.average.toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-center font-bold border-l border-border bg-primary/5 text-primary text-xs">
                      {row.rank}
                    </td>
                    {isSemester2 && (
                      <>
                        <td className="p-3.5 text-center font-mono text-xs text-indigo-600 font-bold border-l border-border bg-indigo-500/5">
                          {row.annualTotal?.toFixed(1)}
                        </td>
                        <td className="p-3.5 text-center font-mono text-xs text-indigo-600 font-bold border-l border-border bg-indigo-500/5">
                          {row.annualAverage?.toFixed(1)}%
                        </td>
                        <td className="p-3.5 text-center font-bold border-l border-border bg-indigo-500/10 text-indigo-600 text-xs">
                          {row.annualRank}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
