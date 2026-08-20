import React, { useState, useEffect } from 'react';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { AlertCircle, CheckCircle2, Plus, Trash2, ArrowRight } from 'lucide-react';

interface Grade {
  id: number;
  name: string;
}

interface Section {
  id: number;
  grade_id: number;
  name: string;
}

export const GradesSections: React.FC = () => {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadGrades = () => {
    try {
      const rows = dbSelect<Grade>('SELECT * FROM grades ORDER BY id ASC');
      setGrades(rows);
      if (rows.length > 0 && selectedGradeId === null) {
        setSelectedGradeId(rows[0].id);
      }
    } catch (err) {
      setError('Failed to load grades.');
    }
  };

  const loadSections = () => {
    if (selectedGradeId === null) return;
    try {
      const rows = dbSelect<Section>(
        'SELECT * FROM sections WHERE grade_id = ? ORDER BY name ASC',
        [selectedGradeId]
      );
      setSections(rows);
    } catch (err) {
      setError('Failed to load sections.');
    }
  };

  useEffect(() => {
    loadGrades();
  }, []);

  useEffect(() => {
    loadSections();
  }, [selectedGradeId]);

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (selectedGradeId === null) {
      setError('No grade selected.');
      return;
    }
    if (!newSectionName.trim()) {
      setError('Section name cannot be empty.');
      return;
    }

    const trimmedName = newSectionName.trim();

    try {
      // Check duplicate
      const exist = dbSelect(
        'SELECT id FROM sections WHERE grade_id = ? AND name = ?',
        [selectedGradeId, trimmedName]
      );
      if (exist.length > 0) {
        setError(`Section ${trimmedName} already exists for this grade.`);
        return;
      }

      dbRun(
        'INSERT INTO sections (grade_id, name) VALUES (?, ?)',
        [selectedGradeId, trimmedName]
      );
      await saveDatabase();
      
      const gradeName = grades.find(g => g.id === selectedGradeId)?.name || '';
      await logAudit(
        'CREATE', 
        'SECTION', 
        trimmedName, 
        `Created section ${trimmedName} under grade ${gradeName}`
      );

      setSuccess(`Section ${trimmedName} created successfully!`);
      setNewSectionName('');
      loadSections();
    } catch (err: any) {
      setError(err.message || 'Failed to create section.');
    }
  };

  const handleDeleteSection = async (section: Section) => {
    setError('');
    setSuccess('');
    
    // Safety check: verify if students exist in this section
    try {
      const studentCount = dbSelect<{ count: number }>(
        'SELECT COUNT(*) as count FROM students WHERE section_id = ?',
        [section.id]
      );

      if (studentCount[0].count > 0) {
        setError('Unable to delete this section because students are still assigned to it.');
        return;
      }


      dbRun('DELETE FROM sections WHERE id = ?', [section.id]);
      await saveDatabase();

      const gradeName = grades.find(g => g.id === selectedGradeId)?.name || '';
      await logAudit(
        'DELETE', 
        'SECTION', 
        section.name, 
        `Deleted section ${section.name} from grade ${gradeName}`
      );

      setSuccess(`Section ${section.name} deleted successfully.`);
      loadSections();
    } catch (err: any) {
      setError('An error occurred while deleting the section.');
    }
  };

  const activeGradeName = grades.find(g => g.id === selectedGradeId)?.name || '';

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in-50">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Grades & Sections</h1>
        <p className="text-muted-foreground text-sm font-light mt-1">Configure sections and group students by grade levels.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Card: Grade Selection list */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Grade Levels</CardTitle>
            <CardDescription>Select a grade level to configure sections.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {grades.map((grade) => {
                const isSelected = grade.id === selectedGradeId;
                return (
                  <button
                    key={grade.id}
                    onClick={() => {
                      setSelectedGradeId(grade.id);
                      setError('');
                      setSuccess('');
                    }}
                    className={`w-full px-6 py-4 flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isSelected 
                        ? 'bg-primary/5 font-semibold text-primary' 
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span>{grade.name}</span>
                    {isSelected && <ArrowRight className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Cards: Section configuration */}
        <div className="md:col-span-2 space-y-6">
          {/* List Sections */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sections for {activeGradeName}</CardTitle>
                <CardDescription>All classrooms under {activeGradeName}.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {sections.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm font-light">
                  No sections defined for {activeGradeName} yet. Add a section below.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section Name</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sections.map((section) => (
                      <TableRow key={section.id}>
                        <TableCell className="font-medium text-foreground">
                          {section.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSection(section)}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            title="Delete Section"
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

          {/* Add Section */}
          <Card>
            <CardHeader>
              <CardTitle>Add Section</CardTitle>
              <CardDescription>Add a new classroom section to {activeGradeName}.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSection} className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium">Section Name</label>
                  <Input
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g. Section A"
                  />
                </div>
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" /> Add Section
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
