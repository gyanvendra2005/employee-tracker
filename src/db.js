const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '..', 'data');
    this.dataDir = path.join(userDataPath, 'employee_tracker_data');
    this.dbFile = path.join(this.dataDir, 'database.json');
    this.init();
  }

  init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (!fs.existsSync(this.dbFile)) {
      const initialData = {
        settings: {
          adminPassword: 'admin123',
          inactivityTimeoutSeconds: 300, // 5 minutes
          enableInactivityBeep: true
        },
        employees: [
          {
            id: 'EMP-001',
            name: 'Rahul Sharma',
            role: 'Senior Software Engineer',
            department: 'Engineering',
            email: 'rahul.sharma@example.com',
            phone: '+91 98765 43210',
            joiningDate: '2023-01-15',
            status: 'Active',
            pin: '1234',
            faceData: null
          },
          {
            id: 'EMP-002',
            name: 'Pooja Verma',
            role: 'Product Designer',
            department: 'UI/UX Design',
            email: 'pooja.v@example.com',
            phone: '+91 98765 43211',
            joiningDate: '2023-03-10',
            status: 'Active',
            pin: '1234',
            faceData: null
          },
          {
            id: 'EMP-003',
            name: 'Aman Patel',
            role: 'QA Automation Lead',
            department: 'Quality Assurance',
            email: 'aman.patel@example.com',
            phone: '+91 98765 43212',
            joiningDate: '2023-06-01',
            status: 'Active',
            pin: '1234',
            faceData: null
          }
        ],
        attendance: [],
        leaves: []
      };
      this.saveData(initialData);
    } else {
      // Ensure settings exist if migrating from previous DB version
      const data = this.loadData();
      if (!data.settings) {
        data.settings = {
          adminPassword: 'admin123',
          inactivityTimeoutSeconds: 300,
          enableInactivityBeep: true
        };
        this.saveData(data);
      }
    }
  }

  loadData() {
    try {
      const content = fs.readFileSync(this.dbFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error loading DB:', err);
      return { settings: {}, employees: [], attendance: [], leaves: [] };
    }
  }

  saveData(data) {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Error saving DB:', err);
      return false;
    }
  }

  // --- SETTINGS & AUTH ---
  getSettings() {
    const data = this.loadData();
    return data.settings || { adminPassword: 'admin123', inactivityTimeoutSeconds: 300, enableInactivityBeep: true };
  }

  updateSettings(newSettings) {
    const data = this.loadData();
    data.settings = { ...data.settings, ...newSettings };
    this.saveData(data);
    return data.settings;
  }

  verifyAdmin(password) {
    const settings = this.getSettings();
    return settings.adminPassword === password;
  }

  // --- EMPLOYEE CRUD & FACE BIOMETRICS ---
  getEmployees() {
    const data = this.loadData();
    return data.employees || [];
  }

  getEmployeeById(id) {
    const data = this.loadData();
    return data.employees.find(e => e.id === id) || null;
  }

  saveFaceData(employeeId, faceData) {
    const data = this.loadData();
    const emp = data.employees.find(e => e.id === employeeId);
    if (!emp) throw new Error('Employee not found');

    emp.faceData = faceData; // contains biometric signature and preview photo
    this.saveData(data);
    return { success: true, employeeId: emp.id, name: emp.name };
  }

  getEnrolledFaces() {
    const data = this.loadData();
    return (data.employees || [])
      .filter(e => e.faceData && (e.faceData.signature || (e.faceData.signatures && e.faceData.signatures.length > 0)))
      .map(e => ({
        id: e.id,
        name: e.name,
        department: e.department,
        signatures: e.faceData.signatures || (e.faceData.signature ? [e.faceData.signature] : []),
        signature: e.faceData.signature || (e.faceData.signatures ? e.faceData.signatures[0] : null),
        photo: e.faceData.photo
      }));
  }

  addEmployee(empData) {
    const data = this.loadData();
    const id = empData.id || `EMP-${String(data.employees.length + 1).padStart(3, '0')}`;
    
    if (data.employees.some(e => e.id === id)) {
      throw new Error(`Employee ID ${id} already exists`);
    }

    const newEmp = {
      id,
      name: empData.name,
      role: empData.role || 'Staff',
      department: empData.department || 'General',
      email: empData.email || '',
      phone: empData.phone || '',
      joiningDate: empData.joiningDate || new Date().toISOString().split('T')[0],
      status: empData.status || 'Active',
      pin: empData.pin || '1234',
      faceData: null
    };

    data.employees.push(newEmp);
    this.saveData(data);
    return newEmp;
  }

  updateEmployee(id, updatedFields) {
    const data = this.loadData();
    const index = data.employees.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Employee not found');

    data.employees[index] = { ...data.employees[index], ...updatedFields };
    this.saveData(data);
    return data.employees[index];
  }

  deleteEmployee(id) {
    const data = this.loadData();
    data.employees = data.employees.filter(e => e.id !== id);
    this.saveData(data);
    return true;
  }

  // --- EMPLOYEE SELF-PORTAL (RESTRICTED DATA ACCESS) ---
  getEmployeeSelfPortalData(employeeId) {
    const data = this.loadData();
    const employee = data.employees.find(e => e.id === employeeId);
    if (!employee) throw new Error('Employee not found');

    const today = this.getTodayDateString();
    
    // Only attendance of THIS employee
    const myAttendance = (data.attendance || [])
      .filter(a => a.employeeId === employeeId)
      .sort((a, b) => new Date(b.date + ' ' + (b.clockIn || '00:00:00')) - new Date(a.date + ' ' + (a.clockIn || '00:00:00')));

    // Today's attendance record
    const todayRecord = myAttendance.find(a => a.date === today) || null;

    // Only leaves of THIS employee
    const myLeaves = (data.leaves || [])
      .filter(l => l.employeeId === employeeId)
      .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    const settings = this.getSettings();

    return {
      profile: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        department: employee.department,
        email: employee.email,
        phone: employee.phone,
        hasFaceEnrolled: Boolean(employee.faceData && employee.faceData.signature),
        facePhoto: employee.faceData ? employee.faceData.photo : null
      },
      todayRecord,
      attendanceHistory: myAttendance,
      leaves: myLeaves,
      inactivityTimeoutSeconds: settings.inactivityTimeoutSeconds || 300,
      enableInactivityBeep: settings.enableInactivityBeep !== false
    };
  }

  // --- ATTENDANCE (CLOCK IN / CLOCK OUT) ---
  getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getCurrentTimeString() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  }

  getTodayAttendance() {
    const today = this.getTodayDateString();
    const data = this.loadData();
    return (data.attendance || []).filter(a => a.date === today);
  }

  getAllAttendance(filter = {}) {
    const data = this.loadData();
    let records = data.attendance || [];

    if (filter.date) {
      records = records.filter(r => r.date === filter.date);
    }
    if (filter.employeeId) {
      records = records.filter(r => r.employeeId === filter.employeeId);
    }
    if (filter.month) {
      records = records.filter(r => r.date.startsWith(filter.month));
    }

    records.sort((a, b) => new Date(b.date + ' ' + (b.clockIn || '00:00:00')) - new Date(a.date + ' ' + (a.clockIn || '00:00:00')));
    return records;
  }

  clockIn(employeeId, notes = '') {
    const data = this.loadData();
    const employee = data.employees.find(e => e.id === employeeId);
    if (!employee) throw new Error('Employee not found');

    const today = this.getTodayDateString();
    const time = this.getCurrentTimeString();

    const existing = data.attendance.find(a => a.employeeId === employeeId && a.date === today);
    if (existing) {
      if (!existing.clockOut) {
        throw new Error(`${employee.name} is already clocked in today at ${existing.clockIn}`);
      } else {
        throw new Error(`${employee.name} has already completed attendance today`);
      }
    }

    const record = {
      id: `ATT-${Date.now()}`,
      employeeId,
      employeeName: employee.name,
      department: employee.department,
      date: today,
      clockIn: time,
      clockOut: null,
      totalHours: null,
      status: 'Present',
      notes: notes || ''
    };

    data.attendance.push(record);
    this.saveData(data);
    return record;
  }

  clockOut(employeeId, notes = '') {
    const data = this.loadData();
    const today = this.getTodayDateString();
    const record = data.attendance.find(a => a.employeeId === employeeId && a.date === today);

    if (!record) {
      throw new Error(`Employee hasn't clocked in today`);
    }
    if (record.clockOut) {
      throw new Error(`Employee has already clocked out at ${record.clockOut}`);
    }

    const clockOutTime = this.getCurrentTimeString();
    record.clockOut = clockOutTime;
    if (notes) record.notes = (record.notes ? record.notes + '; ' : '') + notes;

    const [inH, inM, inS] = record.clockIn.split(':').map(Number);
    const [outH, outM, outS] = clockOutTime.split(':').map(Number);
    
    const inTotalSec = inH * 3600 + inM * 60 + (inS || 0);
    const outTotalSec = outH * 3600 + outM * 60 + (outS || 0);
    const diffSec = Math.max(0, outTotalSec - inTotalSec);

    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    record.totalHours = `${hours}h ${minutes}m`;
    record.totalHoursDecimal = +(diffSec / 3600).toFixed(2);

    this.saveData(data);
    return record;
  }

  // --- LEAVE MANAGEMENT ---
  getLeaves(filter = {}) {
    const data = this.loadData();
    let leaves = data.leaves || [];
    if (filter.employeeId) {
      leaves = leaves.filter(l => l.employeeId === filter.employeeId);
    }
    if (filter.status) {
      leaves = leaves.filter(l => l.status === filter.status);
    }
    return leaves.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  }

  applyLeave(leaveData) {
    const data = this.loadData();
    const employee = data.employees.find(e => e.id === leaveData.employeeId);
    if (!employee) throw new Error('Employee not found');

    const newLeave = {
      id: `LV-${Date.now()}`,
      employeeId: leaveData.employeeId,
      employeeName: employee.name,
      department: employee.department,
      leaveType: leaveData.leaveType || 'Casual Leave',
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      reason: leaveData.reason || '',
      status: 'Pending', // Pending approval by Admin
      appliedAt: new Date().toISOString()
    };

    data.leaves.push(newLeave);
    this.saveData(data);
    return newLeave;
  }

  updateLeaveStatus(leaveId, status) {
    const data = this.loadData();
    const leave = data.leaves.find(l => l.id === leaveId);
    if (!leave) throw new Error('Leave record not found');

    leave.status = status;
    this.saveData(data);
    return leave;
  }

  // --- DASHBOARD STATS ---
  getDashboardStats() {
    const data = this.loadData();
    const today = this.getTodayDateString();
    const totalEmployees = data.employees.length;

    const todayAttendance = (data.attendance || []).filter(a => a.date === today);
    const presentCount = todayAttendance.length;
    const currentlyWorking = todayAttendance.filter(a => !a.clockOut).length;

    const onLeaveToday = (data.leaves || []).filter(l => {
      return l.status === 'Approved' && l.startDate <= today && today <= l.endDate;
    }).length;

    return {
      today,
      totalEmployees,
      presentToday: presentCount,
      currentlyWorking,
      onLeaveToday,
      absentToday: Math.max(0, totalEmployees - presentCount - onLeaveToday)
    };
  }

  // --- CSV EXPORT GENERATOR ---
  generateAttendanceCSV(filter = {}) {
    const records = this.getAllAttendance(filter);
    const headers = ['Attendance ID', 'Employee ID', 'Name', 'Department', 'Date', 'Clock In', 'Clock Out', 'Total Hours', 'Status', 'Notes'];
    
    const rows = records.map(r => [
      `"${r.id}"`,
      `"${r.employeeId}"`,
      `"${r.employeeName}"`,
      `"${r.department}"`,
      `"${r.date}"`,
      `"${r.clockIn || '-'}"`,
      `"${r.clockOut || '-'}"`,
      `"${r.totalHours || 'In Progress'}"`,
      `"${r.status}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

module.exports = DatabaseManager;
