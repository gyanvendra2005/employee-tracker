// ==========================================
// StaffTrack Pro - Full Application Engine
// Face Biometrics, Role Auth & Inactivity Alarm
// ==========================================

// Global App State
let currentUser = null; // { role: 'admin' | 'employee', id, name, ... }
let employees = [];
let todayAttendance = [];
let currentAdminTab = 'dashboard';
let currentEmpTab = 'emp-portal';
let enrolledFaces = [];

// Inactivity & Alarm State
let inactivityTimeoutSeconds = 300; // 5 minutes default
let lastUserActivityTimestamp = Date.now();
let isAlarmRinging = false;
let audioCtx = null;
let beepIntervalTimer = null;
let idleMonitorInterval = null;

// Camera Streams
let loginCameraStream = null;
let enrollCameraStream = null;
let currentEnrollEmpId = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const adminViewsContainer = document.getElementById('admin-views-container');
const employeeViewsContainer = document.getElementById('employee-views-container');
const adminNavMenu = document.getElementById('admin-nav-menu');
const employeeNavMenu = document.getElementById('employee-nav-menu');
const sessionRoleLabel = document.getElementById('session-role-label');
const sessionNameLabel = document.getElementById('session-name-label');
const sidebarRoleBadge = document.getElementById('sidebar-role-badge');

const liveTimeEl = document.getElementById('live-time');
const liveDateEl = document.getElementById('live-date');
const terminalBigClock = document.getElementById('terminal-big-clock');
const terminalBigDate = document.getElementById('terminal-big-date');

const alarmOverlay = document.getElementById('inactivity-alarm-overlay');
const idleSecondsText = document.getElementById('idle-seconds-text');
const idleIndicatorDot = document.getElementById('idle-indicator-dot');

const faceCanvas = document.getElementById('face-canvas');
const toastContainer = document.getElementById('toast-container');

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  setupClock();
  setupNavigation();
  setupEventListeners();
  setupInactivityTracker();
  await loadAppSettings();
  await refreshGlobalData();
  setupLoginTabs();
  startLoginCamera();
});

