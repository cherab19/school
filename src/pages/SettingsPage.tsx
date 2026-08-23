import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { hashPassword, generateSalt } from '../utils/crypto';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentUser } = useApp();

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch current admin details
      const userRows = dbSelect<{ password_hash: string; salt: string }>(
        'SELECT password_hash, salt FROM users WHERE username = ?',
        [currentUser ? currentUser.trim().toLowerCase() : 'admin']
      );

      if (userRows.length === 0) {
        setPasswordError('Admin user not found.');
        setLoading(false);
        return;
      }

      const { password_hash: currentHash, salt: currentSalt } = userRows[0];
      const verifiedHash = await hashPassword(oldPassword, currentSalt);

      if (verifiedHash !== currentHash) {
        setPasswordError('Incorrect old password.');
        setLoading(false);
        return;
      }

      // 2. Hash new password
      const newSalt = generateSalt();
      const newHash = await hashPassword(newPassword, newSalt);

      dbRun(
        'UPDATE users SET password_hash = ?, salt = ? WHERE username = ?',
        [newHash, newSalt, currentUser ? currentUser.trim().toLowerCase() : 'admin']
      );
      await saveDatabase();
      await logAudit('CHANGE_PASSWORD', 'USERS', currentUser, 'Admin password changed successfully');

      setPasswordSuccess('Password updated successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in-50">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm font-light mt-1">Configure Sabyan Result System branding, result parameters, and credentials.</p>
      </div>

      <div className="max-w-md mx-auto">
        {/* Change Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Change Admin Password</CardTitle>
            </div>
            <CardDescription>Secure administrative access to Sabyan Result System.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-xs text-destructive font-medium border border-destructive/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}
              {passwordSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-3 text-xs text-emerald-600 font-medium border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Current Password</label>
                <Input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

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
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" variant="secondary" className="w-full mt-2" disabled={loading}>
                {loading ? 'Updating Password...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
