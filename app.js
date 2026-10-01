// ===========================
// STATE
// ===========================
let state = {
  currentTeam: null,
  volunteerName: '',
  volunteerNameEn: '',
  currentStep: 1,
  selectedAttitude: '',
  records: [],
  teams: [],
  adminPassword: 'admin123',
  sheetsUrl: '',
  isAdmin: false,
};

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  loadFromStorage();

  // 1) Check URL for ?sid= (shared config link from admin)
  const urlParams = new URLSearchParams(window.location.search);
  const sid = urlParams.get('sid');
  if (sid) {
    try {
      const cfg = JSON.parse(atob(sid));
      if (cfg.sheetsUrl) {
        state.sheetsUrl = cfg.sheetsUrl;
        saveToStorage();
      }
      // Clean URL without reloading
      history.replaceState(null, '', window.location.pathname);
    } catch(e) { console.warn('Invalid sid param', e); }
  }

  // 2) If sheetsUrl is set, fetch teams from Sheets (overrides localStorage)
  if (state.sheetsUrl) {
    const sheetsTeams = await fetchTeamsFromSheets();
    if (sheetsTeams && sheetsTeams.length > 0) {
      state.teams = sheetsTeams;
      saveToStorage();
    }
  }

  renderTeamList();
  setupAdminFilters();

  // Set default month to current
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const monthInput = document.getElementById('f-month');
  if (monthInput) monthInput.value = `${yyyy}-${mm}`;
});

// ===========================
// LOCAL STORAGE
// ===========================
function loadFromStorage() {
  const saved = localStorage.getItem('careSystem');
  if (saved) {
    const data = JSON.parse(saved);
    state.records = data.records || [];
    state.teams = data.teams || getDefaultTeams();
    state.adminPassword = data.adminPassword || 'admin123';
    state.sheetsUrl = data.sheetsUrl || '';
  } else {
    state.teams = getDefaultTeams();
    saveToStorage();
  }
}

function saveToStorage() {
  localStorage.setItem('careSystem', JSON.stringify({
    records: state.records,
    teams: state.teams,
    adminPassword: state.adminPassword,
    sheetsUrl: state.sheetsUrl,
  }));
}

function getDefaultTeams() {
  return [
    { id: 'angel-tree', name: '天使樹', emoji: '🎄', color: '#7c5cfc', createdAt: new Date().toISOString() },
    { id: 'hope', name: '希望之光', emoji: '🌟', color: '#00d4aa', createdAt: new Date().toISOString() },
    { id: 'grace', name: '恩典事工', emoji: '🕊️', color: '#ff8c42', createdAt: new Date().toISOString() },
  ];
}

// ===========================
// SCREEN MANAGEMENT
// ===========================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) screen.classList.add('active');
}

// ===========================
// TEAM LIST (LOGIN)
// ===========================
function renderTeamList() {
  const container = document.getElementById('team-list');
  if (!container) return;
  container.innerHTML = state.teams.map(team => `
    <button class="team-btn ${state.currentTeam?.id === team.id ? 'selected' : ''}"
      id="team-btn-${team.id}"
      onclick="selectTeam('${team.id}')">
      <span class="team-emoji">${team.emoji}</span>
      <span>${team.name}</span>
    </button>
  `).join('');
}

function selectTeam(id) {
  state.currentTeam = state.teams.find(t => t.id === id);
  document.querySelectorAll('.team-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById(`team-btn-${id}`);
  if (btn) btn.classList.add('selected');
}

// ===========================
// VOLUNTEER ENTRY
// ===========================
function enterAsVolunteer() {
  const name = document.getElementById('login-name').value.trim();
  const nameEn = document.getElementById('login-name-en').value.trim();

  if (!state.currentTeam) return showToast('請先選擇您的事工團隊', 'error');
  if (!name) return showToast('請輸入您的中文姓名', 'error');

  state.volunteerName = name;
  state.volunteerNameEn = nameEn;

  // Update form UI
  document.getElementById('form-team-label').textContent = state.currentTeam.emoji + ' ' + state.currentTeam.name;
  document.getElementById('volunteer-badge').textContent = name;

  // Reset form to step 1
  goToStep(1);
  showScreen('screen-form');
}

// ===========================
// FORM STEPS
// ===========================
function goToStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  const step = document.getElementById(`step-${n}`);
  if (step) step.classList.add('active');

  // Update step dots
  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (s === n) dot.classList.add('active');
    if (s < n) dot.classList.add('done');
  });

  // Update step lines
  document.querySelectorAll('.step-line').forEach((line, idx) => {
    line.classList.toggle('done', idx < n - 1);
  });
}

