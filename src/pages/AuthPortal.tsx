import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { hashPassword, generateSalt } from '../utils/crypto';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

import { KeyRound, HelpCircle, ArrowLeft, School, ArrowRight, UserCheck, CheckCircle2 } from 'lucide-react';

export const AuthPortal: React.FC = () => {
  const { login, refreshState, updateSettings, isFirstRun: contextFirstRun } = useApp();
  
  // Tab control
  type Tab = 'login' | 'setup';
  const [activeTab, setActiveTab] = useState<Tab>('login');

  // Login States
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Login Recovery Wizard States
  type RecoveryMode = 'none' | 'enter-username' | 'security-question' | 'reset-password';
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('none');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [recoveryAnswerHash, setRecoveryAnswerHash] = useState('');
  const [recoveryAnswerInput, setRecoveryAnswerInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Setup Wizard States
  const [setupStep, setSetupStep] = useState(1);
  const [setupSchoolName, setSetupSchoolName] = useState('Sabiyan No.1 Primary and Secondary School');
  const [setupAcademicYear, setSetupAcademicYear] = useState('2019 E.C.');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupRecoveryAnswer, setSetupRecoveryAnswer] = useState('');

  // General Notification States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if users table has admin
  const checkSystemInitialization = () => {
    try {
      const users = dbSelect('SELECT * FROM users LIMIT 1');
      if (users.length > 0) {
        setActiveTab('login');
      } else {
        setActiveTab('setup');
      }
    } catch (e) {
      setActiveTab('setup');
    }
  };

  useEffect(() => {
    checkSystemInitialization();
  }, [contextFirstRun]);

  // Login Submit Handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!loginUsername.trim()) {
      setError('Username is required.');
      return;
    }
    if (!loginPassword) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      const users = dbSelect<{ salt: string }>('SELECT salt FROM users WHERE username = ?', [loginUsername.trim().toLowerCase()]);
      if (users.length === 0) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      const salt = users[0].salt;
      const pwdHash = await hashPassword(loginPassword, salt);

      const successLogin = await login(loginUsername, pwdHash);
      if (!successLogin) {
        setError('Invalid username or password.');
      }
    } catch (err: any) {
      setError(err.message || 'Login error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Password Recovery Logic
  const handleVerifyUsername = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!loginUsername.trim()) {
      setError('Username is required.');
      return;
    }
    try {
      const users = dbSelect<{ recovery_question: string; recovery_salt: string; recovery_answer_hash: string }>(
        'SELECT recovery_question, recovery_salt, recovery_answer_hash FROM users WHERE username = ?',
        [loginUsername.trim().toLowerCase()]
      );
      if (users.length === 0) {
        setError('Username not found.');
        return;
      }
      setRecoveryQuestion(users[0].recovery_question);
      setRecoverySalt(users[0].recovery_salt);
      setRecoveryAnswerHash(users[0].recovery_answer_hash);
      setRecoveryMode('security-question');
    } catch (err) {
      setError('Failed to query user.');
    }
  };

  const handleVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!recoveryAnswerInput.trim()) {
      setError('Please provide the recovery answer.');
      return;
    }
    setLoading(true);
    try {
      const inputHash = await hashPassword(recoveryAnswerInput.trim().toLowerCase(), recoverySalt);
      if (inputHash === recoveryAnswerHash) {
        setRecoveryMode('reset-password');
      } else {
        setError('Incorrect answer to security question.');
      }
    } catch (err) {
      setError('Failed to verify answer.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newPassword || !confirmNewPassword) {
      setError('Please fill in both password fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);
      dbRun('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?', [newHash, newSalt, loginUsername.trim().toLowerCase()]);
      await saveDatabase();
      await logAudit('RESET_PASSWORD', 'USERS', loginUsername, 'Password reset via security question');
      
      setSuccess('Password updated successfully. Please login with your new password.');
      setRecoveryMode('none');
      setLoginPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to save password.');
    } finally {
      setLoading(false);
    }
  };

  // Setup Wizard Submit Handler
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Step validations
    if (setupStep === 1) {
      if (!setupSchoolName.trim()) {
        setError('School Name is required.');
        return;
      }
      if (!/^\d{4}\s*E\.C\.?$/i.test(setupAcademicYear)) {
        setError('Academic Year must follow YYYY E.C. format (e.g. 2018 E.C.).');
        return;
      }
      setSetupStep(2);
      return;
    }

    if (setupStep === 2) {
      if (!setupPassword) {
        setError('Password is required.');
        return;
      }
      if (setupPassword !== setupConfirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setSetupStep(3);
      return;
    }

    if (setupStep === 3) {
      if (!setupRecoveryAnswer.trim()) {
        setError('Recovery Answer is required.');
        return;
      }

      setLoading(true);
      try {
        const salt = generateSalt();
        const pwdHash = await hashPassword(setupPassword, salt);

        const recSalt = generateSalt();
        const recHash = await hashPassword(setupRecoveryAnswer.trim().toLowerCase(), recSalt);

        // 1. Create user
        dbRun(
          `INSERT OR REPLACE INTO users (username, password_hash, salt, recovery_question, recovery_answer_hash, recovery_salt) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['admin', pwdHash, salt, 'What is your school name?', recHash, recSalt]
        );

        // 2. Set settings
        await updateSettings({
          school_name: 'Sabiyan No.1 Primary and Secondary School',
          precision: 1,
          ranking_enabled: true,
          annual_policy: '50/50'
        });

        // 3. Create initial academic year if not exists
        dbRun('INSERT OR IGNORE INTO academic_years (name, status) VALUES (?, ?)', [setupAcademicYear, 'ACTIVE']);

        // 4. Create semesters if not exists
        dbRun(`
          INSERT OR IGNORE INTO semesters (academic_year_id, name, status) 
          VALUES 
            ((SELECT id FROM academic_years WHERE name = ?), 'Semester 1', 'ACTIVE'),
            ((SELECT id FROM academic_years WHERE name = ?), 'Semester 2', 'DRAFT')
        `, [setupAcademicYear, setupAcademicYear]);

        await saveDatabase();
        await logAudit('INITIALIZE', 'SYSTEM', null, 'System initialized with admin user');
        
        setSuccess('System setup successfully completed!');
        checkSystemInitialization();
        refreshState();
      } catch (err: any) {
        setError(err.message || 'Setup initialization failed.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4 md:p-8 animate-in fade-in-50">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 rounded-2xl shadow-2xl bg-card overflow-hidden border border-border">
        
        {/* Left Side: Premium Branding Banner */}
        <div className="md:col-span-5 bg-gradient-to-tr from-primary to-indigo-600 p-8 flex flex-col justify-between text-primary-foreground min-h-[300px] md:min-h-[550px]">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-white p-0.5 shadow-sm">
              <img src="logo.png" className="h-full w-full object-contain" alt="Logo" />
            </div>
            <span className="font-extrabold text-[11px] tracking-wide uppercase text-white/90">Sabiyan No.1 Primary and Secondary School</span>
          </div>

          <div className="space-y-4 my-auto">
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
              Academic Result Management System
            </h1>
            <p className="text-sm text-primary-foreground/80 font-light leading-relaxed">
              Ensure reliable, fast, and secure student assessment tracking. Offline-first, single administrative control panel.
            </p>
          </div>

          <div></div>
        </div>

        {/* Right Side: Signup / Login Tabs portal */}
        <div className="md:col-span-7 p-6 md:p-10 flex flex-col justify-center">
          
          {/* Tab Switcher Headers */}
          <div className="flex border-b border-border mb-6">
            <button
              onClick={() => {
                setActiveTab('login');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition-colors cursor-pointer ${
                activeTab === 'login' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('setup');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition-colors cursor-pointer ${
                activeTab === 'setup' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive font-medium border border-destructive/20 mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-600 font-medium border border-emerald-500/20 mb-4 animate-in fade-in-50">
              <CheckCircle2 className="h-4 w-4 inline mr-1.5 shrink-0" />
              {success}
            </div>
          )}

          {/* SIGN IN TAB */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              {recoveryMode === 'none' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Username</label>
                    <Input 
                      value={loginUsername}
                      onChange={e => setLoginUsername(e.target.value)}
                      placeholder="admin"
                      disabled
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setRecoveryMode('enter-username');
                        }}
                        className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <Input 
                      type="password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full mt-2" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              ) : (
                /* PASSWORD RECOVERY SUB-WIZARD */
                <div>
                  <div className="flex items-center gap-2 text-primary text-xs font-semibold mb-4 bg-primary/10 p-2.5 rounded-lg border border-primary/20">
                    <HelpCircle className="h-4 w-4" />
                    <span>Forgot Password Recovery Wizard</span>
                  </div>

                  {recoveryMode === 'enter-username' && (
                    <form onSubmit={handleVerifyUsername} className="space-y-4 animate-in slide-in-from-right-5">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Username</label>
                        <Input 
                          value={loginUsername}
                          onChange={e => setLoginUsername(e.target.value)}
                          placeholder="admin"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setRecoveryMode('none')}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" /> Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                          Find User
                        </Button>
                      </div>
                    </form>
                  )}

                  {recoveryMode === 'security-question' && (
                    <form onSubmit={handleVerifyAnswer} className="space-y-4 animate-in slide-in-from-right-5">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase">Recovery Question 1</label>
                        <p className="text-sm font-bold text-foreground mt-1 bg-muted p-3 rounded-lg border border-border">
                          {recoveryQuestion}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Your Answer</label>
                        <Input 
                          value={recoveryAnswerInput}
                          onChange={e => setRecoveryAnswerInput(e.target.value)}
                          placeholder="Type answer here"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setRecoveryMode('enter-username')}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" /> Back
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading}>
                          {loading ? 'Verifying...' : 'Verify Answer'}
                        </Button>
                      </div>
                    </form>
                  )}

                  {recoveryMode === 'reset-password' && (
                    <form onSubmit={handleResetPassword} className="space-y-4 animate-in slide-in-from-right-5">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">New Password</label>
                        <Input 
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Confirm New Password</label>
                        <Input 
                          type="password"
                          value={confirmNewPassword}
                          onChange={e => setConfirmNewPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setRecoveryMode('security-question')}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" /> Back
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading}>
                          {loading ? 'Saving...' : 'Save & Login'}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SETUP TAB */}
          {activeTab === 'setup' && (
            <div className="space-y-4">
              
              {/* Steps indicators */}
              <div className="flex items-center justify-between mb-4 bg-muted/50 p-2.5 rounded-xl border border-border">
                {[1, 2, 3].map(stepNum => (
                  <div key={stepNum} className="flex items-center gap-1.5">
                    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      setupStep === stepNum 
                        ? 'bg-primary text-primary-foreground shadow-sm scale-110' 
                        : setupStep > stepNum 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-muted-foreground/20 text-muted-foreground'
                    }`}>
                      {stepNum}
                    </span>
                    <span className={`text-[10px] md:text-xs font-medium ${setupStep === stepNum ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {stepNum === 1 && 'School Profile'}
                      {stepNum === 2 && 'Credentials'}
                      {stepNum === 3 && 'Recovery'}
                    </span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSetupSubmit} className="space-y-4">
                
                {/* STEP 1: SCHOOL INFO */}
                {setupStep === 1 && (
                  <div className="space-y-4 animate-in slide-in-from-right-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Academic Year</label>
                      <Input 
                        value={setupAcademicYear}
                        onChange={e => setSetupAcademicYear(e.target.value)}
                        placeholder="2019 E.C."
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                        Creates the active Academic Cycle. Semesters 1 and 2 will be initialized.
                      </p>
                    </div>
                    <Button type="submit" className="w-full gap-1.5 justify-center">
                      Next Step <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* STEP 2: CREDENTIALS */}
                {setupStep === 2 && (
                  <div className="space-y-4 animate-in slide-in-from-right-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Username</label>
                      <Input 
                        value="admin"
                        disabled
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium flex items-center gap-1.5">
                        <KeyRound className="h-4 w-4 text-muted-foreground" /> Admin Password
                      </label>
                      <Input 
                        type="password"
                        value={setupPassword}
                        onChange={e => setSetupPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Confirm Password</label>
                      <Input 
                        type="password"
                        value={setupConfirmPassword}
                        onChange={e => setSetupConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setSetupStep(1)}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button type="submit" className="flex-1 gap-1.5 justify-center">
                        Next Step <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 3: PASSWORD RECOVERY QUESTION */}
                {setupStep === 3 && (
                  <div className="space-y-4 animate-in slide-in-from-right-5">
                    <div className="space-y-1.5 bg-primary/5 p-3 rounded-lg border border-primary/20 text-xs text-primary leading-relaxed">
                      Please write down your password recovery questions. This is the only way to reset your account password if you ever forget it.
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Recovery Question 1</label>
                      <p className="text-sm font-bold text-foreground mt-1 bg-muted p-3 rounded-lg border border-border">
                        What is your school name?
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Recovery Answer</label>
                      <Input 
                        value={setupRecoveryAnswer}
                        onChange={e => setSetupRecoveryAnswer(e.target.value)}
                        placeholder="e.g. Sabyan School (case-insensitive)"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-light">
                        Tip: You can use your configured school name as the recovery answer.
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setSetupStep(2)}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button type="submit" className="flex-1 gap-1.5 justify-center" disabled={loading}>
                        <UserCheck className="h-4 w-4" /> {loading ? 'Initializing Setup...' : 'Complete Setup & Open App'}
                      </Button>
                    </div>
                  </div>
                )}

              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