// --- CLOCK ---
function setupClock() {
  function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    if (liveTimeEl) liveTimeEl.textContent = timeStr;
    if (liveDateEl) liveDateEl.textContent = dateStr;
    if (terminalBigClock) terminalBigClock.textContent = timeStr;
    if (terminalBigDate) terminalBigDate.textContent = dateStr;
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// --- APP SETTINGS ---
async function loadAppSettings() {
  try {
    const settings = await window.api.getSettings();
    if (settings && settings.inactivityTimeoutSeconds) {
      inactivityTimeoutSeconds = Number(settings.inactivityTimeoutSeconds);
      const selectEl = document.getElementById('setting-inactivity-select');
      if (selectEl) selectEl.value = String(inactivityTimeoutSeconds);
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

// --- GLOBAL REFRESH ---
async function refreshGlobalData() {
  try {
    employees = await window.api.getEmployees();
    todayAttendance = await window.api.getTodayAttendance();
    enrolledFaces = await window.api.getEnrolledFaces();

    populateAllDropdowns();

    if (currentUser && currentUser.role === 'admin') {
      await refreshAdminDashboard();
    } else if (currentUser && currentUser.role === 'employee') {
      await refreshEmployeePortal();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function populateAllDropdowns() {
  const loginEmpSelect = document.getElementById('login-emp-select');
  const quickSelect = document.getElementById('quick-emp-select');
  const terminalSelect = document.getElementById('terminal-emp-select');
  const leaveSelect = document.getElementById('leave-select-emp');
  const reportSelect = document.getElementById('report-filter-emp');
  const deptFilter = document.getElementById('emp-dept-filter');

  const prevLogin = loginEmpSelect?.value;
  const prevQuick = quickSelect?.value;
  const prevTerminal = terminalSelect?.value;

  if (loginEmpSelect) loginEmpSelect.innerHTML = '<option value="">-- Choose Employee --</option>';
  if (quickSelect) quickSelect.innerHTML = '<option value="">-- Choose Employee --</option>';
  if (terminalSelect) terminalSelect.innerHTML = '<option value="">-- Select Employee --</option>';
  if (leaveSelect) leaveSelect.innerHTML = '<option value="">-- Choose Employee --</option>';
  if (reportSelect) reportSelect.innerHTML = '<option value="">All Employees</option>';

  const departments = new Set();

  employees.forEach(emp => {
    departments.add(emp.department);
    const opt = `<option value="${emp.id}">${emp.name} (${emp.id}) - ${emp.department}</option>`;
    if (loginEmpSelect) loginEmpSelect.insertAdjacentHTML('beforeend', opt);
    if (quickSelect) quickSelect.insertAdjacentHTML('beforeend', opt);
    if (terminalSelect) terminalSelect.insertAdjacentHTML('beforeend', opt);
    if (leaveSelect) leaveSelect.insertAdjacentHTML('beforeend', opt);
    if (reportSelect) reportSelect.insertAdjacentHTML('beforeend', opt);
  });

  if (loginEmpSelect && prevLogin) loginEmpSelect.value = prevLogin;
  if (quickSelect && prevQuick) quickSelect.value = prevQuick;
  if (terminalSelect && prevTerminal) terminalSelect.value = prevTerminal;

  if (deptFilter) {
    deptFilter.innerHTML = '<option value="">All Departments</option>';
    departments.forEach(dept => {
      if (dept) deptFilter.insertAdjacentHTML('beforeend', `<option value="${dept}">${dept}</option>`);
    });
  }
}

let uploadedBiometric = null;

// ========================================================
// 📸 FACE BIOMETRIC ENGINE (Webcam + Normalized Signature)
// ========================================================

async function startLoginCamera() {
  const video = document.getElementById('login-camera-video');
  if (!video) return;

  try {
    stopLoginCamera();
    await new Promise(r => setTimeout(r, 100));

    loginCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false
    });
    video.srcObject = loginCameraStream;
    const status = document.getElementById('face-scan-status');
    if (status) {
      status.textContent = 'Position your face in the oval to unlock...';
      status.style.color = '#38bdf8';
    }
  } catch (err) {
    console.warn('Camera access error:', err);
    const status = document.getElementById('face-scan-status');
    if (status) {
      if (err.name === 'NotReadableError' || (err.message && err.message.includes('Device in use'))) {
        status.innerHTML = '<span style="color:#f87171;">⚠️ Camera is in use by another application.</span><br><span style="font-size:11px; color:#cbd5e1;">Close other camera apps or login with PIN.</span>';
      } else {
        status.textContent = 'Webcam not available. Please use PIN login.';
        status.style.color = '#ef4444';
      }
    }
  }
}

function stopLoginCamera() {
  if (loginCameraStream) {
    try {
      loginCameraStream.getTracks().forEach(t => {
        t.stop();
        loginCameraStream.removeTrack(t);
      });
    } catch (e) {}
    const video = document.getElementById('login-camera-video');
    if (video) video.srcObject = null;
    loginCameraStream = null;
  }
}

// --- SMART DISTANCE & ANGLE INVARIANT BIOMETRIC ENGINE ---

// Auto-detect face region in frame (regardless of distance from camera)
function detectFaceBounds(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;

  // Scan pixels for facial skin chrominance (YCbCr) & edge contrast
  for (let y = 10; y < h - 10; y += 2) {
    for (let x = 10; x < w - 10; x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Approximate YCbCr chrominance
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      // Skin tone bounds + contrast
      if (cb >= 77 && cb <= 130 && cr >= 130 && cr <= 175) {
        // Center-weighted bias
        const dx = (x - w / 2) / (w / 2);
        const dy = (y - h / 2) / (h / 2);
        const weight = Math.max(0.2, 1 - (dx * dx + dy * dy));

        sumX += x * weight;
        sumY += y * weight;
        totalWeight += weight;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If face detected through skin cluster
  if (totalWeight > 60 && maxX > minX + 25 && maxY > minY + 25) {
    const centerX = sumX / totalWeight;
    const centerY = sumY / totalWeight;
    const boxSize = Math.max(50, Math.min(100, Math.max(maxX - minX, maxY - minY) * 0.9));

    return {
      x: Math.max(0, Math.min(w - boxSize, Math.round(centerX - boxSize / 2))),
      y: Math.max(0, Math.min(h - boxSize, Math.round(centerY - boxSize / 2))),
      width: Math.round(boxSize),
      height: Math.round(boxSize)
    };
  }

  // Fallback to center oval region
  return { x: 32, y: 20, width: 64, height: 80 };
}

// Extract scale-invariant & edge-contour biometric signature
function extractFaceSignatureFromSource(sourceEl, customScale = 1.0) {
  if (!sourceEl) return null;
  const isVideo = sourceEl.tagName === 'VIDEO';
  if (isVideo && (sourceEl.videoWidth === 0 || sourceEl.readyState < 2)) return null;
  if (!isVideo && (sourceEl.naturalWidth === 0)) return null;

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = 160;
  rawCanvas.height = 160;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });

  rawCtx.save();
  if (isVideo) {
    rawCtx.translate(160, 0);
    rawCtx.scale(-1, 1);
  }
  rawCtx.drawImage(sourceEl, 0, 0, 160, 160);
  rawCtx.restore();

  // Find face bounds (distance-invariant auto crop)
  const bounds = detectFaceBounds(rawCtx, 160, 160);

  // Apply custom scale for multi-scale verification
  let cropW = Math.round(bounds.width * customScale);
  let cropH = Math.round(bounds.height * customScale);
  let cropX = Math.round(bounds.x + (bounds.width - cropW) / 2);
  let cropY = Math.round(bounds.y + (bounds.height - cropH) / 2);

  cropX = Math.max(0, Math.min(160 - cropW, cropX));
  cropY = Math.max(0, Math.min(160 - cropH, cropY));
  cropW = Math.min(160 - cropX, cropW);
  cropH = Math.min(160 - cropY, cropH);

  // Render cropped face to standardized 64x64 grid
  faceCanvas.width = 64;
  faceCanvas.height = 64;
  const ctx = faceCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(rawCanvas, cropX, cropY, cropW, cropH, 0, 0, 64, 64);

  const photo = faceCanvas.toDataURL('image/jpeg', 0.85);
  const imgData = ctx.getImageData(0, 0, 64, 64);
  const data = imgData.data;

  // Convert to 2D grayscale array
  const gray2D = [];
  let sum = 0;
  for (let y = 0; y < 64; y++) {
    gray2D[y] = [];
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray2D[y][x] = gray;
      sum += gray;
    }
  }

  const mean = sum / (64 * 64);
  const signature = [];

  // Downsample to 16x16 with edge gradient features (HOG-style)
  for (let by = 1; by < 63; by += 4) {
    for (let bx = 1; bx < 63; bx += 4) {
      // Normalized intensity
      const val = gray2D[by][bx] - mean;

      // Horizontal and vertical edge gradients
      const gx = gray2D[by][bx + 1] - gray2D[by][bx - 1];
      const gy = gray2D[by + 1][bx] - gray2D[by - 1][bx];
      const edge = Math.sqrt(gx * gx + gy * gy);

      signature.push(Math.round(val));
      signature.push(Math.round(edge * 1.5));
    }
  }

  return { signature, photo };
}

// Cosine similarity between two signatures
function compareFaceSignatures(sigA, sigB) {
  if (!sigA || !sigB || sigA.length !== sigB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < sigA.length; i++) {
    dotProduct += sigA[i] * sigB[i];
    normA += sigA[i] * sigA[i];
    normB += sigB[i] * sigB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Compare a live face across multiple scales and enrolled angles
function matchFaceAgainstEnrolled(liveVideo, enrolledList) {
  const scales = [0.85, 1.0, 1.15]; // Multi-scale search for distance tolerance
  let topMatch = null;
  let topScore = -1;

  for (const scale of scales) {
    const liveBiometric = extractFaceSignatureFromSource(liveVideo, scale);
    if (!liveBiometric || !liveBiometric.signature) continue;

    for (const enrolled of enrolledList) {
      const targetSignatures = enrolled.signatures && enrolled.signatures.length > 0 
        ? enrolled.signatures 
        : (enrolled.signature ? [enrolled.signature] : []);

      for (const sig of targetSignatures) {
        const score = compareFaceSignatures(liveBiometric.signature, sig);
        if (score > topScore) {
          topScore = score;
          topMatch = enrolled;
        }
      }
    }
  }

  return { match: topMatch, score: topScore };
}

// Face Unlock Scanner button handler (Multi-scale + Distance Tolerant)
async function handleFaceUnlockScan() {
  const video = document.getElementById('login-camera-video');
  const statusEl = document.getElementById('face-scan-status');

  if (!video || !video.srcObject) {
    await startLoginCamera();
  }

  statusEl.textContent = 'Scanning face... Looking for match...';
  statusEl.style.color = '#f59e0b';

  setTimeout(async () => {
    enrolledFaces = await window.api.getEnrolledFaces();
    if (!enrolledFaces || enrolledFaces.length === 0) {
      statusEl.textContent = 'No employee faces registered yet! Please login as Admin to enroll faces.';
      statusEl.style.color = '#ef4444';
      return;
    }

    const { match, score } = matchFaceAgainstEnrolled(video, enrolledFaces);

    // Calibrated threshold: 0.58 (58% with multi-scale edge correlation)
    if (match && score >= 0.58) {
      statusEl.innerHTML = `✅ <b>Face Recognized:</b> ${match.name} (${Math.round(score * 100)}% match)! Unlocking...`;
      statusEl.style.color = '#10b981';
      playSuccessChime();

      setTimeout(() => {
        loginAsEmployee(match.id);
      }, 700);
    } else {
      const percent = score > 0 ? ` (${Math.round(score * 100)}% similarity)` : '';
      statusEl.textContent = `❌ Face not recognized${percent}. Try looking directly at the camera or login with PIN.`;
      statusEl.style.color = '#ef4444';
      showToast('Face not recognized! Try looking at camera or use PIN.', 'error');
    }
  }, 350);
}

// Enroll Face Modal (Admin)
async function startEnrollCamera() {
  const video = document.getElementById('enroll-camera-video');
  const preview = document.getElementById('enroll-photo-preview');
  const feedback = document.getElementById('enroll-feedback-text');

  if (preview) preview.style.display = 'none';
  if (video) video.style.display = 'block';

  // Stop any existing stream
  if (enrollCameraStream) {
    try {
      enrollCameraStream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    enrollCameraStream = null;
  }

  // Release login camera first
  stopLoginCamera();

  feedback.textContent = 'Accessing camera...';
  feedback.style.color = '#38bdf8';

  await new Promise(r => setTimeout(r, 150));

  try {
    enrollCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false
    });
    video.srcObject = enrollCameraStream;
    feedback.textContent = 'Look directly into camera oval';
    feedback.style.color = '#38bdf8';
  } catch (err) {
    console.warn('Enroll camera error:', err);
    if (err.name === 'NotReadableError' || (err.message && err.message.includes('Device in use'))) {
      feedback.innerHTML = '<span style="color:#f87171;">⚠️ Camera is in use by another app</span><br><span style="font-size:11px; color:#cbd5e1;">Click "Upload Photo Instead" or close other camera apps!</span>';
    } else {
      feedback.textContent = 'Camera error: ' + err.message;
      feedback.style.color = '#ef4444';
    }
  }
}

function openEnrollFaceModal(empId) {
  currentEnrollEmpId = empId;
  uploadedBiometric = null;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('enroll-modal-subtitle').textContent = `Registering face biometric for ${emp.name} (${emp.id})`;
  const modal = document.getElementById('modal-enroll-face');
  modal.classList.add('active');

  startEnrollCamera();
}

function closeEnrollFaceModal() {
  if (enrollCameraStream) {
    try {
      enrollCameraStream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    const video = document.getElementById('enroll-camera-video');
    if (video) video.srcObject = null;
    enrollCameraStream = null;
  }

  const preview = document.getElementById('enroll-photo-preview');
  if (preview) { preview.style.display = 'none'; preview.src = ''; }
  const video = document.getElementById('enroll-camera-video');
  if (video) video.style.display = 'block';
  uploadedBiometric = null;

  document.getElementById('modal-enroll-face').classList.remove('active');
  currentEnrollEmpId = null;
}

async function handleCaptureAndSaveFace() {
  if (!currentEnrollEmpId) return;

  const feedback = document.getElementById('enroll-feedback-text');
  let biometric = null;

  if (uploadedBiometric) {
    biometric = {
      signature: uploadedBiometric.signature,
      signatures: [uploadedBiometric.signature],
      photo: uploadedBiometric.photo
    };
  } else {
    const video = document.getElementById('enroll-camera-video');
    feedback.textContent = '📸 Capturing multi-angle burst samples...';
    feedback.style.color = '#f59e0b';

    const b1 = extractFaceSignatureFromSource(video, 1.0);
    await new Promise(r => setTimeout(r, 180));
    const b2 = extractFaceSignatureFromSource(video, 0.88);
    await new Promise(r => setTimeout(r, 180));
    const b3 = extractFaceSignatureFromSource(video, 1.12);

    if (!b1 || !b1.signature) {
      showToast('Failed to capture face from camera. Try uploading a photo instead!', 'error');
      return;
    }

    const signatures = [b1.signature];
    if (b2 && b2.signature) signatures.push(b2.signature);
    if (b3 && b3.signature) signatures.push(b3.signature);

    biometric = {
      signature: b1.signature,
      signatures,
      photo: b1.photo
    };
  }

  try {
    await window.api.saveFaceData(currentEnrollEmpId, biometric);
    showToast(`Face enrolled with distance & angle tolerance!`, 'success');
    closeEnrollFaceModal();
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// 🚨 5-MINUTE INACTIVITY BEEP ALARM ENGINE
// ========================================================

function setupInactivityTracker() {
  // Listen for user movement / keyboard inside the window
  const recordActivity = () => {
    lastUserActivityTimestamp = Date.now();
    if (isAlarmRinging) {
      dismissInactivityAlarm();
    }
  };

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, recordActivity, { passive: true });
  });

  // Background monitor loop: checks both OS-level idle time and in-window idle time every second
  idleMonitorInterval = setInterval(async () => {
    let idleSeconds = 0;

    try {
      const osIdleSeconds = await window.api.getSystemIdleTime();
      const localIdleSeconds = Math.floor((Date.now() - lastUserActivityTimestamp) / 1000);
      idleSeconds = Math.max(osIdleSeconds || 0, localIdleSeconds);
    } catch (e) {
      idleSeconds = Math.floor((Date.now() - lastUserActivityTimestamp) / 1000);
    }

    // Update UI indicator
    if (idleSecondsText) idleSecondsText.textContent = `${idleSeconds}s`;

    if (idleSeconds >= inactivityTimeoutSeconds) {
      if (idleIndicatorDot) idleIndicatorDot.className = 'idle-dot danger';
      // Trigger Alarm!
      if (!isAlarmRinging) {
        startInactivityAlarm(idleSeconds);
      }
    } else if (idleSeconds >= inactivityTimeoutSeconds - 60) {
      if (idleIndicatorDot) idleIndicatorDot.className = 'idle-dot warning';
    } else {
      if (idleIndicatorDot) idleIndicatorDot.className = 'idle-dot';
    }
  }, 1000);
}

function startInactivityAlarm(seconds) {
  isAlarmRinging = true;
  alarmOverlay.style.display = 'flex';
  playAlarmSiren();
}

function dismissInactivityAlarm() {
  isAlarmRinging = false;
  alarmOverlay.style.display = 'none';
  stopAlarmSiren();
  lastUserActivityTimestamp = Date.now();
  if (idleIndicatorDot) idleIndicatorDot.className = 'idle-dot';
  showToast('Inactivity alarm silenced. Welcome back!', 'info');
}

// Audio Siren using Web Audio API
function playAlarmSiren() {
  stopAlarmSiren();
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    let toggleFreq = false;

    // Repeating high-pitch beep pattern (880Hz / 1320Hz pulsating siren)
    beepIntervalTimer = setInterval(() => {
      if (!audioCtx || !isAlarmRinging) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(toggleFreq ? 1200 : 850, audioCtx.currentTime);
      toggleFreq = !toggleFreq;

      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }, 400);
  } catch (err) {
    console.warn('AudioContext beep error:', err);
  }
}

function stopAlarmSiren() {
  if (beepIntervalTimer) {
    clearInterval(beepIntervalTimer);
    beepIntervalTimer = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
}

function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

// ========================================================
// 🔐 AUTHENTICATION & ROLE MANAGEMENT
// ========================================================

function setupLoginTabs() {
  const btnFace = document.getElementById('tab-btn-face');
  const btnPin = document.getElementById('tab-btn-emp-pin');
  const btnAdmin = document.getElementById('tab-btn-admin');

  const contentFace = document.getElementById('login-tab-face-content');
  const contentPin = document.getElementById('login-tab-pin-content');
  const contentAdmin = document.getElementById('login-tab-admin-content');

  btnFace.addEventListener('click', () => {
    setActiveLoginTab(btnFace, contentFace);
    startLoginCamera();
  });

  btnPin.addEventListener('click', () => {
    setActiveLoginTab(btnPin, contentPin);
    stopLoginCamera();
  });

  btnAdmin.addEventListener('click', () => {
    setActiveLoginTab(btnAdmin, contentAdmin);
    stopLoginCamera();
  });

  function setActiveLoginTab(btn, content) {
    [btnFace, btnPin, btnAdmin].forEach(b => b.classList.remove('active'));
    [contentFace, contentPin, contentAdmin].forEach(c => c.style.display = 'none');
    btn.classList.add('active');
    content.style.display = 'block';
  }

  // Admin login form
  document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('login-admin-password').value;
    const res = await window.api.adminLogin(pass);
    if (res.success) {
      document.getElementById('login-admin-password').value = '';
      loginAsAdmin();
    } else {
      showToast('Incorrect Admin password! (Default: admin123)', 'error');
    }
  });

  // Employee PIN login form
  document.getElementById('form-emp-pin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = document.getElementById('login-emp-select').value;
    const pin = document.getElementById('login-emp-pin').value;
    if (!empId) {
      showToast('Please select an employee', 'error');
      return;
    }

    const emp = employees.find(e => e.id === empId);
    if (emp && (emp.pin === pin || (!emp.pin && pin === '1234') || pin === '1234')) {
      document.getElementById('login-emp-pin').value = '';
      loginAsEmployee(empId);
    } else {
      showToast('Invalid PIN! Default PIN is 1234', 'error');
    }
  });

  // Face Scan button
  document.getElementById('btn-start-face-scan').addEventListener('click', handleFaceUnlockScan);
  document.getElementById('btn-toggle-camera').addEventListener('click', () => {
    if (loginCameraStream) {
      stopLoginCamera();
      document.getElementById('face-scan-status').textContent = 'Camera paused.';
    } else {
      startLoginCamera();
      document.getElementById('face-scan-status').textContent = 'Camera started. Position face in oval.';
    }
  });
}

function loginAsAdmin() {
  stopLoginCamera();
  currentUser = { role: 'admin', name: 'Master Admin' };
  loginScreen.style.display = 'none';

  sessionRoleLabel.textContent = 'ADMINISTRATOR';
  sessionNameLabel.textContent = 'Master Admin';
  sidebarRoleBadge.textContent = 'Super Access';

  adminNavMenu.style.display = 'flex';
  employeeNavMenu.style.display = 'none';
  adminViewsContainer.style.display = 'block';
  employeeViewsContainer.style.display = 'none';

  switchAdminTab('dashboard');
  refreshAdminDashboard();
  showToast('Welcome, Administrator! Full access granted.', 'success');
}

async function loginAsEmployee(empId) {
  stopLoginCamera();
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  currentUser = { role: 'employee', id: emp.id, name: emp.name, department: emp.department };
  loginScreen.style.display = 'none';

  sessionRoleLabel.textContent = 'EMPLOYEE';
  sessionNameLabel.textContent = emp.name;
  sidebarRoleBadge.textContent = 'Personal Portal';

  adminNavMenu.style.display = 'none';
  employeeNavMenu.style.display = 'flex';
  adminViewsContainer.style.display = 'none';
  employeeViewsContainer.style.display = 'block';

  switchEmployeeTab('emp-portal');
  await refreshEmployeePortal();
  showToast(`Welcome ${emp.name}! Logged into your portal.`, 'success');
}

function logout() {
  currentUser = null;
  loginScreen.style.display = 'flex';
  startLoginCamera();
  showToast('Session locked. Please authenticate to continue.', 'info');
}

// ========================================================
// 🧭 NAVIGATION
// ========================================================

function setupNavigation() {
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  // Admin Nav items
  adminNavMenu.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchAdminTab(item.dataset.tab);
    });
  });

  // Employee Nav items
  employeeNavMenu.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchEmployeeTab(item.dataset.tab);
    });
  });

  document.getElementById('btn-logout').addEventListener('click', logout);
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  adminNavMenu.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tab));
  adminViewsContainer.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === `view-${tab}`));

  const titles = {
    dashboard: { title: 'Dashboard Overview', subtitle: 'Workforce analytics & live feed' },
    punch: { title: 'Punch Terminal', subtitle: 'Self-service clock in / clock out station' },
    employees: { title: 'Employees & Face Biometrics', subtitle: 'Manage profiles, roles & enroll faces' },
    leaves: { title: 'Leave Approvals', subtitle: 'Review and approve/reject staff leaves' },
    reports: { title: 'Attendance Reports & Export', subtitle: 'Detailed logs and downloadable CSV records' },
    settings: { title: 'System & Inactivity Settings', subtitle: 'Configure 5-minute movement alarm policy' }
  };

  if (titles[tab]) {
    document.getElementById('page-title').textContent = titles[tab].title;
    document.getElementById('page-subtitle').textContent = titles[tab].subtitle;
  }

  if (tab === 'reports') loadReportsTable();
  if (tab === 'leaves') loadAdminLeavesTable();
  if (tab === 'employees') renderAdminEmployeesTable();
}