function nextStep(current) {
  if (current === 1) {
    if (!document.getElementById('f-month').value) return showToast('請填寫提交月份', 'error');
    if (!document.getElementById('f-family-id').value.trim()) return showToast('請填寫個案家庭標號', 'error');
  }
  if (current < 3) goToStep(current + 1);
}

function prevStep(current) {
  if (current > 1) goToStep(current - 1);
}

function selectScale(el) {
  document.querySelectorAll('.scale-item').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedAttitude = el.dataset.value;
}

// ===========================
// FORM SUBMIT
// ===========================
async function submitForm() {
  const visited = document.querySelector('input[name="visited"]:checked');
  if (!visited) return showToast('請選擇本月是否有關懷個案家庭', 'error');

  // Collect data
  const familyStatus = Array.from(document.querySelectorAll('#family-status-checks input:checked')).map(i => i.value);
  const childStatus = Array.from(document.querySelectorAll('#child-status-checks input:checked')).map(i => i.value);
  const interaction = document.querySelector('input[name="interaction"]:checked')?.value || '';
  const needsHelp = document.querySelector('input[name="needs-help"]:checked')?.value || '';

  const record = {
    id: Date.now().toString(),
    submittedAt: new Date().toISOString(),
    month: document.getElementById('f-month').value,
    volunteerName: state.volunteerName,
    volunteerNameEn: state.volunteerNameEn,
    teamId: state.currentTeam.id,
    teamName: state.currentTeam.name,
    familyId: document.getElementById('f-family-id').value.trim(),
    group: document.getElementById('f-group').value.trim(),
    familyStatus,
    childStatus,
    visited: visited.value,
    attitude: state.selectedAttitude,
    interaction,
    needsHelp,
    notes: document.getElementById('f-notes').value.trim(),
  };

  state.records.push(record);
  saveToStorage();

  // Try to send to Google Sheets
  if (state.sheetsUrl) {
    sendToSheets(record);
  }

  // Reset form fields
  resetForm();
  showScreen('screen-success');
}

function resetForm() {
  document.getElementById('f-family-id').value = '';
  document.getElementById('f-group').value = '';
  document.getElementById('f-notes').value = '';
  document.querySelectorAll('#family-status-checks input, #child-status-checks input').forEach(i => i.checked = false);
  document.querySelectorAll('input[name="visited"], input[name="interaction"], input[name="needs-help"]').forEach(i => i.checked = false);
  document.querySelectorAll('.scale-item').forEach(s => s.classList.remove('selected'));
  state.selectedAttitude = '';
}

function submitAnother() {
  goToStep(1);
  showScreen('screen-form');
}

// ===========================
// GOOGLE SHEETS
// ===========================
async function sendToSheets(record) {
  if (!state.sheetsUrl) return;
  try {
    const url = state.sheetsUrl + '?data=' + encodeURIComponent(JSON.stringify(record));
    await fetch(url, { method: 'GET', mode: 'no-cors' });
  } catch (e) {
    console.warn('Google Sheets sync failed:', e);
  }
}

