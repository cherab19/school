import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect } from '../services/db';
import * as XLSX from 'xlsx';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';

interface Grade {
  id: number;
  name: string;
}

interface Section {
  id: number;
  grade_id: number;
  name: string;
}

export const Reports: React.FC = () => {
  const { activeYearId, activeSemesterId, settings } = useApp();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generating, setGenerating] = useState(false);

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

  // Filter sections based on selected grade
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
    } catch (err) {
      setError('Failed to load sections.');
    }
  }, [selectedGradeId]);

  // helper: fetch academic year name
  const getYearName = () => {
    if (!activeYearId) return '';
    const nameRow = dbSelect<{ name: string }>('SELECT name FROM academic_years WHERE id = ?', [activeYearId]);
    return nameRow.length > 0 ? nameRow[0].name : '';
  };

  // helper: fetch semester name
  const getSemesterName = () => {
    if (!activeSemesterId) return '';
    const nameRow = dbSelect<{ name: string }>('SELECT name FROM semesters WHERE id = ?', [activeSemesterId]);
    return nameRow.length > 0 ? nameRow[0].name : '';
  };

  // 2. Excel Export: Class Report Sheet
  const handleExportClassExcel = async () => {
    setError('');
    setSuccess('');
    if (!activeSemesterId || !selectedSectionId) {
      setError('Select an active year/semester and a section.');
      return;
    }

    setGenerating(true);
    try {
      const semName = getSemesterName();
      const sectionName = sections.find(s => s.id === Number(selectedSectionId))?.name || '';
      const gradeName = grades.find(g => g.id === Number(selectedGradeId))?.name || '';

      // Get subjects for this grade
      const subjectsRows = dbSelect<{ id: number; name: string }>(
        'SELECT id, name FROM subjects WHERE grade_id = ? AND status = "ACTIVE" ORDER BY name ASC',
        [Number(selectedGradeId)]
      );

      // Get students in this section
      const studentsRows = dbSelect<{ id: string; name: string }>(
        'SELECT id, name FROM students WHERE section_id = ? AND status = "ACTIVE" ORDER BY name ASC',
        [Number(selectedSectionId)]
      );

      if (studentsRows.length === 0 || subjectsRows.length === 0) {
        setError('No active students or subjects configured for this classroom.');
        setGenerating(false);
        return;
      }

      // Fetch all results for this semester-section
      const resultsRows = dbSelect<{ student_id: string; subject_id: number; total_score: number }>(
        `SELECT student_id, subject_id, score as total_score 
         FROM marks 
         WHERE semester_id = ? AND student_id IN (
           SELECT id FROM students WHERE section_id = ?
         )`,
        [activeSemesterId, Number(selectedSectionId)]
      );

      // Map results: resultsMap[studentId][subjectId] = score
      const resultsMap: Record<string, Record<number, number>> = {};
      studentsRows.forEach(st => {
        resultsMap[st.id] = {};
      });
      resultsRows.forEach(r => {
        if (resultsMap[r.student_id]) {
          resultsMap[r.student_id][r.subject_id] = r.total_score;
        }
      });

      // Prepare Excel rows structure
      const excelData = studentsRows.map(st => {
        const row: Record<string, any> = {
          'Student ID': st.id,
          'Student Name': st.name
        };

        let total = 0;
        let count = 0;

        subjectsRows.forEach(sub => {
          const score = resultsMap[st.id][sub.id];
          row[sub.name] = score !== undefined ? Number(score.toFixed(settings.precision)) : '-';
          if (score !== undefined) {
            total += score;
            count++;
          }
        });

        const average = count > 0 ? total / count : 0;
        row['Total Score'] = Number(total.toFixed(settings.precision));
        row['Average Score'] = Number(average.toFixed(settings.precision));

        return row;
      });

      // Create sheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      XLSX.utils.book_append_sheet(wb, ws, "Class Roster Results");

      // Write array
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

      const savedPath = await window.electron.saveFileDialog({
        defaultName: `ClassReport_${gradeName.replace(/\s+/g, '')}_${sectionName.replace(/\s+/g, '')}_${semName.replace(/\s+/g, '')}.xlsx`,
        filters: [{ name: 'Excel Sheets', extensions: ['xlsx'] }],
        arrayBuffer: excelBuffer
      });

      if (savedPath) {
        setSuccess(`Class roster Excel sheet exported successfully at: ${savedPath}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to export Excel.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports & Export</h1>
        <p className="text-muted-foreground text-sm font-light mt-1">Export local database marks to professional spreadsheet XLSX files.</p>
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

      <div className="max-w-md mx-auto">
        {/* Class spreadsheet export */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <CardTitle>Class Roster Excel Export</CardTitle>
            </div>
            <CardDescription>Export the entire classroom semester totals as an Excel spreadsheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Grade Level</label>
              <Select
                value={selectedGradeId}
                onChange={e => setSelectedGradeId(e.target.value)}
                options={grades.map(g => ({ value: g.id, label: g.name }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Class Section</label>
              <Select
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(e.target.value)}
                placeholder={sections.length === 0 ? "No Sections Configured" : "Select Section"}
                options={sections.map(s => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div className="pt-8">
              <Button
                onClick={handleExportClassExcel}
                disabled={generating || !selectedSectionId}
                className="w-full gap-2"
                variant="secondary"
              >
                <Download className="h-4 w-4" /> {generating ? 'Generating Excel...' : 'Export Class Results Excel (.xlsx)'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
