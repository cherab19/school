import React, { useState, useEffect } from 'react';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Dialog } from '../components/ui/dialog';
import { AlertCircle, CheckCircle2, Search, Plus, Edit2, UserX, UserCheck, FilterX, UploadCloud, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Student {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  grade_id: number;
  section_id: number;
  status: 'ACTIVE' | 'INACTIVE';
  grade_name: string;
  section_name: string;
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

interface ParsedStudent {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  gradeName: string;
  sectionName: string;
}

export const Students: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [filterSection, setFilterSection] = useState<string>('');

  // Dialog & Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Import Dialog States
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStudentsList, setImportStudentsList] = useState<ParsedStudent[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = () => {
    try {
      const gradesRows = dbSelect<Grade>('SELECT * FROM grades ORDER BY id ASC');
      setGrades(gradesRows);

      const sectionRows = dbSelect<Section>('SELECT * FROM sections ORDER BY name ASC');
      setAllSections(sectionRows);

      // Fetch students with Grade and Section names
      const studentRows = dbSelect<Student>(`
        SELECT s.*, g.name as grade_name, sec.name as section_name
        FROM students s
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON s.section_id = sec.id
        ORDER BY s.name ASC
      `);
      setStudents(studentRows);
    } catch (err) {
      setError('Failed to load students data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter sections based on selected grade in form
  const formSections = allSections.filter(s => s.grade_id === Number(selectedGrade));

  // Filter sections based on selected filter grade
  const filterSections = allSections.filter(s => s.grade_id === Number(filterGrade));

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setStudentId('');
    setFullName('');
    setGender('Male');
    setSelectedGrade(grades.length > 0 ? String(grades[0].id) : '');
    setSelectedSection('');
    setStatus('ACTIVE');
    setError('');
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (student: Student) => {
    setDialogMode('edit');
    setStudentId(student.id);
    setFullName(student.name);
    setGender(student.gender);
    setSelectedGrade(String(student.grade_id));
    setSelectedSection(String(student.section_id));
    setStatus(student.status);
    setError('');
    setIsDialogOpen(true);
  };

  // Set default section when grade changes in form
  useEffect(() => {
    if (formSections.length > 0) {
      const exists = formSections.some(s => String(s.id) === selectedSection);
      if (!exists) {
        setSelectedSection(String(formSections[0].id));
      }
    } else {
      setSelectedSection('');
    }
  }, [selectedGrade]);

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!studentId.trim()) {
      setError('Student ID is required');
      return;
    }
    if (!fullName.trim()) {
      setError('Student Full Name is required');
      return;
    }
    if (!selectedGrade) {
      setError('Grade is required');
      return;
    }
    if (!selectedSection) {
      setError('Section is required. Set up a section for this grade level first.');
      return;
    }

    try {
      if (dialogMode === 'add') {
        const exists = dbSelect('SELECT id FROM students WHERE id = ?', [studentId.trim()]);
        if (exists.length > 0) {
          setError(`Student ID ${studentId} is already assigned to another student.`);
          return;
        }

        dbRun(
          `INSERT INTO students (id, name, gender, grade_id, section_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
          [studentId.trim(), fullName.trim(), gender, Number(selectedGrade), Number(selectedSection), 'ACTIVE']
        );
        await saveDatabase();
        await logAudit('ADD_STUDENT', 'STUDENT', studentId.trim(), `Added student "${fullName.trim()}"`);
        setSuccess(`Student "${fullName.trim()}" added successfully.`);
      } else {
        dbRun(
          `UPDATE students SET name = ?, gender = ?, grade_id = ?, section_id = ?, status = ? WHERE id = ?`,
          [fullName.trim(), gender, Number(selectedGrade), Number(selectedSection), status, studentId]
        );
        await saveDatabase();
        await logAudit('EDIT_STUDENT', 'STUDENT', studentId, `Updated student profile of "${fullName.trim()}"`);
        setSuccess(`Student "${fullName.trim()}" updated successfully.`);
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    }
  };

  const handleToggleStatus = async (student: Student) => {
    setError('');
    setSuccess('');
    const newStatus = student.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      dbRun('UPDATE students SET status = ? WHERE id = ?', [newStatus, student.id]);
      await saveDatabase();
      await logAudit('TOGGLE_STATUS', 'STUDENT', student.id, `Set status to ${newStatus} for "${student.name}"`);
      setSuccess(`Student "${student.name}" status updated to ${newStatus.toLowerCase()}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update student status');
    }
  };

  // Excel/CSV File Import parsing handler (5-column parser)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          setImportError('Empty sheet or missing student data rows.');
          return;
        }

        // Header mapping logic
        const header = rows[0].map((h: any) => String(h).toLowerCase().trim());
        let idCol = header.findIndex((h: string) => h.includes('id'));
        let nameCol = header.findIndex((h: string) => h.includes('name'));
        let genderCol = header.findIndex((h: string) => h.includes('gender') || h.includes('sex'));
        let gradeCol = header.findIndex((h: string) => h.includes('grade'));
        let sectionCol = header.findIndex((h: string) => h.includes('section'));

        if (idCol === -1) idCol = 0;
        if (nameCol === -1) nameCol = 1;
        if (genderCol === -1) genderCol = 2;
        if (gradeCol === -1) gradeCol = 3;
        if (sectionCol === -1) sectionCol = 4;

        const parsed: ParsedStudent[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const sid = String(row[idCol] || '').trim();
          const sname = String(row[nameCol] || '').trim();
          let sgender = String(row[genderCol] || '').trim().toLowerCase();
          const sgrade = String(row[gradeCol] || '').trim();
          const ssection = String(row[sectionCol] || '').trim();

          // Normalize gender values
          let finalGender: 'Male' | 'Female' = 'Male';
          if (sgender.startsWith('f')) {
            finalGender = 'Female';
          }

          if (sid && sname && sgrade && ssection) {
            parsed.push({
              id: sid,
              name: sname,
              gender: finalGender,
              gradeName: sgrade,
              sectionName: ssection
            });
          }
        }

        if (parsed.length === 0) {
          setImportError('Could not parse any valid student records. Make sure ID, Name, Gender, Grade, and Section are filled.');
        } else {
          setImportStudentsList(parsed);
        }
      } catch (err) {
        setImportError('Failed to parse spreadsheet file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleApplyImport = async () => {
    setImportError('');
    setError('');
    setSuccess('');

    if (importStudentsList.length === 0) {
      setImportError('No students parsed to import.');
      return;
    }

    try {
      dbRun('BEGIN TRANSACTION');

      // Cache lookup to reduce SQLite queries
      const gradeCache: Record<string, number> = {};
      const sectionCache: Record<string, number> = {};

      for (const student of importStudentsList) {
        const cleanGrade = student.gradeName.trim();
        const cleanSection = student.sectionName.trim();

        // 1. Resolve Grade ID
        let gradeId = gradeCache[cleanGrade.toLowerCase()];
        if (!gradeId) {
          const matchedGrades = dbSelect<{ id: number }>('SELECT id FROM grades WHERE LOWER(name) = LOWER(?)', [cleanGrade]);
          if (matchedGrades.length > 0) {
            gradeId = matchedGrades[0].id;
          } else {
            dbRun('INSERT INTO grades (name) VALUES (?)', [cleanGrade]);
            const newGrade = dbSelect<{ id: number }>('SELECT last_insert_rowid() as id');
            gradeId = newGrade[0].id;
          }
          gradeCache[cleanGrade.toLowerCase()] = gradeId;
        }

        // 2. Resolve Section ID
        const sectKey = `${gradeId}-${cleanSection.toLowerCase()}`;
        let sectionId = sectionCache[sectKey];
        if (!sectionId) {
          const matchedSections = dbSelect<{ id: number }>(
            'SELECT id FROM sections WHERE grade_id = ? AND LOWER(name) = LOWER(?)',
            [gradeId, cleanSection]
          );
          if (matchedSections.length > 0) {
            sectionId = matchedSections[0].id;
          } else {
            dbRun('INSERT INTO sections (grade_id, name) VALUES (?, ?)', [gradeId, cleanSection]);
            const newSection = dbSelect<{ id: number }>('SELECT last_insert_rowid() as id');
            sectionId = newSection[0].id;
          }
          sectionCache[sectKey] = sectionId;
        }

        // 3. Insert Student Profile
        dbRun(
          `INSERT OR REPLACE INTO students (id, name, gender, grade_id, section_id, status) 
           VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
          [student.id, student.name, student.gender, gradeId, sectionId]
        );
      }

      dbRun('COMMIT');
      await saveDatabase();
      await logAudit('IMPORT_STUDENTS', 'STUDENT', null, `Imported ${importStudentsList.length} students with auto grade/section resolving`);

      setSuccess(`Imported ${importStudentsList.length} student profiles successfully!`);
      setIsImportOpen(false);
      
      // Reset Import Dialog Form States
      setImportStudentsList([]);
      setImportFileName('');
      loadData();
    } catch (err: any) {
      dbRun('ROLLBACK');
      setImportError(err.message || 'Bulk student import transaction failed.');
    }
  };

  // Filter students based on filter parameters
  const filteredStudents = students.filter(student => {
    const matchesSearch = student.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          student.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGrade = filterGrade === '' || student.grade_id === Number(filterGrade);
    const matchesSection = filterSection === '' || student.section_id === Number(filterSection);
    
    return matchesSearch && matchesGrade && matchesSection;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setFilterGrade('');
    setFilterSection('');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Students</h1>
          <p className="text-muted-foreground text-sm font-light mt-1">Manage student profiles, section assignments, and statuses.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => {
            setImportError('');
            setIsImportOpen(true);
          }} variant="outline" className="gap-2 cursor-pointer">
            <UploadCloud className="h-4 w-4" /> Import Students
          </Button>
          <Button onClick={handleOpenAddDialog} className="gap-2 shrink-0 cursor-pointer">
            <Plus className="h-4 w-4" /> Add Student
          </Button>
        </div>
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

      {/* Search and Filters Toolbar */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search</label>
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search ID or Name..."
                className="pl-9"
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grade Filter</label>
            <Select
              value={filterGrade}
              onChange={e => {
                setFilterGrade(e.target.value);
                setFilterSection('');
              }}
              placeholder="All Grades"
              options={grades.map(g => ({ value: g.id, label: g.name }))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Section Filter</label>
            <Select
              value={filterSection}
              onChange={e => setFilterSection(e.target.value)}
              placeholder="All Sections"
              disabled={!filterGrade}
              options={filterSections.map(s => ({ value: s.id, label: s.name }))}
            />
          </div>

          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="gap-2 w-full cursor-pointer"
            disabled={!searchQuery && !filterGrade && !filterSection}
          >
            <FilterX className="h-4 w-4" /> Clear Filters
          </Button>
        </CardContent>
      </Card>

      {/* Roster Table */}
      <Card>
        <CardContent className="p-0">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm font-light">
              No students found matching the filters or query.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map(student => (
                  <TableRow key={student.id} className={student.status === 'INACTIVE' ? 'opacity-65' : ''}>
                    <TableCell className="font-semibold text-foreground">{student.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                    <TableCell>{student.gender}</TableCell>
                    <TableCell>{student.grade_name}</TableCell>
                    <TableCell>{student.section_name}</TableCell>
                    <TableCell>
                      {student.status === 'ACTIVE' ? (
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
                        onClick={() => handleOpenEditDialog(student)}
                        title="Edit Student"
                        className="cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleStatus(student)}
                        title={student.status === 'ACTIVE' ? 'Deactivate Student' : 'Activate Student'}
                        className={`cursor-pointer ${student.status === 'ACTIVE' ? 'text-yellow-600 hover:bg-yellow-550/10' : 'text-emerald-600 hover:bg-emerald-550/10'}`}
                      >
                        {student.status === 'ACTIVE' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={dialogMode === 'add' ? 'Add New Student' : 'Edit Student Profile'}
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Student ID / Registration ID</label>
            <Input
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="e.g. ST-0123"
              disabled={dialogMode === 'edit'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full Name</label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Abebe Kebede"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Gender</label>
            <select
              value={gender}
              onChange={e => setGender(e.target.value as 'Male' | 'Female')}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Grade Level</label>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {grades.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Section Assignment</label>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {formSections.length === 0 ? (
                  <option value="">No Sections Configured</option>
                ) : (
                  formSections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {dialogMode === 'edit' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Student
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Import Students Wizard Dialog */}
      <Dialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Students from Spreadsheet"
      >
        <div className="space-y-4">
          {importError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-xs text-destructive font-medium border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <div className="space-y-1.5 p-3 rounded-lg bg-muted text-xs leading-relaxed text-muted-foreground border border-border">
            <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Supported Format Template:
            </p>
            <p>Upload a <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> file containing columns:</p>
            <ul className="list-disc list-inside pl-1 mt-1 font-semibold text-foreground space-y-0.5">
              <li>Student ID (Column 1)</li>
              <li>Full Name (Column 2)</li>
              <li>Gender (Column 3 - "Male" or "Female")</li>
              <li>Grade (Column 4 - e.g. "Grade 1")</li>
              <li>Section (Column 5 - e.g. "A")</li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Select File</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card text-xs font-semibold text-muted-foreground hover:bg-muted/10 cursor-pointer transition-all">
                <UploadCloud className="h-4 w-4" /> Browse Files
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-muted-foreground truncate">{importFileName || 'No file selected'}</span>
            </div>
          </div>

          {importStudentsList.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Parsed Preview ({importStudentsList.length} Students)</label>
              <div className="max-h-[180px] overflow-y-auto border border-border rounded-lg bg-card divide-y divide-border">
                {importStudentsList.map((st, idx) => (
                  <div key={idx} className="flex justify-between items-center px-3 py-2 text-xs">
                    <div className="flex gap-2 items-center">
                      <span className="font-mono text-muted-foreground">{st.id}</span>
                      <span className="font-medium text-foreground">{st.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {st.gender} • {st.gradeName} - {st.sectionName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplyImport}
              disabled={importStudentsList.length === 0}
            >
              Import Students
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
