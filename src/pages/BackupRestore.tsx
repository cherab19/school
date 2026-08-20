import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getDb, logAudit, saveDatabase } from '../services/db';
import initSqlJs from 'sql.js';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { AlertCircle, CheckCircle2, Database, UploadCloud, ShieldAlert, Clock } from 'lucide-react';

interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  entity: string;
  description: string;
}

export const BackupRestore: React.FC = () => {
  const { refreshState } = useApp();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialog State
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [selectedRestorePath, setSelectedRestorePath] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const loadAuditLogs = () => {
    try {
      const rows = dbSelect<AuditLog>(
        'SELECT id, timestamp, action, entity, description FROM audit_logs ORDER BY id DESC LIMIT 20'
      );
      setLogs(rows);
    } catch (err) {
      console.error('Failed to load audit logs.');
    }
  };

  const dbRun = (sql: string, params: any[] = []) => {
    try {
      const db = getDb();
      db.run(sql, params);
    } catch (e: any) {
      throw new Error(`DB execute error: ${e.message}`);
    }
  };

  React.useEffect(() => {
    loadAuditLogs();
  }, []);

  // Helper local db select just for logs
  function dbSelect<T = any>(sql: string, params: any[] = []): T[] {
    try {
      const db = getDb();
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as unknown as T);
      }
      stmt.free();
      return results;
    } catch (e) {
      return [];
    }
  }

  // 1. Create custom backup
  const handleCreateBackup = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!window.electron) {
        setError('Desktop host not detected.');
        setLoading(false);
        return;
      }

      // Ask user where to save the backup
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `Sabyan_Backup_${timestamp}.db`;

      const db = getDb();
      const binary = db.export();

      // Open save file dialog via electron
      const savedPath = await window.electron.saveFileDialog({
        defaultName,
        filters: [{ name: 'Database Files', extensions: ['db'] }],
        arrayBuffer: binary.buffer as ArrayBuffer
      });

      if (savedPath) {
        await logAudit('BACKUP', 'SYSTEM', null, `Created manual database backup saved at ${savedPath}`);
        setSuccess(`Database backup successfully saved at: ${savedPath}`);
        loadAuditLogs();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create backup.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Open file dialog to choose restore file
  const handleOpenRestoreDialog = async () => {
    setError('');
    setSuccess('');
    if (!window.electron) {
      setError('Desktop host not detected.');
      return;
    }

    try {
      const filePath = await window.electron.selectFile([
        { name: 'Database Files', extensions: ['db'] }
      ]);
      if (filePath) {
        setSelectedRestorePath(filePath);
        setRestoreConfirmText('');
        setIsRestoreOpen(true);
      }
    } catch (err) {
      setError('Failed to select database file.');
    }
  };

  // 3. Confirm and apply database restoration
  const handleApplyRestore = async () => {
    setError('');
    setSuccess('');

    if (restoreConfirmText !== 'RESTORE') {
      setError('Please type "RESTORE" to confirm this action.');
      return;
    }

    setIsRestoreOpen(false);
    setLoading(true);

    try {
      // Load selected backup file binary
      const binary = await window.electron.readExternalFile(selectedRestorePath);
      const uint8 = new Uint8Array(binary);

      // Validate schema format by initializing in-memory temporary database
      const SQL = await initSqlJs({ locateFile: file => `./${file}` });
      const tempDb = new SQL.Database(uint8);
      
      // Check for critical Sabyan tables
      const tablesResult = tempDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tablesResult.length > 0 ? tablesResult[0].values.map(v => String(v[0])) : [];

      const requiredTables = ['users', 'students', 'marks', 'results', 'settings'];
      const isValidSchema = requiredTables.every(t => tableNames.includes(t));

      if (!isValidSchema) {
        setError('Restoration failed: Selected backup file does not contain a valid Sabyan Results database schema.');
        setLoading(false);
        tempDb.close();
        return;
      }
      tempDb.close();

      // Create a SAFETY BACKUP of current state first
      const currentDb = getDb();
      const currentBinary = currentDb.export();
      await window.electron.dbCreateBackup(currentBinary.buffer as ArrayBuffer);

      // Apply the new database buffer
      await window.electron.dbSave(binary);

      // Reload database context
      refreshState();
      
      // Force reload page to ensure memory state resets completely
      setTimeout(() => {
        window.location.reload();
      }, 500);

      // Wait, we won't log audit here since the database gets completely replaced,
      // but we saved a safety copy at safetyBackupPath just in case!
    } catch (err: any) {
      setError(err.message || 'Restoration failed. Ensure the file is not corrupted.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in-50">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Backup & Restore</h1>
        <p className="text-muted-foreground text-sm font-light mt-1">Safeguard academic records. Create physical backup copies or restore historical systems.</p>
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
        {/* Left Side: Backup Operations */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Database Backup</CardTitle>
              </div>
              <CardDescription>Export the entire database file to an external folder or USB storage device.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                It is highly recommended to perform backups weekly. Sabyan School Result System creates local automatic copies on every startup, but physical external backups protect against hard drive failures.
              </p>
              <Button onClick={handleCreateBackup} className="w-full gap-2" disabled={loading}>
                <Database className="h-4 w-4" /> Create Database Backup
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-primary" />
                <CardTitle>Restore Database</CardTitle>
              </div>
              <CardDescription>Restore the Sabyan Result System database from a previously saved copy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 leading-relaxed">
                <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-800">Warning:</span> Restoring a backup completely replaces the current database. All current students, subjects, and score logs since the backup date will be overwritten.
                </div>
              </div>
              <Button onClick={handleOpenRestoreDialog} variant="secondary" className="w-full gap-2" disabled={loading}>
                <UploadCloud className="h-4 w-4" /> Select Backup File & Restore
              </Button>
            </CardContent>
          </Card>


        </div>

        {/* Right Side: Audit Logs */}
        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Recent Audit Trail</CardTitle>
            </div>
            <CardDescription>Recent administrative modifications recorded in the system.</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm font-light">
                No logs recorded yet.
              </div>
            ) : (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span className="font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-muted-foreground/10 text-foreground">{log.action}</span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-foreground font-medium pt-1">{log.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Restore Warning Dialog */}
      <Dialog
        isOpen={isRestoreOpen}
        onClose={() => setIsRestoreOpen(false)}
        title="Confirm Database Restoration"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 text-xs leading-relaxed">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <span className="font-bold text-red-800">Critical Action Required:</span> You are about to replace Sabyan School's database. A safety backup will be auto-created before applying the restoration, but this should only be done if you are absolutely sure.
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Selected File: <strong className="text-foreground">{selectedRestorePath}</strong></p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Type "RESTORE" to confirm</label>
            <input
              type="text"
              value={restoreConfirmText}
              onChange={e => setRestoreConfirmText(e.target.value)}
              placeholder="RESTORE"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsRestoreOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplyRestore}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Perform Restoration
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
