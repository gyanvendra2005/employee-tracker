const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Authentication & Roles
  adminLogin: (password) => ipcRenderer.invoke('admin-login', password),
  getEmployeeSelfPortal: (empId) => ipcRenderer.invoke('get-employee-self-portal', empId),
  getEnrolledFaces: () => ipcRenderer.invoke('get-enrolled-faces'),
  saveFaceData: (empId, faceData) => ipcRenderer.invoke('save-face-data', empId, faceData),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (newSettings) => ipcRenderer.invoke('update-settings', newSettings),

  // System Inactivity
  getSystemIdleTime: () => ipcRenderer.invoke('get-system-idle-time'),

  // Employees (Admin)
  getEmployees: () => ipcRenderer.invoke('get-employees'),
  addEmployee: (empData) => ipcRenderer.invoke('add-employee', empData),
  updateEmployee: (id, data) => ipcRenderer.invoke('update-employee', id, data),
  deleteEmployee: (id) => ipcRenderer.invoke('delete-employee', id),

  // Attendance
  getTodayAttendance: () => ipcRenderer.invoke('get-today-attendance'),
  getAllAttendance: (filter) => ipcRenderer.invoke('get-all-attendance', filter),
  clockIn: (employeeId, notes) => ipcRenderer.invoke('clock-in', employeeId, notes),
  clockOut: (employeeId, notes) => ipcRenderer.invoke('clock-out', employeeId, notes),

  // Leaves
  getLeaves: (filter) => ipcRenderer.invoke('get-leaves', filter),
  applyLeave: (leaveData) => ipcRenderer.invoke('apply-leave', leaveData),
  updateLeaveStatus: (id, status) => ipcRenderer.invoke('update-leave-status', id, status),

  // Stats & Export
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  exportCSV: (filter) => ipcRenderer.invoke('export-csv', filter)
});
