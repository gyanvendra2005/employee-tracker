# StaffTrack Pro - Employee Tracker with Face Lock & Inactivity Alarm

A complete, offline Windows Desktop Application built with Electron, Web Biometrics, and Inactivity Alarm Monitor.

---

## 🌟 Key Features

### 1. 🛡️ Role-Based Access Control
- **Master Admin Access:**
  - Password: `admin123` (configurable in Settings).
  - Can view all employees, entire company attendance logs, leave approvals (Approve/Reject), and export CSV reports.
  - Can enroll and manage webcam face lock profiles for every employee.
- **Employee Personal Portal:**
  - When an employee logs in (via Face Lock or PIN `1234`), they see **ONLY** their own details:
    - Personal Clock In / Clock Out button.
    - Their own shift duration & today's status.
    - Their own attendance history (no access to other staff data).
    - Can apply for their own leaves and view approval status.

### 2. 📸 Face Lock / Biometric Unlock
- **Webcam Authentication:** Employees unlock their personal portal simply by positioning their face in front of their laptop camera.
- **Face Enrollment (in Admin Panel):**
  - Go to **Employees & Faces** tab.
  - Click **📸 Enroll Face** on any employee.
  - Look into the camera and click **Capture & Save Face**.
- **Instant Login:** On the login screen, clicking **Scan & Unlock** matches the live face against enrolled profiles and automatically opens that employee's portal.
- **Fallback PIN:** Employees can also use PIN `1234` if the camera is covered or unavailable.

### 3. 🚨 5-Minute Inactivity Beep Alarm
- Monitors both system-wide OS idle time (via Electron `powerMonitor`) and mouse/keyboard interactions.
- **5-Minute Timeout (300 seconds):** If no mouse movement or keypress occurs for 5 minutes:
  - Loud, pulsating high-pitch **Beep Siren Alarm** sounds through laptop speakers.
  - A flashing red **INACTIVITY ALERT** overlay blocks the screen.
- **Immediate Dismissal:** Moving the mouse, clicking, or pressing any key automatically silences the beep and resets the timer back to 0.
- **Test Mode:** Admin can test the alarm instantly via the header **"🚨 Test Beep Alarm"** button or set timeout to 10 seconds in Settings for testing.

---

## 💻 How to Run
Double-click:
```
launch.bat
```
Located in:
`C:\Users\admin\.gemini\antigravity\scratch\employee-tracker-desktop`
