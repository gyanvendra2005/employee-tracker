const { app, BrowserWindow, ipcMain, dialog, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./src/db');

// Enable Chromium features for camera / face detection
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-blink-features', 'ShapeDetection');

let mainWindow;
let db;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: 'StaffTrack Pro - Attendance, Face Lock & Inactivity Monitor',
    backgroundColor: '#0b1120',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  db = new DatabaseManager();

  // --- SYSTEM INACTIVITY (OS-level idle detector) ---
  ipcMain.handle('get-system-idle-time', () => {
    try {
      return powerMonitor.getSystemIdleTime(); // returns seconds of system-wide idle
    } catch (e) {
      return 0;
    }
  });

  // --- AUTHENTICATION & SETTINGS ---
  ipcMain.handle('admin-login', async (event, password) => {
    const isValid = db.verifyAdmin(password);
    return { success: isValid, message: isValid ? 'Admin Authenticated' : 'Invalid Admin Password' };
  });

  ipcMain.handle('get-settings', async () => {
    return db.getSettings();
  });

  ipcMain.handle('update-settings', async (event, newSettings) => {
    return db.updateSettings(newSettings);
  });

  // --- FACE BIOMETRICS ---
  ipcMain.handle('save-face-data', async (event, empId, faceData) => {
    return db.saveFaceData(empId, faceData);
  });

  ipcMain.handle('get-enrolled-faces', async () => {
    return db.getEnrolledFaces();
  });

  ipcMain.handle('get-employee-self-portal', async (event, empId) => {
    return db.getEmployeeSelfPortalData(empId);
  });

  // --- EMPLOYEES CRUD ---
  ipcMain.handle('get-employees', async () => {
    return db.getEmployees();
  });

  ipcMain.handle('add-employee', async (event, empData) => {
    return db.addEmployee(empData);
  });

  ipcMain.handle('update-employee', async (event, id, data) => {
    return db.updateEmployee(id, data);
  });

  ipcMain.handle('delete-employee', async (event, id) => {
    return db.deleteEmployee(id);
  });

  // --- ATTENDANCE ---
  ipcMain.handle('get-today-attendance', async () => {
    return db.getTodayAttendance();
  });

  ipcMain.handle('get-all-attendance', async (event, filter) => {
    return db.getAllAttendance(filter);
  });

  ipcMain.handle('clock-in', async (event, employeeId, notes) => {
    return db.clockIn(employeeId, notes);
  });

  ipcMain.handle('clock-out', async (event, employeeId, notes) => {
    return db.clockOut(employeeId, notes);
  });

  // --- LEAVES ---
  ipcMain.handle('get-leaves', async (event, filter) => {
    return db.getLeaves(filter);
  });

  ipcMain.handle('apply-leave', async (event, leaveData) => {
    return db.applyLeave(leaveData);
  });

  ipcMain.handle('update-leave-status', async (event, id, status) => {
    return db.updateLeaveStatus(id, status);
  });

  // --- STATS & CSV EXPORT ---
  ipcMain.handle('get-dashboard-stats', async () => {
    return db.getDashboardStats();
  });

  ipcMain.handle('export-csv', async (event, filter) => {
    const csvContent = db.generateAttendanceCSV(filter);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Attendance Report',
      defaultPath: `attendance-report-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, csvContent, 'utf8');
      return { success: true, filePath };
    }
    return { success: false, canceled: true };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
