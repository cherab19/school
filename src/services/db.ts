import initSqlJs, { type Database } from 'sql.js';

let dbInstance: Database | null = null;
let sqlJsLoaded: any = null;

// Initialize sql.js and load database binary
export async function initDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  try {
    if (!sqlJsLoaded) {
      let wasmBinary: ArrayBuffer | undefined = undefined;
      if (window.electron && window.electron.loadWasm) {
        try {
          wasmBinary = await window.electron.loadWasm();
        } catch (e) {
          console.error('Failed to load wasm via IPC:', e);
        }
      }

      sqlJsLoaded = await initSqlJs({
        wasmBinary: wasmBinary,
        locateFile: (file) => {
          // In Electron file:// protocol, use relative path. In standard web browsers, use absolute root path.
          return window.electron ? `./${file}` : `/${file}`;
        }
      });
    }

    let binary: ArrayBuffer | null = null;
    if (window.electron) {
      binary = await window.electron.dbLoad();
    }

    if (binary) {
      dbInstance = new sqlJsLoaded.Database(new Uint8Array(binary));
    } else {
      dbInstance = new sqlJsLoaded.Database();
    }

    // Run migrations
    if (dbInstance) {
      runMigrations(dbInstance);
    }

    // Initial save in case migrations were run
    await saveDatabase();

    if (!dbInstance) throw new Error('Database initialization failed');
    return dbInstance;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    if (window.electron) {
      window.electron.logError(`Database initialization error: ${error}`);
    }
    throw error;
  }
}

// Get raw DB instance
export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

// Save database to disk
export async function saveDatabase(): Promise<void> {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    if (window.electron) {
      await window.electron.dbSave(data.buffer as ArrayBuffer);
    }
  } catch (error) {
    console.error('Failed to save database:', error);
    if (window.electron) {
      window.electron.logError(`Database save error: ${error}`);
    }
    throw error;
  }
}

// Reset database by creating a new empty database
export async function resetDatabase(): Promise<void> {
  if (!sqlJsLoaded) return;
  dbInstance = new sqlJsLoaded.Database();
  runMigrations(dbInstance!);
  await saveDatabase();
}

// Database migrations helper
function runMigrations(db: Database) {
  try {
    // Safely migrate from assessment-based schema to subject-based schema
    const testCol = db.exec("PRAGMA table_info(marks);");
    const cols = testCol.length > 0 ? testCol[0].values.map(v => String(v[1])) : [];
    if (cols.includes('assessment_id')) {
      db.run("DROP TABLE IF EXISTS marks;");
      db.run("DROP TABLE IF EXISTS results;");
      db.run("DROP TABLE IF EXISTS assessments;");
    }
  } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      recovery_question TEXT,
      recovery_answer_hash TEXT,
      recovery_salt TEXT
    );
  `);

  try {
    db.run("ALTER TABLE users ADD COLUMN recovery_question TEXT;");
  } catch(e) {}
  try {
    db.run("ALTER TABLE users ADD COLUMN recovery_answer_hash TEXT;");
  } catch(e) {}
  try {
    db.run("ALTER TABLE users ADD COLUMN recovery_salt TEXT;");
  } catch(e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'INACTIVE'))
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'FINALIZED')),
      UNIQUE(academic_year_id, name),
      FOREIGN KEY(academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(grade_id, name),
      FOREIGN KEY(grade_id) REFERENCES grades(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
      grade_id INTEGER NOT NULL,
      section_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'INACTIVE')),
      FOREIGN KEY(grade_id) REFERENCES grades(id),
      FOREIGN KEY(section_id) REFERENCES sections(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'INACTIVE')),
      UNIQUE(name, grade_id),
      FOREIGN KEY(grade_id) REFERENCES grades(id)
    );

    CREATE TABLE IF NOT EXISTS marks (
      student_id TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      semester_id INTEGER NOT NULL,
      score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
      PRIMARY KEY(student_id, subject_id, semester_id),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY(semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      description TEXT NOT NULL
    );
  `);

  // Seed default Grade 1 to 8 if not already present
  db.run(`
    INSERT OR IGNORE INTO grades (id, name) VALUES 
      (1, 'Grade 1'), 
      (2, 'Grade 2'), 
      (3, 'Grade 3'), 
      (4, 'Grade 4'), 
      (5, 'Grade 5'), 
      (6, 'Grade 6'), 
      (7, 'Grade 7'), 
      (8, 'Grade 8')
  `);

  // Add indexes for optimization
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_students_section ON students(section_id);
    CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade_id);
    CREATE INDEX IF NOT EXISTS idx_marks_lookup ON marks(student_id, subject_id, semester_id);
  `);
}

// Execute mutating SQL command (INSERT, UPDATE, DELETE)
export function dbRun(sql: string, params: any[] = []): void {
  const db = getDb();
  db.run(sql, params);
}

// Execute a query and return array of mapped objects
export function dbSelect<T = any>(sql: string, params: any[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

// Helper to write audit log entries
export async function logAudit(action: string, entity: string, entityId: string | null, description: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    dbRun(
      `INSERT INTO audit_logs (timestamp, action, entity, entity_id, description) VALUES (?, ?, ?, ?, ?)`,
      [timestamp, action, entity, entityId, description]
    );
    await saveDatabase();
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}
