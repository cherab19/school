import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect } from '../services/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { AlertCircle, CheckCircle2, FileText, Download } from 'lucide-react';

interface Grade {
  id: number;
  name: string;
}

interface Section {
  id: number;
  grade_id: number;
  name: string;
}



interface Student {
  id: string;
  name: string;
}

interface SubjectScore {
  subject_name: string;
  score: number;
  max_mark: number;
  weight: number;
  status: string;
}

export const Reports: React.FC = () => {
  const { activeYearId, activeSemesterId, settings } = useApp();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

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

  // Load students based on section
  useEffect(() => {
    if (!selectedSectionId) {
      setStudents([]);
      setSelectedStudentId('');
      return;
    }
    try {
      const rows = dbSelect<Student>(
        'SELECT id, name FROM students WHERE section_id = ? AND status = "ACTIVE" ORDER BY name ASC',
        [Number(selectedSectionId)]
      );
      setStudents(rows);
      if (rows.length > 0) {
        setSelectedStudentId(rows[0].id);
      } else {
        setSelectedStudentId('');
      }
    } catch (err) {
      setError('Failed to load students.');
    }
  }, [selectedSectionId]);

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

  // 1. PDF Report: Individual Student Report card
  const handleExportStudentPDF = async () => {
    setError('');
    setSuccess('');
    if (!activeSemesterId || !selectedStudentId) {
      setError('Select an active year/semester and a student.');
      return;
    }

    setGenerating(true);
    try {
      const studentName = students.find(s => s.id === selectedStudentId)?.name || '';
      const gradeName = grades.find(g => g.id === Number(selectedGradeId))?.name || '';
      const sectionName = sections.find(s => s.id === Number(selectedSectionId))?.name || '';
      const yearName = getYearName();
      const semName = getSemesterName();

      // Fetch student results
      const scores = dbSelect<SubjectScore>(`
        SELECT sub.name as subject_name, m.score as score
        FROM marks m
        JOIN subjects sub ON m.subject_id = sub.id
        WHERE m.student_id = ? AND m.semester_id = ?
        ORDER BY sub.name ASC
      `, [selectedStudentId, activeSemesterId]);

      if (scores.length === 0) {
        setError('No scores entered for this student in the current semester.');
        setGenerating(false);
        return;
      }

      // Calculate Total & Average
      const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
      const averageScore = totalScore / scores.length;

      // Ranking Policy: Rank students based on numerical average for this section
      let rankString = 'N/A';
      if (settings.ranking_enabled) {
        const classAverages = dbSelect<{ student_id: string; avg: number }>(`
          SELECT student_id, AVG(score) as avg
          FROM marks
          WHERE semester_id = ? AND student_id IN (
            SELECT id FROM students WHERE section_id = ?
          )
          GROUP BY student_id
          ORDER BY avg DESC
        `, [activeSemesterId, Number(selectedSectionId)]);

        const myRank = classAverages.findIndex(c => c.student_id === selectedStudentId) + 1;
        if (myRank > 0) {
          rankString = `${myRank} / ${classAverages.length}`;
        }
      }

      // Create PDF
      const doc = new jsPDF();
      
      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(41, 128, 185);
      doc.text(settings.school_name, 105, 20, { align: "center" });

      doc.setFontSize(14);
      doc.setTextColor(100);
      doc.text(`Official Academic Report Card`, 105, 30, { align: "center" });
      doc.text(`${yearName} — ${semName}`, 105, 38, { align: "center" });

      // Student Info Box
      doc.setDrawColor(200);
      doc.setFillColor(248, 249, 250);
      doc.rect(15, 48, 180, 32, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.text(`Student Name:  ${studentName}`, 20, 56);
      doc.text(`Student ID:      ${selectedStudentId}`, 20, 64);
      doc.text(`Grade Level:     ${gradeName}`, 20, 72);

      doc.text(`Class Section:  ${sectionName}`, 120, 56);
      doc.text(`Ranking:          ${rankString}`, 120, 64);

      // Report Table
      const tableBody = scores.map(s => [s.subject_name, s.score.toFixed(settings.precision)]);

      autoTable(doc, {
        startY: 88,
        head: [['Subject Name', 'Score (100%)']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], halign: 'left' },
        columnStyles: {
          0: { cellWidth: 120, halign: 'left' },
          1: { cellWidth: 60, halign: 'right' }
        }
      });

      // Totals
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Total Score:     ${totalScore.toFixed(settings.precision)}`, 140, finalY);
      doc.text(`Average Score:   ${averageScore.toFixed(settings.precision)}`, 140, finalY + 8);

      // Signature Area
      (doc as any).setLineDash([2, 2], 0);
      doc.line(20, finalY + 45, 80, finalY + 45);
      doc.line(130, finalY + 45, 190, finalY + 45);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Homeroom Teacher Signature", 22, finalY + 50);
      doc.text("Director Signature", 148, finalY + 50);

      // Convert to buffer & save
      const pdfBuffer = doc.output('arraybuffer');
      const cleanName = studentName.replace(/\s+/g, '_');
      const savedPath = await window.electron.saveFileDialog({
        defaultName: `Report_${cleanName}_${semName.replace(/\s+/g, '_')}.pdf`,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        arrayBuffer: pdfBuffer
      });

      if (savedPath) {
        setSuccess(`PDF Report Card saved successfully at: ${savedPath}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to export PDF.');
    } finally {
      setGenerating(false);
    }
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
        <p className="text-muted-foreground text-sm font-light mt-1">Export local database marks to professional print-ready PDFs or spreadsheet XLSX files.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Card: Individual Student Report */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Individual Student PDF Report</CardTitle>
            </div>
            <CardDescription>Generate a printable semester report card for a single student.</CardDescription>
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Select Student</label>
              <Select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                placeholder={students.length === 0 ? "No Students Configured" : "Select Student"}
                options={students.map(st => ({ value: st.id, label: st.name }))}
              />
            </div>
            <Button
              onClick={handleExportStudentPDF}
              disabled={generating || !selectedStudentId}
              className="w-full gap-2 mt-2"
            >
              <FileText className="h-4 w-4" /> {generating ? 'Generating PDF...' : 'Export Student Report PDF'}
            </Button>
          </CardContent>
        </Card>

        {/* Right Card: Class spreadsheet export */}
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
