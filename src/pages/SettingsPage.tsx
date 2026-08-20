import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { dbSelect, dbRun, saveDatabase, logAudit } from '../services/db';
import { hashPassword, generateSalt } from '../utils/crypto';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, currentUser } = useApp();

  // Branding & Configuration states
  const [schoolName, setSchoolName] = useState(settings.school_name);
  const [precision, setPrecision] = useState(String(settings.precision));
  const [rankingEnabled, setRankingEnabled] = useState(settings.ranking_enabled ? 'true' : 'false');
  const [annualPolicy, setAnnualPolicy] = useState(settings.annual_policy);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!schoolName.trim()) {
      setError('School name cannot be empty.');
      return;
    }

    try {
      await updateSettings({
        school_name: schoolName.trim(),
        precision: parseInt(precision, 10),
        ranking_enabled: rankingEnabled === 'true',
        annual_policy: annualPolicy
      });
      await saveDatabase();
      await logAudit('SETTINGS_UPDATE', 'SETTINGS', null, 'Updated branding and academic result configuration settings');
      setSuccess('Configuration settings saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration settings.');
    }
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Configuration settings */}
        <Card>
          <CardHeader>
            <CardTitle>System Configuration</CardTitle>
            <CardDescription>Tailor report card headers and assessment precision.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-3 text-xs text-destructive font-medium border border-destructive/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-3 text-xs text-emerald-600 font-medium border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">School Name (Header Branding)</label>
                <Input
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="Sabyan School"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Numerical Scoring Precision</label>
                <Select
                  value={precision}
                  onChange={e => setPrecision(e.target.value)}
                  options={[
                    { value: '0', label: 'Nearest Integer (e.g. 85)' },
                    { value: '1', label: '1 Decimal Place (e.g. 85.2)' },
                    { value: '2', label: '2 Decimal Places (e.g. 85.23)' }
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Student Ranking / Positions</label>
                <Select
                  value={rankingEnabled}
                  onChange={e => setRankingEnabled(e.target.value)}
                  options={[
                    { value: 'false', label: 'Disabled (Do not print rankings)' },
                    { value: 'true', label: 'Enabled (Include position in reports)' }
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Annual Calculation Policy</label>
                <Select
                  value={annualPolicy}
                  onChange={e => setAnnualPolicy(e.target.value)}
                  options={[
                    { value: '50/50', label: 'Equal Weight: 50% S1 + 50% S2' },
                    { value: 'none', label: 'No Annual Calculations (independent semesters only)' }
                  ]}
                />
              </div>

              <Button type="submit" className="w-full mt-2">
                Save Configuration
              </Button>
            </form>
          </CardContent>
        </Card>

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
