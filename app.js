// ===========================
// CONFIG & CONSTANTS
// ===========================
const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxwTNklfYDXQf89KA2Aj5msPHFQ3BSst9O36HtvT4Rs4hERIm1wjfIrwDFvIUjFcdQY/exec';

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
  sheetsUrl: DEFAULT_SHEETS_URL,
  isAdmin: false,
};

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  loadFromStorage();

  // 1) Check URL for ?sid= (shared config link from admin if custom URL used)
  const urlParams = new URLSearchParams(window.location.search);
  const sid = urlParams.get('sid');
  if (sid) {
    try {
      const cfg = JSON.parse(atob(sid));
      if (cfg.sheetsUrl) {
        state.sheetsUrl = cfg.sheetsUrl;
        saveToStorage();
      }
      history.replaceState(null, '', window.location.pathname);
    } catch(e) { console.warn('Invalid sid param', e); }
  }

  // 2) Initial render immediately for fast first paint
  renderTeamList();
  setupAdminFilters();

  // Set default month to current
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const monthInput = document.getElementById('f-month');
  if (monthInput) monthInput.value = `${yyyy}-${mm}`;

  // 3) Fetch latest teams from Sheets in background and update UI
  if (state.sheetsUrl) {
    try {
      const sheetsTeams = await fetchTeamsFromSheets();
      if (sheetsTeams && sheetsTeams.length > 0) {
        state.teams = ensureTeamCodesAndCases(sheetsTeams);
        saveToStorage();
        renderTeamList();
        setupAdminFilters();
      }
    } catch (e) {
      console.warn('Init teams fetch failed:', e);
    }
  }
});

