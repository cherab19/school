import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { hashPassword, generateSalt } from '../utils/crypto';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { KeyRound, HelpCircle, ArrowLeft } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Recovery States
  type Mode = 'login' | 'enter-username' | 'security-question' | 'reset-password';
  const [mode, setMode] = useState<Mode>('login');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [recoveryAnswerHash, setRecoveryAnswerHash] = useState('');
  const [recoveryAnswerInput, setRecoveryAnswerInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const users = dbSelect<{ salt: string }>('SELECT salt FROM users WHERE username = ?', [username.trim().toLowerCase()]);
      if (users.length === 0) {
        setError('Invalid username or password');
        setLoading(false);
        return;
      }

      const salt = users[0].salt;
      const pwdHash = await hashPassword(password, salt);

      const successLogin = await login(username, pwdHash);
      if (!successLogin) {
        setError('Invalid username or password');
      }
    } catch (err: any) {
      setError(err.message || 'Login error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyUsername = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    try {
      const users = dbSelect<{ recovery_question: string; recovery_salt: string; recovery_answer_hash: string }>(
        'SELECT recovery_question, recovery_salt, recovery_answer_hash FROM users WHERE username = ?',
        [username.trim().toLowerCase()]
      );

      if (users.length === 0) {
        setError('Username not found');
        return;
      }

      if (!users[0].recovery_question) {
        setError('No password recovery configured for this user.');
        return;
      }

      setRecoveryQuestion(users[0].recovery_question);
      setRecoverySalt(users[0].recovery_salt);
      setRecoveryAnswerHash(users[0].recovery_answer_hash);
      setMode('security-question');
    } catch (err) {
      setError('Failed to query user database.');
    }
  };

  const handleVerifyAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!recoveryAnswerInput.trim()) {
      setError('Recovery answer is required.');
      return;
    }

    setLoading(true);
    try {
      const inputHash = await hashPassword(recoveryAnswerInput.trim().toLowerCase(), recoverySalt);
      if (inputHash === recoveryAnswerHash) {
        setMode('reset-password');
      } else {
        setError('Incorrect recovery answer. Please try again.');
      }
    } catch (err) {
      setError('Answer verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

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

      dbRun(
        'UPDATE users SET password_hash = ?, salt = ? WHERE username = ?',
        [newHash, newSalt, username.trim().toLowerCase()]
      );
      await saveDatabase();
      await logAudit('RESET_PASSWORD', 'USERS', username, 'Password reset via security recovery question');

      setSuccess('Your password has been reset successfully. Please login.');
      setMode('login');
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setRecoveryAnswerInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to update database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 animate-in fade-in-50">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            {mode === 'login' ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : mode === 'reset-password' ? (
              <KeyRound className="h-6 w-6" />
            ) : (
              <HelpCircle className="h-6 w-6" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {mode === 'login' ? 'Sabyan School Result System' : 'Password Recovery'}
          </CardTitle>
          <CardDescription>
            {mode === 'login' && 'Academic Result Management'}
            {mode === 'enter-username' && 'Enter your username to look up security details'}
            {mode === 'security-question' && 'Answer security questions to identify yourself'}
            {mode === 'reset-password' && 'Choose a secure new password for your account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive font-medium border border-destructive/20 mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-600 font-medium border border-emerald-500/20 mb-4">
              {success}
            </div>
          )}

          {/* LOGIN VIEW */}
          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Username</label>
                <Input 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  disabled
                />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-foreground">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setSuccess('');
                      setMode('enter-username');
                    }}
                    className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <Input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          )}

          {/* ENTER USERNAME VIEW */}
          {mode === 'enter-username' && (
            <form onSubmit={handleVerifyUsername} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Username</label>
                <Input 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setMode('login')}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" /> Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  Next Step
                </Button>
              </div>
            </form>
          )}

          {/* SECURITY QUESTION VIEW */}
          {mode === 'security-question' && (
            <form onSubmit={handleVerifyAnswer} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recovery Question 1</label>
                <p className="text-sm font-bold text-foreground mt-1 bg-muted/50 p-3 rounded-lg border border-border">
                  {recoveryQuestion}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Your Answer</label>
                <Input 
                  value={recoveryAnswerInput}
                  onChange={e => setRecoveryAnswerInput(e.target.value)}
                  placeholder="Type your answer"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setMode('enter-username')}
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

          {/* RESET PASSWORD VIEW */}
          {mode === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">New Password</label>
                <Input 
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Confirm New Password</label>
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
                  onClick={() => setMode('security-question')}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Saving...' : 'Save & Log In'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
