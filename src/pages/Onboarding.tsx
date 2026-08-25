import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dbRun, saveDatabase, logAudit } from '../services/db';
import { hashPassword, generateSalt } from '../utils/crypto';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';

export const Onboarding: React.FC = () => {
  const { refreshState, updateSettings } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [schoolName, setSchoolName] = useState('Sabiyan No.1 Primary and Middle School');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Password is required');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!schoolName.trim()) {
      setError('School Name is required');
      return;
    }
    if (!recoveryAnswer.trim()) {
      setError('Recovery Answer is required');
      return;
    }
    if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
      setError('Academic Year must follow YYYY/YYYY format (e.g. 2026/2027)');
      return;
    }

    setLoading(false);
    try {
      setLoading(true);
      const salt = generateSalt();
      const pwdHash = await hashPassword(password, salt);

      const recoverySalt = generateSalt();
      const recoveryHash = await hashPassword(recoveryAnswer.trim().toLowerCase(), recoverySalt);

      // 1. Create admin user
      dbRun(
        `INSERT INTO users (username, password_hash, salt, recovery_question, recovery_answer_hash, recovery_salt) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          username.trim().toLowerCase(), 
          pwdHash, 
          salt, 
          'What is your school name?', 
          recoveryHash, 
          recoverySalt
        ]
      );

      // 2. Set default settings
      await updateSettings({
        school_name: schoolName.trim(),
        precision: 1,
        ranking_enabled: false,
        annual_policy: '50/50'
      });

      // 3. Create initial academic year
      dbRun(
        'INSERT INTO academic_years (name, status) VALUES (?, ?)',
        [academicYear, 'ACTIVE']
      );

      // 4. Create semesters for the academic year
      dbRun(`
        INSERT INTO semesters (academic_year_id, name, status) 
        VALUES 
          ((SELECT id FROM academic_years WHERE name = ?), 'Semester 1', 'ACTIVE'),
          ((SELECT id FROM academic_years WHERE name = ?), 'Semester 2', 'DRAFT')
      `, [academicYear, academicYear]);

      await saveDatabase();
      await logAudit('INITIALIZE', 'SYSTEM', null, 'System initialized with admin user and first academic year');

      refreshState();
    } catch (err: any) {
      setError(err.message || 'Initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">Sabiyan No.1 Primary and Middle School Result System</CardTitle>
          <CardDescription>First-time Setup & Onboarding</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive font-medium border border-destructive/20">
                {error}
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">School Information</label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium">School Name</label>
                  <Input 
                    value={schoolName}
                    onChange={e => {
                      setSchoolName(e.target.value);
                      if (!recoveryAnswer) {
                        // Helpful default to initialize answer
                      }
                    }}
                    placeholder="Sabyan School"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Academic Configuration</label>
              <div>
                <label className="text-sm font-medium">Initial Academic Year</label>
                <Input 
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  placeholder="2026/2027"
                />
                <p className="text-xs text-muted-foreground mt-1">Format: YYYY/YYYY (e.g. 2026/2027). This creates Semester 1 (Active) and Semester 2 (Draft).</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Credentials</label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium">Username</label>
                  <Input 
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="admin"
                    disabled
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Admin Password</label>
                  <Input 
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Confirm Password</label>
                  <Input 
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password Recovery Question</label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium">Recovery Question 1</label>
                  <Input 
                    value="What is your school name?"
                    disabled
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Answer</label>
                  <Input 
                    value={recoveryAnswer}
                    onChange={e => setRecoveryAnswer(e.target.value)}
                    placeholder="Answer to recovery question"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full mt-4" disabled={loading}>
              {loading ? 'Initializing...' : 'Complete Setup & Open Dashboard'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
