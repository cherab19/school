# Sabyan Result System — User Guide

Welcome to the Sabyan School Academic Result Management System (Sabyan Result System) User Guide. This system is designed exclusively for the **School Admin** to manage academic results completely offline on Windows.

---

## Getting Started

### First-Launch Onboarding
1. When you open the application for the first time, you will be prompted with the **First-time Onboarding** screen.
2. Enter your **School Name** (which will appear as branding on all generated PDF report cards).
3. Specify the initial **Academic Year** using the format `YYYY/YYYY` (e.g. `2026/2027`).
4. Set up the **Admin Password** (Username is fixed as `admin`).
5. Click **Complete Setup** to initialize the system and proceed to the Dashboard.

### Logging In
1. On subsequent launches, the application opens to the **Login** screen.
2. The username is pre-filled as `admin`.
3. Enter your configured password and click **Login** to enter.

---

## Core Workflows

### 1. Academic Cycle & Semesters
To manage semesters and active cycles, go to **Academic Years** in the sidebar:
- **Activate a Year**: Click **Set Active** next to any academic year to make it the active workspace.
- **Semester Lifecycles**:
  - **Draft**: Newly created semesters. Marks can be configured.
  - **Active**: Click **Activate** to start mark entry for this semester. Only one semester can be active at a time.
  - **Lock & Finalize**: Click **Lock & Finalize** to freeze the semester. Once locked, marks cannot be modified unless explicitly unlocked.

### 2. Grades & Sections
Go to **Grades & Sections** in the sidebar:
- **Select a Grade**: Choose a grade level (Grade 1 through Grade 8) from the left panel.
- **Add Section**: Enter a section name (e.g., `Section A`, `Section B`) and click **Add Section**.
- **Delete Section**: Click the trash icon to remove a section. (Note: The system blocks deletion if students or assessments are assigned to the section to protect historical data).

### 3. Student Roster
Go to **Students** in the sidebar:
- **Add Student**: Click **Add Student**, fill in their unique **Student ID**, Full Name, Gender, and assign them a Grade and Section.
- **Search & Filters**: Search students instantly by ID/Name, or filter the list by Grade and Section.
- **Status Change**: Click the status button next to any student to toggle them between **Active** and **Inactive** (soft-delete).

### 4. Subjects
Go to **Subjects** in the sidebar:
- **Add Subject**: Click **Add Subject**, select the Grade level, and specify the name (e.g. `Mathematics`).
- **Filter**: Click any Grade level on the left to see only the subjects assigned to that grade.

### 5. Assessment Rules (Weight Config)
Go to **Assessments** in the sidebar:
- Choose the Grade, Section, and Subject.
- **Add Assessment**: Define evaluation items like `Quiz 1`, `Midterm`, or `Final Exam`. Set their **Maximum Score** and **Weight Percentage (%)**.
- **100% Rule**: **Crucial Requirement.** The sum of active assessment weights for a subject profile must equal exactly **100%** before you can enter marks. If it is not 100%, a warning banner will appear.

### 6. Entering Marks
Go to **Mark Entry** in the sidebar:
- Select the Grade, Section, and Subject.
- If the weights sum to 100%, the mark entry spreadsheet will appear.
- Click any cell to enter raw student scores.
- **Keyboard navigation**: Use the **Arrow keys** or **Enter** to navigate between cells quickly, just like in Excel.
- **Validation**: If you enter a score higher than the assessment's maximum mark (e.g., entering 12 for a max mark of 10), the cell highlights in red. You must correct this to save.
- Click **Save Marks** to commit changes and recalculate student totals.

### 7. Results & Unlocking
Go to **Results & Lock** in the sidebar:
- Select the Grade, Section, and Subject to view calculated totals.
- **Finalize & Lock**: Click **Finalize & Lock** to freeze marks. This locks the scores from accidental edits.
- **Unlocking**: If corrections are needed, click **Request Unlock** on a finalized subject. A warning will appear, and you will be asked to confirm. Unlocking will be logged in the audit trail.

---

## Reports & Backup Utilities

### 1. Generating Reports
Go to **Reports & Export** in the sidebar:
- **Individual Student PDF Card**: Select a student and click **Export Student Report PDF** to save a print-ready PDF report card. This includes totals, averages, signature sections, and rank positions (if enabled).
- **Class Roster Excel**: Select a section and click **Export Class Results Excel** to generate a `.xlsx` spreadsheet of the entire class grades.

### 2. Backup & Restore
Go to **Backup & Restore** in the sidebar:
- **Create Backup**: Click **Create Database Backup** to save the complete database file to an external folder or USB drive.
- **Restore Backup**: Click **Select Backup File & Restore**, choose a valid `.db` file, and type `RESTORE` to overwrite the current database. The system automatically creates a safety backup of your current database first.
- **Recent Audit Trail**: View the panel on the right to see recent administrator actions (e.g., student creations, backup events, result unlocks).

### 3. Settings
Go to **Settings** in the sidebar:
- Change the **School Name** header.
- Set **Scoring Precision** (nearest integer, 1 decimal place, or 2 decimal places).
- Toggle **Ranking / Positions** on or off.
- Update your **Admin Password**.