// Fetch ALL records from Google Sheets (for admin dashboard)
async function fetchFromSheets() {
  if (!state.sheetsUrl) return null;
  try {
    const url = state.sheetsUrl + '?action=list';
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    const colMap = {
      '提交日期': 'submittedAt', '志工姓名': 'volunteerName', '英文姓名': 'volunteerNameEn',
      '團隊': 'teamName', '個案標號': 'familyId', '關懷組別': 'group',
      '月份': 'month', '本月關懷': 'visited', '家庭狀況': 'familyStatus',
      '兒童狀況': 'childStatus', '關懷態度': 'attitude', '互動情況': 'interaction',
      '需要協助': 'needsHelp', '備註': 'notes',
    };
    return rows.map((row, idx) => {
      const rec = { id: 'sheets-' + idx };
      Object.entries(colMap).forEach(([zh, en]) => {
        let val = row[zh] || '';
        if (en === 'familyStatus' || en === 'childStatus') {
          val = val ? val.split('、').filter(Boolean) : [];
        }
        if (en === 'teamName') {
          const team = state.teams.find(t => t.name === val);
          rec.teamId = team ? team.id : val;
        }
        rec[en] = val;
      });
      return rec;
    });
  } catch (e) {
    console.warn('Fetch from Sheets failed:', e);
    return null;
  }
}

// Fetch teams config from Sheets
async function fetchTeamsFromSheets() {
  if (!state.sheetsUrl) return null;
  try {
    const url = state.sheetsUrl + '?action=getTeams';
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) return data;
    return null;
  } catch (e) {
    console.warn('Fetch teams failed:', e);
    return null;
  }
}

// Save teams config to Sheets
async function saveTeamsToSheets() {
  if (!state.sheetsUrl) return;
  try {
    const url = state.sheetsUrl + '?action=saveTeams&teams=' + encodeURIComponent(JSON.stringify(state.teams));
    await fetch(url, { method: 'GET', mode: 'no-cors' });
  } catch (e) {
    console.warn('Save teams failed:', e);
  }
}

async function syncAndRefresh() {
  showSyncStatus('syncing');
  if (state.sheetsUrl) {
    // Sync teams first
    const sheetsTeams = await fetchTeamsFromSheets();
    if (sheetsTeams && sheetsTeams.length > 0) {
      state.teams = sheetsTeams;
      saveToStorage();
      renderTeamList();
      setupAdminFilters();
    }
    // Then sync records
    const sheetsRecords = await fetchFromSheets();
    if (sheetsRecords !== null) {
      state.records = sheetsRecords;
      showSyncStatus('ok');
    } else {
      showSyncStatus('error');
    }
  } else {
    showSyncStatus('local');
  }
  setupAdminFilters();
  refreshDashboard();
  renderRecordsTable();
}

function showSyncStatus(s) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = {
    syncing: '🔄 同步中...',
    ok:      '✅ 已從 Google Sheets 同步',
    error:   '⚠️ 無法連線 Sheets，顯示本機資料',
    local:   '💾 本機資料（未設定 Sheets）',
  };
  el.textContent = map[s] || '';
  el.className = 'sync-badge sync-' + s;
}