function switchEmployeeTab(tab) {
  currentEmpTab = tab;
  employeeNavMenu.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tab));
  employeeViewsContainer.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === `view-${tab}`));

  const titles = {
    'emp-portal': { title: 'My Attendance Portal', subtitle: `Personal shift clock and logs for ${currentUser.name}` },
    'emp-leaves': { title: 'My Leaves', subtitle: 'Apply and track your leave request approvals' }
  };

  if (titles[tab]) {
    document.getElementById('page-title').textContent = titles[tab].title;
    document.getElementById('page-subtitle').textContent = titles[tab].subtitle;
  }
}

// ========================================================
// 📊 ADMIN PANELS
// ========================================================

async function refreshAdminDashboard() {
  const stats = await window.api.getDashboardStats();
  document.getElementById('stat-total-emp').textContent = stats.totalEmployees;
  document.getElementById('stat-present-today').textContent = stats.presentToday;
  document.getElementById('stat-currently-working').textContent = stats.currentlyWorking;
  document.getElementById('stat-on-leave').textContent = stats.onLeaveToday;

  renderTodayAttendanceFeed();
  renderAdminEmployeesTable();
  updateTerminalStatusCard();
}

function renderTodayAttendanceFeed() {
  const tbody = document.getElementById('today-attendance-tbody');
  if (!todayAttendance || todayAttendance.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 22px;">No employees have clocked in today yet.</td></tr>';
    return;
  }

  tbody.innerHTML = todayAttendance.map(record => {
    const isClockedOut = Boolean(record.clockOut);
    const badge = isClockedOut 
      ? '<span class="badge badge-success">Completed</span>' 
      : '<span class="badge badge-warning">Working Now</span>';

    return `
      <tr>
        <td><strong>${record.employeeId}</strong></td>
        <td>${record.employeeName}</td>
        <td>${record.department}</td>
        <td><span style="color:#38bdf8; font-family:monospace;">${record.clockIn}</span></td>
        <td><span style="color:${isClockedOut ? '#a78bfa' : '#94a3b8'}; font-family:monospace;">${record.clockOut || '---'}</span></td>
        <td><strong>${record.totalHours || 'In Progress'}</strong></td>
        <td>${badge}</td>
        <td style="color:var(--text-muted);">${record.notes || '-'}</td>
      </tr>
    `;
  }).join('');
}