// ===========================
// DATE & MONTH FORMAT HELPER
// ===========================
function formatMonth(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    val = val.trim();
    // 若為 2026-09-30T16:00:00.000Z 或包含 T，截取前面的 2026-09-30
    if (val.includes('T')) {
      return val.split('T')[0];
    }
    return val;
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

// ===========================
// LOCAL STORAGE
// ===========================
function loadFromStorage() {
  const saved = localStorage.getItem('careSystem');
  if (saved) {
    const data = JSON.parse(saved);
    state.records = (data.records || []).map(r => ({
      ...r,
      month: formatMonth(r.month),
    }));
    state.teams = ensureTeamCodesAndCases(data.teams || getDefaultTeams());
    state.adminPassword = data.adminPassword || 'admin123';
    state.sheetsUrl = data.sheetsUrl || DEFAULT_SHEETS_URL;
  } else {
    state.teams = ensureTeamCodesAndCases(getDefaultTeams());
    state.sheetsUrl = DEFAULT_SHEETS_URL;
    saveToStorage();
  }
  if (!state.sheetsUrl) {
    state.sheetsUrl = DEFAULT_SHEETS_URL;
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
    { id: 'angel-tree', name: '天使樹', code: 'A', emoji: '🎄', color: '#6366f1', cases: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08', 'A-09', 'A-10'], createdAt: new Date().toISOString() },
    { id: 'hope', name: '希望之光', code: 'B', emoji: '🌟', color: '#14b8a6', cases: ['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-06', 'B-07', 'B-08', 'B-09', 'B-10'], createdAt: new Date().toISOString() },
    { id: 'grace', name: '恩典事工', code: 'C', emoji: '🕊️', color: '#f59e0b', cases: ['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06', 'C-07', 'C-08', 'C-09', 'C-10'], createdAt: new Date().toISOString() },
  ];
}

// Ensure each team has a unique letter code and cases list
function ensureTeamCodesAndCases(teams) {
  if (!Array.isArray(teams)) return teams;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const usedCodes = new Set();

  teams.forEach(t => {
    if (t.code) usedCodes.add(t.code.toUpperCase());
  });

  teams.forEach(team => {
    if (!team.code) {
      const nextLetter = letters.find(l => !usedCodes.has(l)) || 'A';
      team.code = nextLetter;
      usedCodes.add(nextLetter);
    } else {
      team.code = team.code.toUpperCase();
    }

    if (!Array.isArray(team.cases) || team.cases.length === 0) {
      const c = team.code;
      team.cases = Array.from({ length: 10 }, (_, i) => `${c}-${String(i + 1).padStart(2, '0')}`);
    }
  });

  return teams;
}

function getNextAvailableCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const used = new Set(state.teams.map(t => t.code ? t.code.toUpperCase() : ''));
  return letters.find(l => !used.has(l)) || 'A';
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
      ${team.emoji ? `<span class="team-emoji">${team.emoji}</span>` : ''}
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
  const teamLabel = (state.currentTeam.emoji ? state.currentTeam.emoji + ' ' : '') + state.currentTeam.name;
  document.getElementById('form-team-label').textContent = teamLabel;
  document.getElementById('volunteer-badge').textContent = '服事夥伴：' + name;
  showToast(`平安，${name} 夥伴！`, 'success');

  // Populate case dropdown for selected team
  populateCaseDropdown();

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

function populateCaseDropdown() {
  const select = document.getElementById('f-family-id');
  const customWrap = document.getElementById('f-family-id-custom-wrap');
  const customInput = document.getElementById('f-family-id-custom');
  const toggleBtn = document.getElementById('btn-toggle-custom-id');
  if (!select) return;

  const cases = state.currentTeam?.cases || [];
  const code = state.currentTeam?.code || 'A';

  if (cases.length === 0) {
    select.style.display = 'none';
    if (customWrap) customWrap.style.display = 'block';
    if (toggleBtn) toggleBtn.style.display = 'none';
    if (customInput) {
      customInput.value = '';
      customInput.placeholder = `例：${code}-01、101`;
    }
  } else {
    select.style.display = 'block';
    if (customWrap) customWrap.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.style.display = 'inline-flex';
      toggleBtn.textContent = '✏️ 手動輸入';
    }
    if (customInput) customInput.value = '';

    select.innerHTML = `
      <option value="">請選擇個案標號...</option>
      ${cases.map(c => `<option value="${c}">${c}</option>`).join('')}
      <option value="__custom__">✏️ 自訂 / 手動輸入其他標號...</option>
    `;
  }
}

function onCaseSelectChange(sel) {
  const customWrap = document.getElementById('f-family-id-custom-wrap');
  const customInput = document.getElementById('f-family-id-custom');
  const toggleBtn = document.getElementById('btn-toggle-custom-id');

  if (sel.value === '__custom__') {
    if (customWrap) customWrap.style.display = 'block';
    if (customInput) {
      customInput.focus();
      customInput.placeholder = `請手動輸入個案標號（例：${state.currentTeam?.code || 'A'}-21）`;
    }
    if (toggleBtn) toggleBtn.textContent = '📋 改用選單';
  } else {
    if (customWrap) customWrap.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = '✏️ 手動輸入';
  }
}

function toggleCustomCaseId() {
  const select = document.getElementById('f-family-id');
  const customWrap = document.getElementById('f-family-id-custom-wrap');
  const customInput = document.getElementById('f-family-id-custom');
  const toggleBtn = document.getElementById('btn-toggle-custom-id');

  const isCustomVisible = customWrap && customWrap.style.display !== 'none';
  if (isCustomVisible) {
    if (customWrap) customWrap.style.display = 'none';
    if (select) {
      select.style.display = 'block';
      if (select.value === '__custom__') select.value = '';
    }
    if (toggleBtn) toggleBtn.textContent = '✏️ 手動輸入';
  } else {
    if (customWrap) customWrap.style.display = 'block';
    if (customInput) customInput.focus();
    if (toggleBtn) toggleBtn.textContent = '📋 改用選單';
  }
}

function getSelectedFamilyId() {
  const select = document.getElementById('f-family-id');
  const customWrap = document.getElementById('f-family-id-custom-wrap');
  const customInput = document.getElementById('f-family-id-custom');

  if (customWrap && customWrap.style.display !== 'none' && customInput && customInput.value.trim()) {
    return customInput.value.trim();
  }
  if (select && select.style.display !== 'none' && select.value && select.value !== '__custom__') {
    return select.value.trim();
  }
  return customInput ? customInput.value.trim() : '';
}

function nextStep(current) {
  if (current === 1) {
    if (!document.getElementById('f-month').value) return showToast('請填寫提交月份', 'error');
    if (!getSelectedFamilyId()) return showToast('請選擇或填寫個案標號', 'error');
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

  const familyId = getSelectedFamilyId();
  if (!familyId) return showToast('請選擇或填寫個案標號', 'error');

  // Collect data
  const familyStatus = Array.from(document.querySelectorAll('#family-status-checks input:checked')).map(i => i.value);
  const childStatus = Array.from(document.querySelectorAll('#child-status-checks input:checked')).map(i => i.value);
  const interaction = document.querySelector('input[name="interaction"]:checked')?.value || '';
  const needsHelp = document.querySelector('input[name="needs-help"]:checked')?.value || '';

  const record = {
    id: Date.now().toString(),
    submittedAt: new Date().toISOString(),
    month: formatMonth(document.getElementById('f-month').value),
    volunteerName: state.volunteerName,
    volunteerNameEn: state.volunteerNameEn,
    teamId: state.currentTeam.id,
    teamName: state.currentTeam.name,
    familyId: familyId,
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
  const select = document.getElementById('f-family-id');
  if (select) select.value = '';
  const customInput = document.getElementById('f-family-id-custom');
  if (customInput) customInput.value = '';
  const customWrap = document.getElementById('f-family-id-custom-wrap');
  if (customWrap && (state.currentTeam?.cases?.length || 0) > 0) {
    customWrap.style.display = 'none';
  }
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
      '提交日期': 'submittedAt',
      '服事夥伴': 'volunteerName',
      '服事夥伴姓名': 'volunteerName',
      '志工姓名': 'volunteerName',
      '英文姓名': 'volunteerNameEn',
      '團隊': 'teamName',
      '個案標號': 'familyId',
      '關懷組別': 'group',
      '月份': 'month',
      '本月關懷': 'visited',
      '家庭狀況': 'familyStatus',
      '兒童狀況': 'childStatus',
      '關懷態度': 'attitude',
      '互動情況': 'interaction',
      '需要協助': 'needsHelp',
      '備註': 'notes',
    };
    return rows.map((row, idx) => {
      const rec = { id: 'sheets-' + idx };
      Object.entries(colMap).forEach(([zh, en]) => {
        let val = row[zh] || '';
        if (en === 'month') {
          val = formatMonth(val);
        }
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

// 手動在前台重新同步團隊
async function manualSyncTeams(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🔄 同步中...';
  }
  showToast('正在向雲端取得最新團隊名單...', 'info');
  try {
    const sheetsTeams = await fetchTeamsFromSheets();
    if (sheetsTeams && sheetsTeams.length > 0) {
      state.teams = sheetsTeams;
      saveToStorage();
      renderTeamList();
      setupAdminFilters();
      showToast('✅ 已同步最新團隊清單！', 'success');
    } else {
      showToast('目前團隊清單已是最新', 'info');
    }
  } catch (e) {
    showToast('同步失敗，請檢查網路連線', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 取得最新團隊';
    }
  }
}

// 管理員一鍵發布團隊設定至雲端（讓所有裝置即時同步）
async function publishTeamsToCloud() {
  const btn = document.getElementById('btn-publish-teams');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 發布同步中...';
  }
  showToast('正在發布團隊至 Google 雲端...', 'info');
  try {
    await saveTeamsToSheets();
    await new Promise(r => setTimeout(r, 1200));
    const sheetsTeams = await fetchTeamsFromSheets();
    if (sheetsTeams && sheetsTeams.length > 0) {
      state.teams = sheetsTeams;
      saveToStorage();
      renderTeamsAdmin();
      renderTeamList();
    }
    showToast('🚀 團隊設定已成功發布！所有裝置現在皆可看到最新設定', 'success');
  } catch (e) {
    showToast('發布可能未完成，請稍候重試', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 發布同步至所有裝置';
    }
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
    showToast('分享連結已複製！夥伴點此連結即可自動同步設定 ✅', 'success');
  }).catch(() => {
    openModal(`
      <h3 class="modal-title">📱 服事夥伴分享連結</h3>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">複製以下連結，分享給所有服事夥伴。點開後會自動同步團隊設定。</p>
      <div class="code-block" style="word-break:break-all;font-size:12px">${link}</div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">關閉</button></div>
    `);
  });
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
    const current = monthEl.value || 'all';
    const months = [...new Set(state.records.map(r => formatMonth(r.month)).filter(Boolean))].sort().reverse();
    monthEl.innerHTML = '<option value="all">所有月份</option>' +
      months.map(m => `<option value="${m}" ${current === m ? 'selected' : ''}>${m}</option>`).join('');
  }
}

function getFilteredRecords() {
  const teamFilter = document.getElementById('filter-team')?.value || 'all';
  const monthFilter = document.getElementById('filter-month')?.value || 'all';
  return state.records.filter(r =>
    (teamFilter === 'all' || r.teamId === teamFilter) &&
    (monthFilter === 'all' || formatMonth(r.month) === monthFilter)
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
        <div class="alert-family-id">個案 ${r.familyId} <span class="badge badge-alert">${r.teamName}</span></div>
        <div class="alert-meta">服事夥伴：${r.volunteerName}｜月份：${formatMonth(r.month)}｜${r.notes ? '備註：' + r.notes.substring(0, 40) + '…' : '無備註'}</div>
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
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">沒有符合的紀錄</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${formatDate(r.submittedAt)}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.06); font-family: monospace;">${formatMonth(r.month) || '—'}</span></td>
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
  if (!iso) return '—';
  if (typeof iso === 'string' && iso.includes('T')) {
    return iso.split('T')[0].replace(/-/g, '/');
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ===========================
// EXPORT CSV
// ===========================
function exportCSV() {
  const headers = ['提交日期', '月份', '服事夥伴姓名', '英文姓名', '團隊', '個案標號', '關懷組別', '本月關懷', '家庭狀況', '兒童狀況', '關懷態度', '互動情況', '需要協助', '備註'];
  const rows = state.records.map(r => [
    formatDate(r.submittedAt),
    formatMonth(r.month),
    r.volunteerName, r.volunteerNameEn, r.teamName, r.familyId, r.group,
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

  container.innerHTML = state.teams.map((team, idx) => {
    const teamRecords = state.records.filter(r => r.teamId === team.id);
    const families = new Set(teamRecords.map(r => r.familyId)).size;
    const isFirst = idx === 0;
    const isLast = idx === state.teams.length - 1;
    const casesCount = (team.cases || []).length;

    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-card-name">
            <span class="team-order-badge">${idx + 1}</span>
            <span class="team-code-badge">代號 ${team.code || 'A'}</span>
            ${team.emoji ? `<span class="team-card-emoji">${team.emoji}</span>` : ''}
            <span>${team.name}</span>
          </div>
          <div class="team-card-controls">
            <button type="button" class="btn-order" onclick="moveTeamOrder(${idx}, -1)" title="順序往前移" ${isFirst ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" class="btn-order" onclick="moveTeamOrder(${idx}, 1)" title="順序往後移" ${isLast ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button type="button" class="btn-cases" onclick="showCasesModal('${team.id}')">📋 個案標號 (${casesCount})</button>
            <button type="button" class="btn-edit" onclick="showEditTeamModal('${team.id}')">編輯</button>
            <button type="button" class="btn-delete" onclick="deleteTeam('${team.id}')">刪除</button>
          </div>
        </div>
        <div class="team-card-stats">
          <div class="team-stat">
            <div class="team-stat-val" style="color:${team.color || 'var(--text-primary)'}">${teamRecords.length}</div>
            <div class="team-stat-lbl">紀錄數</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val" style="color:${team.color || 'var(--text-primary)'}">${families}</div>
            <div class="team-stat-lbl">服務家庭</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val" style="color:#a5b4fc">${casesCount}</div>
            <div class="team-stat-lbl">預設個案標號</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 調整團隊順序（往前或往後）
function moveTeamOrder(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.teams.length) return;
  const temp = state.teams[index];
  state.teams[index] = state.teams[newIndex];
  state.teams[newIndex] = temp;

  saveToStorage();
  saveTeamsToSheets();
  renderTeamsAdmin();
  renderTeamList();
  setupAdminFilters();
  showToast('團隊順序已更新並同步至雲端', 'success');
}

// ===========================
// CASE ID MANAGEMENT MODAL
// ===========================
function showCasesModal(id) {
  const team = state.teams.find(t => t.id === id);
  if (!team) return;
  if (!Array.isArray(team.cases)) team.cases = [];

  window._editingTeamId = id;
  renderCasesModalContent(team);
}

function renderCasesModalContent(team) {
  const code = team.code || 'A';
  const cases = team.cases || [];

  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <h3 class="modal-title" style="margin-bottom:0">📋 個案標號管理 — ${team.name}</h3>
      <span class="team-code-badge">代號 ${code}</span>
    </div>
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
      設定該機構專屬的個案標號。服事夥伴填表時即可直接透過下拉選單挑選，不必手動打字。
    </p>

    <!-- 現有標號區塊 -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <label class="field-label" style="margin-bottom:0">現有個案標號（共 ${cases.length} 個）</label>
      ${cases.length > 0 ? `<button type="button" class="btn-refresh" style="color:var(--accent-rose)" onclick="clearAllCases('${team.id}')">全部清空</button>` : ''}
    </div>
    <div class="case-tags-container">
      ${cases.length === 0 ? '<span style="color:var(--text-muted); font-size:12px; padding:8px;">尚未建立個案標號，請使用下方快速產生或手動加入。</span>' : ''}
      ${cases.map((c, i) => `
        <span class="case-tag">
          ${c}
          <button type="button" class="case-tag-del" onclick="deleteCaseTag('${team.id}', ${i})" title="刪除此標號">✕</button>
        </span>
      `).join('')}
    </div>

    <!-- 快速批次產生 -->
    <div class="case-batch-box">
      <div style="font-size:13px; font-weight:600; color:var(--text-primary)">⚡ 快速批次產生標號</div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:4px;">
          <span style="font-size:12px; color:var(--text-muted)">前綴:</span>
          <input type="text" id="batch-prefix" class="field-input input-sm" style="width:70px" value="${code}-" placeholder="前綴" />
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <span style="font-size:12px; color:var(--text-muted)">從:</span>
          <input type="number" id="batch-start" class="field-input input-sm" style="width:65px" value="1" min="1" />
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <span style="font-size:12px; color:var(--text-muted)">至:</span>
          <input type="number" id="batch-end" class="field-input input-sm" style="width:65px" value="20" min="1" />
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="batchGenerateCases('${team.id}')" style="flex:1; min-width:90px;">批次產生</button>
      </div>
    </div>

    <!-- 手動單筆或整批貼上 -->
    <div style="margin-top:16px;">
      <label class="field-label">手動新增標號（支援空格、逗號或多行整批貼上）</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="manual-case-input" class="field-input input-sm" placeholder="輸入標號（例：${code}-21、${code}-22）" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addManualCases('${team.id}');}" />
        <button type="button" class="btn btn-primary btn-sm" onclick="addManualCases('${team.id}')">加入</button>
      </div>
    </div>

    <div class="modal-actions" style="margin-top:24px;">
      <button class="btn btn-primary btn-full" onclick="saveCasesAndClose('${team.id}')">完成並同步至雲端</button>
    </div>
  `);
}

function batchGenerateCases(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;
  const prefix = document.getElementById('batch-prefix').value.trim() || `${team.code || 'A'}-`;
  const start = parseInt(document.getElementById('batch-start').value, 10) || 1;
  const end = parseInt(document.getElementById('batch-end').value, 10) || 20;

  if (start > end) return showToast('起訖數值不正確', 'error');
  if (end - start > 200) return showToast('一次最多產生 200 個標號', 'error');

  if (!Array.isArray(team.cases)) team.cases = [];
  const existingSet = new Set(team.cases);
  let count = 0;

  for (let i = start; i <= end; i++) {
    const formatted = `${prefix}${String(i).padStart(2, '0')}`;
    if (!existingSet.has(formatted)) {
      team.cases.push(formatted);
      existingSet.add(formatted);
      count++;
    }
  }

  renderCasesModalContent(team);
  showToast(`已成功產生 ${count} 個新標號`, 'success');
}

function addManualCases(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;
  const input = document.getElementById('manual-case-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return showToast('請輸入個案標號', 'error');

  const items = raw.split(/[\s,，、\n]+/).map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(team.cases)) team.cases = [];
  const existingSet = new Set(team.cases);
  let added = 0;

  items.forEach(c => {
    if (!existingSet.has(c)) {
      team.cases.push(c);
      existingSet.add(c);
      added++;
    }
  });

  input.value = '';
  renderCasesModalContent(team);
  showToast(`已加入 ${added} 個個案標號`, 'success');
}

function deleteCaseTag(teamId, index) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team || !Array.isArray(team.cases)) return;
  team.cases.splice(index, 1);
  renderCasesModalContent(team);
}

function clearAllCases(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;
  if (!confirm(`確定要清空「${team.name}」的所有個案標號？`)) return;
  team.cases = [];
  renderCasesModalContent(team);
}

function saveCasesAndClose(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  saveToStorage();
  saveTeamsToSheets();
  closeModal();
  renderTeamsAdmin();
  showToast(`「${team?.name}」個案標號已更新並同步至所有裝置`, 'success');
}

function showAddTeamModal() {
  const defaultCode = getNextAvailableCode();
  const emojis = ['🌸', '🌿', '🕊️', '✨', '🌟', '🤝', '🎯', '🌱', '☀️', '🌈', '🎁', '💖'];
  window._selectedEmoji = ''; // 預設無圖示

  openModal(`
    <h3 class="modal-title">新增事工團隊</h3>
    <div class="field-group">
      <label class="field-label required">團隊名稱</label>
      <input type="text" id="new-team-name" class="field-input" placeholder="例：希望之光" />
    </div>
    <div class="field-group">
      <label class="field-label required">機構英文代號（個案標號前綴）</label>
      <input type="text" id="new-team-code" class="field-input" value="${defaultCode}" maxlength="4" style="text-transform:uppercase" placeholder="例：A 或 B" />
      <span style="font-size:12px; color:var(--text-muted); margin-top:2px">每個機構專屬字母代號，如天使樹為 A，個案標號將為 A-01、A-02...</span>
    </div>
    <div class="field-group">
      <label class="field-label">預先產生個案標號數量</label>
      <input type="number" id="new-team-case-count" class="field-input" value="10" min="0" max="100" placeholder="建立時自動預建標號數（預設 10 個）" />
    </div>
    <div class="field-group">
      <label class="field-label">團隊圖示（選填，預設無圖示）</label>
      <div class="emoji-picker-row">
        <button type="button" class="emoji-opt-btn selected" onclick="selectTeamEmoji(this, '')">無圖示</button>
        ${emojis.map(e => `<button type="button" class="emoji-opt-btn" onclick="selectTeamEmoji(this, '${e}')">${e}</button>`).join('')}
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">代表色</label>
      <input type="color" id="new-team-color" value="#6366f1" class="field-input" style="height:44px; padding:4px;" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="addTeam()">建立團隊</button>
    </div>
  `);
}

function showEditTeamModal(id) {
  const team = state.teams.find(t => t.id === id);
  if (!team) return;
  const emojis = ['🌸', '🌿', '🕊️', '✨', '🌟', '🤝', '🎯', '🌱', '☀️', '🌈', '🎁', '💖'];
  window._selectedEmoji = team.emoji || '';

  openModal(`
    <h3 class="modal-title">編輯事工團隊</h3>
    <div class="field-group">
      <label class="field-label required">團隊名稱</label>
      <input type="text" id="edit-team-name" class="field-input" value="${team.name}" />
    </div>
    <div class="field-group">
      <label class="field-label required">機構英文代號</label>
      <input type="text" id="edit-team-code" class="field-input" value="${team.code || 'A'}" maxlength="4" style="text-transform:uppercase" />
      <span style="font-size:12px; color:var(--text-muted); margin-top:2px">修改代號將作為此團隊個案標號的前綴</span>
    </div>
    <div class="field-group">
      <label class="field-label">團隊圖示（選填）</label>
      <div class="emoji-picker-row">
        <button type="button" class="emoji-opt-btn ${!window._selectedEmoji ? 'selected' : ''}" onclick="selectTeamEmoji(this, '')">無圖示</button>
        ${emojis.map(e => `<button type="button" class="emoji-opt-btn ${window._selectedEmoji === e ? 'selected' : ''}" onclick="selectTeamEmoji(this, '${e}')">${e}</button>`).join('')}
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">代表色</label>
      <input type="color" id="edit-team-color" value="${team.color || '#6366f1'}" class="field-input" style="height:44px; padding:4px;" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="updateTeam('${team.id}')">儲存變更</button>
    </div>
  `);
}

function selectTeamEmoji(btn, emoji) {
  document.querySelectorAll('.emoji-opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  window._selectedEmoji = emoji;
}

function addTeam() {
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) return showToast('請輸入團隊名稱', 'error');
  const code = (document.getElementById('new-team-code').value.trim() || getNextAvailableCode()).toUpperCase();
  const caseCount = parseInt(document.getElementById('new-team-case-count').value, 10) || 0;

  const cases = [];
  for (let i = 1; i <= caseCount; i++) {
    cases.push(`${code}-${String(i).padStart(2, '0')}`);
  }

  const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  const team = {
    id,
    name,
    code,
    emoji: window._selectedEmoji || '',
    color: document.getElementById('new-team-color').value,
    cases,
    createdAt: new Date().toISOString(),
  };

  state.teams.push(team);
  saveToStorage();
  saveTeamsToSheets();  // sync to all devices
  closeModal();
  renderTeamsAdmin();
  renderTeamList();
  setupAdminFilters();
  showToast(`團隊「${name}」已建立，代號【${code}】，預建 ${cases.length} 個標號`, 'success');
}

function updateTeam(id) {
  const name = document.getElementById('edit-team-name').value.trim();
  if (!name) return showToast('請輸入團隊名稱', 'error');
  const code = (document.getElementById('edit-team-code').value.trim() || 'A').toUpperCase();
  const team = state.teams.find(t => t.id === id);
  if (!team) return;

  team.name = name;
  team.code = code;
  team.emoji = window._selectedEmoji || '';
  team.color = document.getElementById('edit-team-color').value;

  saveToStorage();
  saveTeamsToSheets();
  closeModal();
  renderTeamsAdmin();
  renderTeamList();
  setupAdminFilters();
  showToast(`團隊「${name}」已更新並同步`, 'success');
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
        📱 產生夥伴分享連結
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
      headers.forEach((h, i) => {
        let cell = row[i];
        if (cell instanceof Date) {
          const y = cell.getFullYear();
          const m = String(cell.getMonth() + 1).padStart(2, '0');
          const d = String(cell.getDate()).padStart(2, '0');
          cell = y + '-' + m + '-' + d;
        }
        obj[h] = cell;
      });
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

  // 新增紀錄（服事夥伴填表使用）
  if (e.parameter && e.parameter.data) {
    try {
      const rec = JSON.parse(e.parameter.data);
      const sheet = getSheet('紀錄');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['提交日期','服事夥伴姓名','英文姓名','團隊','個案標號',
          '關懷組別','月份','本月關懷','家庭狀況','兒童狀況',
          '關懷態度','互動情況','需要協助','備註']);
      }
      let monthStr = rec.month || '';
      if (typeof monthStr === 'string' && monthStr.indexOf('T') !== -1) {
        monthStr = monthStr.split('T')[0];
      }
      sheet.appendRow([
        new Date(rec.submittedAt).toLocaleString('zh-TW'),
        rec.volunteerName, rec.volunteerNameEn, rec.teamName, rec.familyId,
        rec.group, monthStr, rec.visited,
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