// Generate a share link that auto-configures any device
function generateShareLink() {
  if (!state.sheetsUrl) return showToast('請先設定 Google Sheets URL', 'error');
  const cfg = btoa(JSON.stringify({ sheetsUrl: state.sheetsUrl }));
  const link = `${location.origin}${location.pathname}?sid=${cfg}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('分享連結已複製！志工點此連結即可自動同步設定 ✅', 'success');
  }).catch(() => {
    openModal(`
      <h3 class="modal-title">📱 志工分享連結</h3>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">複製以下連結，分享給所有志工。點開後會自動同步團隊設定。</p>
      <div class="code-block" style="word-break:break-all;font-size:12px">${link}</div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">關閉</button></div>
    `);
  });
}

// Fetch ALL records from Google Sheets (for admin dashboard)
async function fetchFromSheets() {
  if (!state.sheetsUrl) return null;
  try {
    const url = state.sheetsUrl + '?action=list';
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;

    // Map Sheets column names → state.records format
    const colMap = {
      '提交日期': 'submittedAt', '志工姓名': 'volunteerName', '英文姓名': 'volunteerNameEn',
      '團隊': 'teamName', '個案標號': 'familyId', '關懷組別': 'group',
      '月份': 'month', '本月關懷': 'visited', '家庭狀況': 'familyStatus',
      '兒童狀況': 'childStatus', '關懷態度': 'attitude', '互動情況': 'interaction',
      '需要協助': 'needsHelp', '備註': 'notes',
    };
    return rows.map((row, idx) => {
      const rec = { id: 'sheets-' + idx };
      Object.entries(colMap).forEach(([zh, en]) => {
        let val = row[zh] || '';
        // 陣列欄位：還原為 array
        if (en === 'familyStatus' || en === 'childStatus') {
          val = val ? val.split('、').filter(Boolean) : [];
        }
        // 找出 teamId
        if (en === 'teamName') {
          const team = state.teams.find(t => t.name === val);
          rec.teamId = team ? team.id : val;
        }
        rec[en] = val;
      });
      return rec;
    });
  } catch (e) {
    console.warn('Fetch from Sheets failed:', e);
    return null;
  }
}

async function syncAndRefresh() {
  showSyncStatus('syncing');
  if (state.sheetsUrl) {
    const sheetsRecords = await fetchFromSheets();
    if (sheetsRecords !== null) {
      state.records = sheetsRecords;
      showSyncStatus('ok');
    } else {
      showSyncStatus('error');
    }
  } else {
    showSyncStatus('local');
  }
  setupAdminFilters();
  refreshDashboard();
  renderRecordsTable();
}

function showSyncStatus(s) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = {
    syncing: '🔄 同步中...',
    ok:      '✅ 已從 Google Sheets 同步',
    error:   '⚠️ 無法連線 Sheets，顯示本機資料',
    local:   '💾 本機資料（未設定 Sheets）',
  };
  el.textContent = map[s] || '';
  el.className = 'sync-badge sync-' + s;
}

// ===========================
// ADMIN
// ===========================
function enterAsAdmin() {
  showScreen('screen-admin-login');
}

function loginAdmin() {
  const pw = document.getElementById('admin-password').value;
  if (pw === state.adminPassword) {
    state.isAdmin = true;
    showScreen('screen-admin');
    renderTeamsAdmin();
    syncAndRefresh();  // fetch from Sheets + render
    document.getElementById('admin-password').value = '';
  } else {
    showToast('密碼錯誤', 'error');
  }
}

function logoutAdmin() {
  state.isAdmin = false;
  showScreen('screen-login');
}

function goBack() {
  showScreen('screen-login');
}

// ===========================
// ADMIN TABS
// ===========================
function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById(`nav-${tab}`)?.classList.add('active');

  if (tab === 'dashboard') syncAndRefresh();
  if (tab === 'records') { syncAndRefresh(); }
  if (tab === 'teams') renderTeamsAdmin();
}

// ===========================
// DASHBOARD
// ===========================
function setupAdminFilters() {
  const teamFilters = ['filter-team', 'records-filter-team'];
  teamFilters.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="all">所有團隊</option>' +
      state.teams.map(t => `<option value="${t.id}" ${current === t.id ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
  });

  const monthEl = document.getElementById('filter-month');
  if (monthEl) {
    const months = [...new Set(state.records.map(r => r.month))].sort().reverse();
    monthEl.innerHTML = '<option value="all">所有月份</option>' +
      months.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

function getFilteredRecords() {
  const teamFilter = document.getElementById('filter-team')?.value || 'all';
  const monthFilter = document.getElementById('filter-month')?.value || 'all';
  return state.records.filter(r =>
    (teamFilter === 'all' || r.teamId === teamFilter) &&
    (monthFilter === 'all' || r.month === monthFilter)
  );
}

function refreshDashboard() {
  const records = getFilteredRecords();

  // Stats
  document.getElementById('stat-total').textContent = records.length;
  const uniqueFamilies = new Set(records.map(r => r.familyId)).size;
  document.getElementById('stat-families').textContent = uniqueFamilies;
  const activeTeams = new Set(records.map(r => r.teamId)).size;
  document.getElementById('stat-teams').textContent = activeTeams;
  const needsHelp = records.filter(r => r.needsHelp === '是').length;
  document.getElementById('stat-needs-help').textContent = needsHelp;

  // Charts
  renderFamilyStatusChart(records);
  renderInteractionDonut(records);
  renderChildStatusChart(records);
  renderAttitudeChart(records);
  renderAlertFamilies(records);
}

function renderBarChart(containerId, data, colors) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...data.map(d => d.count), 1);
  container.innerHTML = data.length === 0
    ? '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">尚無資料</div></div>'
    : data.map((d, i) => `
      <div class="bar-item">
        <div class="bar-label-row">
          <span>${d.label}</span>
          <span>${d.count}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${Math.round(d.count / max * 100)}%; background: ${colors ? colors[i % colors.length] : 'linear-gradient(90deg, var(--primary), var(--primary-light))'}"></div>
        </div>
      </div>
    `).join('');
}