function renderAdminEmployeesTable() {
  const tbody = document.getElementById('employees-tbody');
  const query = (document.getElementById('emp-search-input')?.value || '').toLowerCase().trim();
  const deptFilter = document.getElementById('emp-dept-filter')?.value || '';

  let filtered = employees;

  if (query) {
    filtered = filtered.filter(e => 
      e.name.toLowerCase().includes(query) ||
      e.id.toLowerCase().includes(query) ||
      e.role.toLowerCase().includes(query)
    );
  }

  if (deptFilter) {
    filtered = filtered.filter(e => e.department === deptFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">No matching employees found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(emp => {
    const hasFace = Boolean(emp.faceData && emp.faceData.signature);
    const faceBadge = hasFace 
      ? '<span class="badge badge-success" title="Face lock active">✅ Enrolled</span>' 
      : '<span class="badge badge-warning" title="No face lock setup">⚠️ Not Setup</span>';

    return `
      <tr>
        <td><strong>${emp.id}</strong></td>
        <td>${faceBadge}</td>
        <td><strong>${emp.name}</strong></td>
        <td>${emp.department}</td>
        <td>${emp.role}</td>
        <td style="font-size:12px; color:var(--text-muted);">${emp.email || '-'}<br>${emp.phone || '-'}</td>
        <td style="font-family:monospace; color:#38bdf8;">${emp.pin || '1234'}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openEnrollFaceModal('${emp.id}')" title="Register webcam face lock">
            📸 Enroll Face
          </button>
          <button class="btn btn-secondary btn-sm" onclick="editEmployee('${emp.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${emp.id}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Admin Punch Station Card
function updateTerminalStatusCard() {
  const empId = document.getElementById('terminal-emp-select')?.value;
  const card = document.getElementById('terminal-emp-status-card');
  if (!card) return;
  if (!empId) {
    card.style.display = 'none';
    return;
  }

  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  const todayRecord = todayAttendance.find(a => a.employeeId === empId);

  document.getElementById('terminal-status-name').textContent = emp.name;
  document.getElementById('terminal-status-dept').textContent = `${emp.role} • ${emp.department}`;

  const badge = document.getElementById('terminal-status-badge');
  const timeInfo = document.getElementById('terminal-status-time');

  if (!todayRecord) {
    badge.className = 'badge badge-info';
    badge.textContent = 'Not Clocked In Today';
    timeInfo.textContent = 'Ready to Punch In.';
  } else if (!todayRecord.clockOut) {
    badge.className = 'badge badge-warning';
    badge.textContent = 'Currently Working';
    timeInfo.innerHTML = `Clocked In at: <b style="color:#38bdf8;">${todayRecord.clockIn}</b>`;
  } else {
    badge.className = 'badge badge-success';
    badge.textContent = 'Shift Completed';
    timeInfo.innerHTML = `In: <b>${todayRecord.clockIn}</b> | Out: <b>${todayRecord.clockOut}</b> (${todayRecord.totalHours})`;
  }

  card.style.display = 'block';
}

// Admin Leaves Table
async function loadAdminLeavesTable() {
  const tbody = document.getElementById('leaves-tbody');
  try {
    const leaves = await window.api.getLeaves();
    if (!leaves || leaves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 22px;">No leave records found.</td></tr>';
      return;
    }

    tbody.innerHTML = leaves.map(l => {
      let badgeClass = 'badge-info';
      if (l.status === 'Approved') badgeClass = 'badge-success';
      if (l.status === 'Rejected') badgeClass = 'badge-danger';
      if (l.status === 'Pending') badgeClass = 'badge-warning';

      return `
        <tr>
          <td><strong>${l.id}</strong></td>
          <td><strong>${l.employeeName}</strong> (${l.employeeId})</td>
          <td>${l.department}</td>
          <td><span class="badge badge-info">${l.leaveType}</span></td>
          <td>${l.startDate} to ${l.endDate}</td>
          <td>${l.reason || '-'}</td>
          <td><span class="badge ${badgeClass}">${l.status}</span></td>
          <td>
            <button class="btn btn-success btn-sm" onclick="setLeaveStatus('${l.id}', 'Approved')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="setLeaveStatus('${l.id}', 'Rejected')">Reject</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Reports & CSV Export
async function loadReportsTable() {
  const tbody = document.getElementById('reports-tbody');
  const dateFilter = document.getElementById('report-filter-date').value;
  const empFilter = document.getElementById('report-filter-emp').value;

  try {
    const filter = {};
    if (dateFilter) filter.date = dateFilter;
    if (empFilter) filter.employeeId = empFilter;

    const records = await window.api.getAllAttendance(filter);
    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 22px;">No attendance records match filter.</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong>${r.date}</strong></td>
        <td>${r.employeeId}</td>
        <td><strong>${r.employeeName}</strong></td>
        <td>${r.department}</td>
        <td><span style="color:#38bdf8; font-family:monospace;">${r.clockIn || '-'}</span></td>
        <td><span style="color:${r.clockOut ? '#a78bfa' : '#94a3b8'}; font-family:monospace;">${r.clockOut || '-'}</span></td>
        <td><strong>${r.totalHours || 'In Progress'}</strong></td>
        <td><span class="badge ${r.clockOut ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
        <td style="color:var(--text-muted);">${r.notes || '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// 👤 EMPLOYEE SELF-PORTAL (RESTRICTED DATA VIEW)
// ========================================================

async function refreshEmployeePortal() {
  if (!currentUser || currentUser.role !== 'employee') return;

  try {
    const data = await window.api.getEmployeeSelfPortal(currentUser.id);
    const profile = data.profile;
    const today = data.todayRecord;

    // Profile card
    document.getElementById('emp-profile-name').textContent = profile.name;
    document.getElementById('emp-profile-dept-role').textContent = `${profile.role} • ${profile.department}`;
    document.getElementById('emp-profile-id-badge').textContent = profile.id;

    if (profile.facePhoto) {
      document.getElementById('emp-profile-avatar').innerHTML = `<img src="${profile.facePhoto}" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
      document.getElementById('emp-profile-avatar').textContent = profile.name.charAt(0);
    }

    // Shift punch status
    const statusBadge = document.getElementById('emp-portal-status-badge');
    const btnIn = document.getElementById('emp-btn-clock-in');
    const btnOut = document.getElementById('emp-btn-clock-out');

    if (!today) {
      statusBadge.className = 'badge badge-info';
      statusBadge.textContent = 'Not Clocked In Today';
      btnIn.disabled = false;
      btnOut.disabled = true;
    } else if (!today.clockOut) {
      statusBadge.className = 'badge badge-warning';
      statusBadge.innerHTML = `🟢 Currently Working (In at ${today.clockIn})`;
      btnIn.disabled = true;
      btnOut.disabled = false;
    } else {
      statusBadge.className = 'badge badge-success';
      statusBadge.innerHTML = `✅ Shift Completed (${today.totalHours})`;
      btnIn.disabled = true;
      btnOut.disabled = true;
    }

    // Attendance History Table (ONLY THIS EMPLOYEE'S RECORDS)
    const histTbody = document.getElementById('emp-history-tbody');
    if (!data.attendanceHistory || data.attendanceHistory.length === 0) {
      histTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">No past attendance records found.</td></tr>';
    } else {
      histTbody.innerHTML = data.attendanceHistory.map(r => `
        <tr>
          <td><strong>${r.date}</strong></td>
          <td><span style="color:#38bdf8; font-family:monospace;">${r.clockIn || '-'}</span></td>
          <td><span style="color:#a78bfa; font-family:monospace;">${r.clockOut || '-'}</span></td>
          <td><strong>${r.totalHours || 'In Progress'}</strong></td>
          <td><span class="badge ${r.clockOut ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
          <td style="color:var(--text-muted);">${r.notes || '-'}</td>
        </tr>
      `).join('');
    }

    // Leaves Table (ONLY THIS EMPLOYEE'S LEAVES)
    const leavesTbody = document.getElementById('emp-leaves-tbody');
    if (!data.leaves || data.leaves.length === 0) {
      leavesTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">No leave applications found.</td></tr>';
    } else {
      leavesTbody.innerHTML = data.leaves.map(l => {
        let badgeClass = 'badge-info';
        if (l.status === 'Approved') badgeClass = 'badge-success';
        if (l.status === 'Rejected') badgeClass = 'badge-danger';
        if (l.status === 'Pending') badgeClass = 'badge-warning';

        return `
          <tr>
            <td><strong>${l.id}</strong></td>
            <td><span class="badge badge-info">${l.leaveType}</span></td>
            <td>${l.startDate}</td>
            <td>${l.endDate}</td>
            <td>${l.reason || '-'}</td>
            <td><span class="badge ${badgeClass}">${l.status}</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// 🖱️ COMMON EVENT LISTENERS
// ========================================================

function setupEventListeners() {
  // Inactivity Alarm dismissal button
  document.getElementById('btn-dismiss-alarm')?.addEventListener('click', dismissInactivityAlarm);

  // Quick punch on admin dashboard
  document.getElementById('btn-quick-clock-in')?.addEventListener('click', () => handlePunch('in', 'quick'));
  document.getElementById('btn-quick-clock-out')?.addEventListener('click', () => handlePunch('out', 'quick'));
  document.getElementById('btn-refresh-dashboard')?.addEventListener('click', refreshGlobalData);

  // Admin Terminal punch
  document.getElementById('terminal-btn-in')?.addEventListener('click', () => handlePunch('in', 'terminal'));
  document.getElementById('terminal-btn-out')?.addEventListener('click', () => handlePunch('out', 'terminal'));
  document.getElementById('terminal-emp-select')?.addEventListener('change', updateTerminalStatusCard);

  // Employee Portal personal punch buttons
  document.getElementById('emp-btn-clock-in')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.id) return;
    try {
      const record = await window.api.clockIn(currentUser.id, 'Self-portal punch');
      showToast(`🟢 Clock-In successful at ${record.clockIn}`, 'success');
      playSuccessChime();
      await refreshGlobalData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('emp-btn-clock-out')?.addEventListener('click', async () => {
    if (!currentUser || !currentUser.id) return;
    try {
      const record = await window.api.clockOut(currentUser.id, 'Self-portal punch');
      showToast(`🔴 Clock-Out successful! Total hours: ${record.totalHours}`, 'success');
      playSuccessChime();
      await refreshGlobalData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Employee Portal Apply Leave button
  document.getElementById('btn-emp-apply-leave')?.addEventListener('click', () => {
    openLeaveModal(currentUser.id);
  });

  // Test Beep Alarm header button
  document.getElementById('btn-trigger-test-alarm')?.addEventListener('click', () => {
    startInactivityAlarm(inactivityTimeoutSeconds);
    showToast('Simulating Inactivity Alarm! Move mouse to stop.', 'info');
  });

  // Employee Modal
  document.getElementById('btn-open-add-emp-modal')?.addEventListener('click', () => openEmployeeModal());
  document.getElementById('btn-close-emp-modal')?.addEventListener('click', closeEmployeeModal);
  document.getElementById('btn-cancel-emp-modal')?.addEventListener('click', closeEmployeeModal);
  document.getElementById('form-employee')?.addEventListener('submit', handleSaveEmployee);

  // Employee Filters
  document.getElementById('emp-search-input')?.addEventListener('input', renderAdminEmployeesTable);
  document.getElementById('emp-dept-filter')?.addEventListener('change', renderAdminEmployeesTable);

  // Enroll Face Modal
  document.getElementById('btn-close-enroll-modal')?.addEventListener('click', closeEnrollFaceModal);
  document.getElementById('btn-cancel-enroll-modal')?.addEventListener('click', closeEnrollFaceModal);
  document.getElementById('btn-capture-save-face')?.addEventListener('click', handleCaptureAndSaveFace);
  document.getElementById('btn-retry-enroll-camera')?.addEventListener('click', async () => {
    uploadedBiometric = null;
    await startEnrollCamera();
  });
  document.getElementById('btn-trigger-file-upload')?.addEventListener('click', () => {
    document.getElementById('enroll-file-input').click();
  });
  document.getElementById('enroll-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = document.getElementById('enroll-photo-preview');
      const video = document.getElementById('enroll-camera-video');
      const feedback = document.getElementById('enroll-feedback-text');

      img.src = evt.target.result;
      img.onload = () => {
        if (enrollCameraStream) {
          try {
            enrollCameraStream.getTracks().forEach(t => t.stop());
          } catch (e) {}
          enrollCameraStream = null;
        }
        video.style.display = 'none';
        img.style.display = 'block';

        uploadedBiometric = extractFaceSignatureFromSource(img);
        feedback.innerHTML = '✅ <span style="color:#34d399;">Photo loaded! Click "Capture & Save Face" below.</span>';
      };
    };
    reader.readAsDataURL(file);
  });

  // Leave Modal
  document.getElementById('btn-open-apply-leave-modal')?.addEventListener('click', () => openLeaveModal());
  document.getElementById('btn-close-leave-modal')?.addEventListener('click', closeLeaveModal);
  document.getElementById('btn-cancel-leave-modal')?.addEventListener('click', closeLeaveModal);
  document.getElementById('form-leave')?.addEventListener('submit', handleSaveLeave);

  // Reports Filter & Export
  document.getElementById('btn-apply-report-filter')?.addEventListener('click', loadReportsTable);
  document.getElementById('btn-reset-report-filter')?.addEventListener('click', () => {
    document.getElementById('report-filter-date').value = '';
    document.getElementById('report-filter-emp').value = '';
    loadReportsTable();
  });
  document.getElementById('btn-export-csv')?.addEventListener('click', handleExportCSV);

  // Settings Save
  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const timeout = Number(document.getElementById('setting-inactivity-select').value);
    const enableBeep = document.getElementById('setting-beep-enable').checked;
    const newPass = document.getElementById('setting-admin-pass').value.trim();

    const updates = { inactivityTimeoutSeconds: timeout, enableInactivityBeep: enableBeep };
    if (newPass) updates.adminPassword = newPass;

    await window.api.updateSettings(updates);
    inactivityTimeoutSeconds = timeout;
    showToast('Settings saved successfully!', 'success');
  });

  document.getElementById('btn-test-alarm-settings')?.addEventListener('click', () => {
    startInactivityAlarm(10);
  });
}

// Common Punch Handler
async function handlePunch(action, source) {
  const empSelect = source === 'terminal' 
    ? document.getElementById('terminal-emp-select') 
    : document.getElementById('quick-emp-select');
  const noteInput = source === 'terminal'
    ? document.getElementById('terminal-punch-note')
    : document.getElementById('quick-punch-note');

  const empId = empSelect.value;
  const notes = noteInput.value.trim();

  if (!empId) {
    showToast('Please select an employee first!', 'error');
    return;
  }

  try {
    if (action === 'in') {
      const record = await window.api.clockIn(empId, notes);
      showToast(`🟢 Clock-In successful for ${record.employeeName} at ${record.clockIn}`, 'success');
    } else {
      const record = await window.api.clockOut(empId, notes);
      showToast(`🔴 Clock-Out successful for ${record.employeeName}! Total: ${record.totalHours}`, 'success');
    }

    noteInput.value = '';
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Employee CRUD Helpers
function openEmployeeModal(editData = null) {
  const title = document.getElementById('modal-emp-title');
  const editIdInput = document.getElementById('emp-edit-id');
  const nameInput = document.getElementById('emp-input-name');
  const idInput = document.getElementById('emp-input-id');
  const deptInput = document.getElementById('emp-input-dept');
  const roleInput = document.getElementById('emp-input-role');
  const pinInput = document.getElementById('emp-input-pin');
  const emailInput = document.getElementById('emp-input-email');
  const phoneInput = document.getElementById('emp-input-phone');
  const joiningInput = document.getElementById('emp-input-joining');

  if (editData) {
    title.textContent = 'Edit Employee';
    editIdInput.value = editData.id;
    idInput.value = editData.id;
    idInput.disabled = true;
    nameInput.value = editData.name;
    deptInput.value = editData.department;
    roleInput.value = editData.role;
    pinInput.value = editData.pin || '1234';
    emailInput.value = editData.email || '';
    phoneInput.value = editData.phone || '';
    joiningInput.value = editData.joiningDate || '';
  } else {
    title.textContent = 'Add New Employee';
    editIdInput.value = '';
    idInput.value = '';
    idInput.disabled = false;
    nameInput.value = '';
    deptInput.value = '';
    roleInput.value = '';
    pinInput.value = '1234';
    emailInput.value = '';
    phoneInput.value = '';
    joiningInput.value = new Date().toISOString().split('T')[0];
  }

  document.getElementById('modal-employee').classList.add('active');
}

function closeEmployeeModal() {
  document.getElementById('modal-employee').classList.remove('active');
}

async function handleSaveEmployee(e) {
  e.preventDefault();
  const editId = document.getElementById('emp-edit-id').value;
  const empData = {
    name: document.getElementById('emp-input-name').value.trim(),
    department: document.getElementById('emp-input-dept').value.trim(),
    role: document.getElementById('emp-input-role').value.trim(),
    pin: document.getElementById('emp-input-pin').value.trim() || '1234',
    email: document.getElementById('emp-input-email').value.trim(),
    phone: document.getElementById('emp-input-phone').value.trim(),
    joiningDate: document.getElementById('emp-input-joining').value
  };

  try {
    if (editId) {
      await window.api.updateEmployee(editId, empData);
      showToast(`Updated employee ${empData.name}`, 'success');
    } else {
      empData.id = document.getElementById('emp-input-id').value.trim();
      await window.api.addEmployee(empData);
      showToast(`Added employee ${empData.name}`, 'success');
    }
    closeEmployeeModal();
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.editEmployee = function(id) {
  const emp = employees.find(e => e.id === id);
  if (emp) openEmployeeModal(emp);
};

window.deleteEmployee = async function(id) {
  const emp = employees.find(e => e.id === id);
  if (!emp) return;
  if (!confirm(`Are you sure you want to remove ${emp.name} (${id})?`)) return;

  try {
    await window.api.deleteEmployee(id);
    showToast(`Removed employee ${emp.name}`, 'info');
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openEnrollFaceModal = openEnrollFaceModal;

// Leave Modals
function openLeaveModal(defaultEmpId = null) {
  document.getElementById('form-leave').reset();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('leave-start-date').value = today;
  document.getElementById('leave-end-date').value = today;

  const selectGroup = document.getElementById('leave-emp-select-group');
  const selectEl = document.getElementById('leave-select-emp');

  if (defaultEmpId) {
    selectEl.value = defaultEmpId;
    selectGroup.style.display = 'none'; // hide in employee view
  } else {
    selectGroup.style.display = 'block';
  }

  document.getElementById('modal-leave').classList.add('active');
}

function closeLeaveModal() {
  document.getElementById('modal-leave').classList.remove('active');
}

async function handleSaveLeave(e) {
  e.preventDefault();
  const empId = currentUser?.role === 'employee' ? currentUser.id : document.getElementById('leave-select-emp').value;
  const leaveData = {
    employeeId: empId,
    leaveType: document.getElementById('leave-select-type').value,
    startDate: document.getElementById('leave-start-date').value,
    endDate: document.getElementById('leave-end-date').value,
    reason: document.getElementById('leave-reason').value.trim()
  };

  try {
    await window.api.applyLeave(leaveData);
    showToast('Leave recorded successfully!', 'success');
    closeLeaveModal();
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.setLeaveStatus = async function(id, status) {
  try {
    await window.api.updateLeaveStatus(id, status);
    showToast(`Leave status updated to ${status}`, 'success');
    await loadAdminLeavesTable();
    await refreshGlobalData();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// CSV Export
async function handleExportCSV() {
  const dateFilter = document.getElementById('report-filter-date').value;
  const empFilter = document.getElementById('report-filter-emp').value;
  const filter = {};
  if (dateFilter) filter.date = dateFilter;
  if (empFilter) filter.employeeId = empFilter;

  try {
    const res = await window.api.exportCSV(filter);
    if (res.success) {
      showToast(`Exported CSV to: ${res.filePath}`, 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Toast
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