function renderFamilyStatusChart(records) {
  const keys = ['經濟困難', '居住環境不佳', '隔代教養', '新住民家庭', '照顧者高齡', '照顧者疾病'];
  const data = keys.map(k => ({ label: k, count: records.filter(r => r.familyStatus?.includes(k)).length }));
  renderBarChart('chart-family-status', data);
}

function renderChildStatusChart(records) {
  const keys = ['課業學習落後', '同儕人際疏離', '家庭氣氛緊張', '情緒起伏', '壓抑', '行為常規偏差'];
  const data = keys.map(k => ({ label: k, count: records.filter(r => r.childStatus?.includes(k)).length }));
  const colors = ['#4fc3f7', '#00d4aa', '#ff8c42', '#ff5c7a', '#7c5cfc', '#ffd166'];
  renderBarChart('chart-child-status', data, colors);
}

function renderAttitudeChart(records) {
  const keys = ['非常接受', '接受', '中等', '稍微接受', '不接受'];
  const data = keys.map(k => ({ label: k, count: records.filter(r => r.attitude === k).length }));
  const colors = ['#00d4aa', '#4fc3f7', '#ffd166', '#ff8c42', '#ff5c7a'];
  renderBarChart('chart-attitude', data, colors);
}

function renderInteractionDonut(records) {
  const canvas = document.getElementById('donut-interaction');
  const legendEl = document.getElementById('donut-legend');
  if (!canvas || !legendEl) return;

  const keys = [
    '互動良好，有一定信任且能邀約出來。',
    '建立關係中，互動逐漸增加',
    '互動較少，需要時間建立關係',
    '目前互動有困難',
  ];
  const labels = ['互動良好', '逐漸增加', '需要時間', '有困難'];
  const colors = ['#00d4aa', '#4fc3f7', '#ffd166', '#ff5c7a'];
  const counts = keys.map(k => records.filter(r => r.interaction === k).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const ctx = canvas.getContext('2d');
  const cx = 100, cy = 100, r = 75, innerR = 48;
  ctx.clearRect(0, 0, 200, 200);

  if (total === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,26,0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();
    legendEl.innerHTML = '<div style="color: var(--text-muted); font-size:12px;">尚無資料</div>';
    return;
  }

  let startAngle = -Math.PI / 2;
  counts.forEach((count, i) => {
    if (count === 0) return;
    const angle = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
    startAngle += angle;
  });

  // Inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,14,26,0.95)';
  ctx.fill();

  // Center text
  ctx.fillStyle = 'rgba(232,234,240,0.9)';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 6);
  ctx.font = '11px Noto Sans TC, sans-serif';
  ctx.fillStyle = 'rgba(232,234,240,0.4)';
  ctx.fillText('筆紀錄', cx, cy + 14);

  // Legend
  legendEl.innerHTML = labels.map((label, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span>${label} (${counts[i]})</span>
    </div>
  `).join('');
}

function renderAlertFamilies(records) {
  const alertEl = document.getElementById('alert-families-list');
  if (!alertEl) return;
  const alerts = records.filter(r => r.needsHelp === '是');
  if (alerts.length === 0) {
    alertEl.innerHTML = '<div style="color: var(--text-muted); font-size:13px; padding: 8px 0;">目前沒有需要緊急關注的家庭 ✅</div>';
    return;
  }
  alertEl.innerHTML = alerts.map(r => `
    <div class="alert-item">
      <div class="alert-dot"></div>
      <div class="alert-item-info">
        <div class="alert-family-id">家庭 ${r.familyId} <span class="badge badge-alert">${r.teamName}</span></div>
        <div class="alert-meta">志工：${r.volunteerName}｜月份：${r.month}｜${r.notes ? '備註：' + r.notes.substring(0, 40) + '…' : '無備註'}</div>
      </div>
    </div>
  `).join('');
}

// ===========================
// RECORDS TABLE
// ===========================
function renderRecordsTable() {
  const searchVal = document.getElementById('search-records')?.value?.toLowerCase() || '';
  const teamFilter = document.getElementById('records-filter-team')?.value || 'all';

  let filtered = state.records.filter(r => {
    const matchTeam = teamFilter === 'all' || r.teamId === teamFilter;
    const matchSearch = !searchVal ||
      r.familyId?.toLowerCase().includes(searchVal) ||
      r.volunteerName?.toLowerCase().includes(searchVal) ||
      r.teamName?.toLowerCase().includes(searchVal);
    return matchTeam && matchSearch;
  });

  filtered = filtered.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const tbody = document.getElementById('records-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">沒有符合的紀錄</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${formatDate(r.submittedAt)}</td>
      <td>${r.volunteerName}</td>
      <td><span class="badge" style="background: rgba(124,92,252,0.15); color: var(--primary-light); border: 1px solid rgba(124,92,252,0.3)">${r.teamName}</span></td>
      <td><strong>${r.familyId}</strong></td>
      <td><span class="badge ${r.visited === '是' ? 'badge-yes' : 'badge-no'}">${r.visited}</span></td>
      <td style="font-size:12px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${r.interaction}">${r.interaction || '—'}</td>
      <td><span class="badge ${r.needsHelp === '是' ? 'badge-alert' : 'badge-yes'}">${r.needsHelp || '—'}</span></td>
      <td><button class="btn-delete" onclick="deleteRecord('${r.id}')">刪除</button></td>
    </tr>
  `).join('');
}

function filterRecords() {
  renderRecordsTable();
}

function deleteRecord(id) {
  if (!confirm('確定要刪除這筆紀錄？')) return;
  state.records = state.records.filter(r => r.id !== id);
  saveToStorage();
  renderRecordsTable();
  refreshDashboard();
  showToast('紀錄已刪除', 'success');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ===========================
// EXPORT CSV
// ===========================
function exportCSV() {
  const headers = ['提交日期', '志工姓名', '英文姓名', '團隊', '個案標號', '關懷組別', '月份', '本月關懷', '家庭狀況', '兒童狀況', '關懷態度', '互動情況', '需要協助', '備註'];
  const rows = state.records.map(r => [
    formatDate(r.submittedAt),
    r.volunteerName, r.volunteerNameEn, r.teamName, r.familyId, r.group, r.month,
    r.visited, (r.familyStatus || []).join('|'), (r.childStatus || []).join('|'),
    r.attitude, r.interaction, r.needsHelp, r.notes,
  ]);

  const csvContent = '\uFEFF' + [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `關懷紀錄_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV 匯出完成', 'success');
}

// ===========================
// TEAMS ADMIN
// ===========================
function renderTeamsAdmin() {
  const container = document.getElementById('teams-grid');
  if (!container) return;

  if (state.teams.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">尚未建立任何團隊</div></div>`;
    return;
  }

  container.innerHTML = state.teams.map(team => {
    const teamRecords = state.records.filter(r => r.teamId === team.id);
    const families = new Set(teamRecords.map(r => r.familyId)).size;
    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-card-name">
            <span class="team-card-emoji">${team.emoji}</span>
            <span>${team.name}</span>
          </div>
          <button class="btn-delete" onclick="deleteTeam('${team.id}')">刪除</button>
        </div>
        <div class="team-card-stats">
          <div class="team-stat">
            <div class="team-stat-val" style="color:${team.color}">${teamRecords.length}</div>
            <div class="team-stat-lbl">紀錄數</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val" style="color:${team.color}">${families}</div>
            <div class="team-stat-lbl">服務家庭</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showAddTeamModal() {
  const emojis = ['🌸', '🌊', '🔥', '⚡', '🌈', '🎯', '🌿', '💫', '🏆', '🤝'];
  openModal(`
    <h3 class="modal-title">新增事工團隊</h3>
    <div class="field-group">
      <label class="field-label required">團隊名稱</label>
      <input type="text" id="new-team-name" class="field-input" placeholder="例：希望之光" />
    </div>
    <div class="field-group">
      <label class="field-label">團隊圖示</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px">
        ${emojis.map(e => `<button onclick="selectTeamEmoji(this,'${e}')" style="font-size:24px; padding:8px; background:rgba(255,255,255,0.05); border:2px solid var(--border); border-radius:8px; cursor:pointer; transition: all 0.2s">${e}</button>`).join('')}
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">代表色</label>
      <input type="color" id="new-team-color" value="#7c5cfc" class="field-input" style="height:42px; padding:4px;" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="addTeam()">建立團隊</button>
    </div>
  `);
  window._selectedEmoji = '🌟';
}

function selectTeamEmoji(btn, emoji) {
  document.querySelectorAll('.modal-card button[onclick*="selectTeamEmoji"]').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'rgba(255,255,255,0.05)';
  });
  btn.style.borderColor = 'var(--primary)';
  btn.style.background = 'rgba(124,92,252,0.2)';
  window._selectedEmoji = emoji;
}

function addTeam() {
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) return showToast('請輸入團隊名稱', 'error');

  const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  const team = {
    id,
    name,
    emoji: window._selectedEmoji || '🌟',
    color: document.getElementById('new-team-color').value,
    createdAt: new Date().toISOString(),
  };

  state.teams.push(team);
  saveToStorage();
  saveTeamsToSheets();  // sync to all devices
  closeModal();
  renderTeamsAdmin();
  renderTeamList();
  setupAdminFilters();
  showToast(`團隊「${name}」已建立，已同步到所有裝置`, 'success');
}

function deleteTeam(id) {
  const team = state.teams.find(t => t.id === id);
  if (!team) return;
  if (!confirm(`確定要刪除「${team.name}」？此操作不會刪除該團隊的紀錄。`)) return;
  state.teams = state.teams.filter(t => t.id !== id);
  saveToStorage();
  saveTeamsToSheets();  // sync to all devices
  renderTeamsAdmin();
  renderTeamList();
  setupAdminFilters();
  showToast('團隊已刪除，已同步到所有裝置', 'success');
}

// ===========================
// SETTINGS
// ===========================
function saveSettings() {
  const url = document.getElementById('sheets-url').value.trim();
  state.sheetsUrl = url;
  saveToStorage();

  const statusEl = document.getElementById('sheets-status');
  if (url) {
    statusEl.className = 'settings-status status-ok';
    statusEl.innerHTML = `
      ✅ Google Sheets 連結已儲存<br>
      <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="generateShareLink()">
        📱 產生志工分享連結
      </button>`;
    showToast('設定已儲存', 'success');
    // Also sync current teams to Sheets
    saveTeamsToSheets();
  } else {
    statusEl.className = 'settings-status';
    statusEl.textContent = '';
  }
}

function changePassword() {
  const newPw = document.getElementById('new-password').value;
  const confirmPw = document.getElementById('confirm-password').value;
  if (!newPw) return showToast('請輸入新密碼', 'error');
  if (newPw !== confirmPw) return showToast('兩次密碼不一致', 'error');
  if (newPw.length < 4) return showToast('密碼至少需要 4 個字元', 'error');
  state.adminPassword = newPw;
  saveToStorage();
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  showToast('密碼已更新', 'success');
}

function showScriptCode() {
  const code = `// Google Apps Script
// ⚠️ 部署設定：執行身份 = 「我」，存取權限 = 「所有人」
// 每次修改後請「部署 → 管理部署作業 → 選新版本 → 部署」

const SS = SpreadsheetApp.getActiveSpreadsheet();

function getSheet(name) {
  return SS.getSheetByName(name) || SS.insertSheet(name);
}

function doGet(e) {
  const action = e.parameter && e.parameter.action;

  // 讀取所有紀錄（後台管理使用）
  if (action === 'list') {
    const sheet = getSheet('紀錄');
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return json([]);
    const headers = data[0];
    return json(data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    }));
  }

  // 讀取團隊設定（跨裝置同步）
  if (action === 'getTeams') {
    const sheet = getSheet('團隊設定');
    const val = sheet.getRange('A1').getValue();
    if (!val) return json([]);
    try { return json(JSON.parse(val)); }
    catch(err2) { return json([]); }
  }

  // 儲存團隊設定（管理員新增/刪除團隊時呼叫）
  if (action === 'saveTeams' && e.parameter.teams) {
    const sheet = getSheet('團隊設定');
    sheet.getRange('A1').setValue(e.parameter.teams);
    return json({ status: 'ok' });
  }

  // 新增紀錄（志工填表使用）
  if (e.parameter && e.parameter.data) {
    try {
      const rec = JSON.parse(e.parameter.data);
      const sheet = getSheet('紀錄');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['提交日期','志工姓名','英文姓名','團隊','個案標號',
          '關懷組別','月份','本月關懷','家庭狀況','兒童狀況',
          '關懷態度','互動情況','需要協助','備註']);
      }
      sheet.appendRow([
        new Date(rec.submittedAt).toLocaleString('zh-TW'),
        rec.volunteerName, rec.volunteerNameEn, rec.teamName, rec.familyId,
        rec.group, rec.month, rec.visited,
        (rec.familyStatus||[]).join('、'), (rec.childStatus||[]).join('、'),
        rec.attitude, rec.interaction, rec.needsHelp, rec.notes
      ]);
      return json({ status: 'ok' });
    } catch(err) { return json({ status: 'error', message: err.toString() }); }
  }

  return json({ status: 'ok', message: '關懷紀錄 API 運行中' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  openModal(`
    <h3 class="modal-title">📋 Apps Script 程式碼</h3>
    <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 12px">複製以下程式碼，貼到 Google Apps Script 編輯器中：</p>
    <div class="code-block">${code}</div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">關閉</button>
      <button class="btn btn-primary" onclick="copyScript()">複製程式碼</button>
    </div>
  `);
  window._scriptCode = code;
}

function copyScript() {
  navigator.clipboard.writeText(window._scriptCode || '').then(() => {
    showToast('程式碼已複製到剪貼簿', 'success');
  });
}

// ===========================
// MODAL
// ===========================
function openModal(content) {
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ===========================
// TOAST
// ===========================
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// Pre-fill settings URL if saved
document.addEventListener('DOMContentLoaded', () => {
  const urlEl = document.getElementById('sheets-url');
  if (urlEl && state.sheetsUrl) {
    urlEl.value = state.sheetsUrl;
    const statusEl = document.getElementById('sheets-status');
    if (statusEl && state.sheetsUrl) {
      statusEl.className = 'settings-status status-ok';
      statusEl.textContent = '✅ Google Sheets 連結已設定';
    }
  }
});
