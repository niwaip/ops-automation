// -------------------------------------------------------------
// Mock ERP Portal Application Logic
// Standalone pure Javascript for routing, state, and simulation
// -------------------------------------------------------------

// Default Mock Data
const DEFAULT_PROJECTS = [
  {
    id: 'PRJ-2026-001',
    name: 'AI搭載スマート倉庫管理システム導入',
    customer: '大和ロジスティクス株式会社',
    amount: 15000000,
    profit: 3825000,
    grossMargin: 25.5, // 25.5% (>= 20%, Auto-approvable)
    status: 'pending',
    history: [
      { action: '案件登録', operator: 'システム', time: '2026-06-15 09:12:05' },
      { action: '見積書提出', operator: '営業担当者 A', time: '2026-06-15 10:00:00' },
      { action: '審査フェーズ開始', operator: 'システム', time: '2026-06-15 10:05:00' },
    ],
  },
  {
    id: 'PRJ-2026-002',
    name: 'グローバルECサイト多言語化対応開発',
    customer: '越境トレード株式会社',
    amount: 8500000,
    profit: 1513000,
    grossMargin: 17.8, // 17.8% (< 20%, Requires takeover)
    status: 'pending',
    history: [
      { action: '案件登録', operator: 'システム', time: '2026-06-15 09:20:10' },
      { action: '見積書提出', operator: '営業担当者 B', time: '2026-06-15 10:15:00' },
      {
        action: '自動審査実行：毛利率 17.8% が基準(20%)未満のため一時停止。人工接管待ち。',
        operator: 'システム監査',
        time: '2026-06-15 10:15:05',
      },
    ],
  },
  {
    id: 'PRJ-2026-003',
    name: '社内基幹システムAWS移行インフラ構築',
    customer: '東京デジタルソリューションズ',
    amount: 22000000,
    profit: 2640000,
    grossMargin: 12.0, // 12.0% (< 20%, Requires takeover)
    status: 'pending',
    history: [
      { action: '案件登録', operator: 'システム', time: '2026-06-15 09:30:00' },
      { action: '見積書提出', operator: 'インフラ営業 G', time: '2026-06-15 10:30:00' },
      {
        action: '自動審査実行：毛利率 12.0% が基準(20%)未満のため一時停止。人工接管待ち。',
        operator: 'システム監査',
        time: '2026-06-15 10:30:10',
      },
    ],
  },
  {
    id: 'PRJ-2026-004',
    name: 'SaaS型勤怠管理システムOEMライセンス契約',
    customer: '合同会社ワークスマート',
    amount: 5000000,
    profit: 2100000,
    grossMargin: 42.0, // 42.0% (Already approved)
    status: 'approved',
    history: [
      { action: '案件登録', operator: 'システム', time: '2026-06-14 11:00:00' },
      { action: '見積書提出', operator: '営業担当者 A', time: '2026-06-14 11:30:00' },
      {
        action: '自動審査：毛利率 42.0% (基準20%以上) のため自動承認完了',
        operator: 'システム自動承認',
        time: '2026-06-14 11:30:05',
      },
    ],
  },
  {
    id: 'PRJ-2026-005',
    name: 'オフィスセキュリティ機器導入・保守パッケージ',
    customer: '新日本ビルマネジメント株式会社',
    amount: 3200000,
    profit: 272000,
    grossMargin: 8.5, // 8.5% (Already rejected)
    status: 'rejected',
    history: [
      { action: '案件登録', operator: 'システム', time: '2026-06-14 14:00:00' },
      { action: '見積書提出', operator: '営業担当者 C', time: '2026-06-14 14:45:00' },
      {
        action: '自動審査：毛利率 8.5% が基準未満のため人工査定へ移行',
        operator: 'システム',
        time: '2026-06-14 14:45:05',
      },
      {
        action: '案件却下：利益率が極めて低く、リスク許容外のため却下とする',
        operator: '審査役 山田',
        time: '2026-06-14 16:20:00',
      },
    ],
  },
];

// App State
let state = {
  projects: [],
  settings: {
    threshold: 20.0,
  },
  notifications: [],
  activeProjectId: null,
  currentFilter: 'all',
  isLoggedIn: false,
  mfaRequired: false,
  mfaCode: '',
};

// Formatter Helpers
const formatCurrency = (val) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val);
};

const formatPercent = (val) => {
  return val.toFixed(1) + '%';
};

const getNowTimeString = () => {
  const now = new Date();
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0') +
    ':' +
    String(now.getSeconds()).padStart(2, '0')
  );
};

// Persistent State Layer
const loadState = () => {
  const savedProjects = localStorage.getItem('mock_erp_projects');
  const savedSettings = localStorage.getItem('mock_erp_settings');
  const savedNotifications = localStorage.getItem('mock_erp_notifications');
  const savedLogin = localStorage.getItem('mock_erp_logged_in');

  if (savedProjects) {
    state.projects = JSON.parse(savedProjects);
  } else {
    state.projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
    saveProjectsState();
  }

  if (savedSettings) {
    state.settings = JSON.parse(savedSettings);
  } else {
    saveSettingsState();
  }

  if (savedNotifications) {
    state.notifications = JSON.parse(savedNotifications);
  } else {
    state.notifications = [
      {
        id: 'notif-1',
        title: '人工介入待ち案件があります',
        desc: '案件 PRJ-2026-002 (粗利率 17.8%) は自動承認基準を下回るため人工介入待ちです。',
        time: getNowTimeString(),
        unread: true,
      },
    ];
    saveNotificationsState();
  }

  state.isLoggedIn = savedLogin === 'true';
};

const saveProjectsState = () =>
  localStorage.setItem('mock_erp_projects', JSON.stringify(state.projects));
const saveSettingsState = () =>
  localStorage.setItem('mock_erp_settings', JSON.stringify(state.settings));
const saveNotificationsState = () =>
  localStorage.setItem('mock_erp_notifications', JSON.stringify(state.notifications));

// SPA Hash Router
const initRouter = () => {
  const handleRouting = () => {
    const hash = window.location.hash || '#dashboard';
    const tabName = hash.replace('#', '');
    switchTab(tabName, false);
  };

  window.addEventListener('hashchange', handleRouting);
  // Initial run
  handleRouting();
};

const switchTab = (tabName, updateHash = true) => {
  // Update nav UI active class
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update tabs views display
  document.querySelectorAll('.content-view-container .tab-view').forEach((view) => {
    if (view.id === `view-${tabName}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  if (updateHash) {
    window.location.hash = `#${tabName}`;
  }

  // Reset Approvals view state when entering
  if (tabName === 'approvals') {
    // Show table list by default
    document.getElementById('approvals-list-subview').classList.remove('hidden');
    document.getElementById('approvals-detail-subview').classList.add('hidden');
    state.activeProjectId = null;
    renderProjectsTable();
  } else if (tabName === 'logs') {
    renderAuditLogs();
  } else if (tabName === 'dashboard') {
    renderDashboardMetrics();
  } else if (tabName === 'settings') {
    document.getElementById('setting-threshold').value = state.settings.threshold;
  } else if (tabName === 'new-request') {
    // Setup default project code
    document.getElementById('req-project-code').value =
      'PRJ-' + new Date().getFullYear() + '-' + String(state.projects.length + 1).padStart(3, '0');
    // Reset form
    document.getElementById('new-request-form').reset();
    document.getElementById('req-gross-margin').value = '0.0';
    document.getElementById('uploaded-file-info').classList.add('hidden');
    document.getElementById('upload-progress-container').classList.add('hidden');
  }
};

// Login state check and screen toggles
const setAuthStage = (stage) => {
  document.body.setAttribute('data-auth-stage', stage);
  const credentialsScreen = document.getElementById('login-credentials-screen');
  const mfaScreen = document.getElementById('login-mfa-screen');

  if (credentialsScreen) {
    credentialsScreen.setAttribute('data-auth-visible', stage === 'credentials' ? 'true' : 'false');
    credentialsScreen.setAttribute('aria-hidden', stage === 'credentials' ? 'false' : 'true');
  }

  if (mfaScreen) {
    mfaScreen.setAttribute('data-mfa-visible', stage === 'mfa' ? 'true' : 'false');
    mfaScreen.setAttribute('aria-hidden', stage === 'mfa' ? 'false' : 'true');
  }
};

const checkLoginState = () => {
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('main-app-container');

  const urlParams = new URLSearchParams(window.location.search);
  const forceMfa = urlParams.get('force_mfa') === 'true';
  const skipMfa = urlParams.get('skip_mfa') === 'true';

  if (state.isLoggedIn) {
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    setAuthStage('app');
  } else {
    loginContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');

    if (state.mfaRequired || (forceMfa && !skipMfa)) {
      showMfaScreen();
    } else {
      showCredentialsScreen();
    }
  }
};

const showCredentialsScreen = () => {
  document.getElementById('login-credentials-screen').classList.remove('hidden');
  document.getElementById('login-mfa-screen').classList.add('hidden');
  state.mfaRequired = false;
  setAuthStage('credentials');
};

const showMfaScreen = () => {
  document.getElementById('login-credentials-screen').classList.add('hidden');
  document.getElementById('login-mfa-screen').classList.remove('hidden');
  state.mfaRequired = true;
  setAuthStage('mfa');

  if (!state.mfaCode) {
    state.mfaCode = String(Math.floor(100000 + Math.random() * 900000));
  }
  document.getElementById('mfa-code-display').textContent = state.mfaCode;
};

// Render Functions
const renderDashboardMetrics = () => {
  const pendingCount = state.projects.filter((p) => p.status === 'pending').length;
  const approvedCount = state.projects.filter((p) => p.status === 'approved').length;

  // Calculate Avg Gross margin of all approved projects
  const approvedProjects = state.projects.filter((p) => p.status === 'approved');
  let avgMargin = 24.2; // default fallback if empty
  if (approvedProjects.length > 0) {
    const totalMargin = approvedProjects.reduce((sum, p) => sum + p.grossMargin, 0);
    avgMargin = totalMargin / approvedProjects.length;
  }

  document.getElementById('dashboard-pending-count').textContent = pendingCount;
  document.getElementById('dashboard-approved-count').textContent = approvedCount;
  document.getElementById('dashboard-avg-margin').textContent = formatPercent(avgMargin);
};

const renderProjectsTable = () => {
  const tableBody = document.getElementById('projects-table-body');
  tableBody.innerHTML = '';

  const filtered = state.projects.filter((p) => {
    if (state.currentFilter === 'all') return true;
    return p.status === state.currentFilter;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 2rem;">案件データが見つかりません</td></tr>`;
    return;
  }

  filtered.forEach((project) => {
    const tr = document.createElement('tr');
    tr.id = `project-row-${project.id}`;
    tr.setAttribute('data-ai-row-key', project.id);
    tr.setAttribute('data-ai-row-index', String(filtered.indexOf(project)));
    tr.setAttribute('data-ai-entity-type', 'approvalProject');
    tr.setAttribute('data-ai-entity-id', project.id);

    // Status badges
    let statusBadge = '';
    if (project.status === 'pending') {
      statusBadge = `<span class="badge badge-pending">保留中</span>`;
    } else if (project.status === 'approved') {
      statusBadge = `<span class="badge badge-approved">承認済み</span>`;
    } else if (project.status === 'rejected') {
      statusBadge = `<span class="badge badge-rejected">却下済み</span>`;
    }

    // Gross margin color logic
    const isBelowThreshold = project.grossMargin < state.settings.threshold;
    const marginClass = isBelowThreshold ? 'margin-low' : 'margin-high';

    tr.innerHTML = `
      <td data-ai-field="projectCode"><strong>${project.id}</strong></td>
      <td data-ai-field="projectName">${project.name}</td>
      <td data-ai-field="customerName">${project.customer}</td>
      <td data-ai-field="amount">${formatCurrency(project.amount)}</td>
      <td data-ai-field="grossMargin"><span class="gross-margin-cell ${marginClass}">${formatPercent(project.grossMargin)}</span></td>
      <td>${statusBadge}</td>
      <td class="align-right">
        <button
          class="btn btn-secondary btn-sm"
          data-ai-action="detail"
          data-ai-stable-name="open-project-detail"
          onclick="event.stopPropagation(); viewProjectDetails('${project.id}')"
        >詳細</button>
      </td>
    `;

    tr.addEventListener('click', () => {
      viewProjectDetails(project.id);
    });

    tableBody.appendChild(tr);
  });
};

const viewProjectDetails = (id) => {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;

  state.activeProjectId = id;

  // Toggle visible panels
  document.getElementById('approvals-list-subview').classList.add('hidden');
  document.getElementById('approvals-detail-subview').classList.remove('hidden');

  // Populate project details
  document.getElementById('detail-project-name').textContent = project.name;
  document.getElementById('detail-project-code').textContent = project.id;
  document.getElementById('detail-customer-name').textContent = project.customer;
  document.getElementById('detail-amount').textContent = formatCurrency(project.amount);
  document.getElementById('detail-profit').textContent = formatCurrency(project.profit);

  const gmElem = document.getElementById('detail-gross-margin');
  gmElem.textContent = formatPercent(project.grossMargin);

  // Status badge on detail page
  const statusBadge = document.getElementById('detail-project-status');
  statusBadge.className = 'badge';
  if (project.status === 'pending') {
    statusBadge.textContent = '保留中';
    statusBadge.classList.add('badge-pending');
  } else if (project.status === 'approved') {
    statusBadge.textContent = '承認済み';
    statusBadge.classList.add('badge-approved');
  } else if (project.status === 'rejected') {
    statusBadge.textContent = '却下済み';
    statusBadge.classList.add('badge-rejected');
  }

  // Margin threshold warning logic
  const isBelowThreshold = project.grossMargin < state.settings.threshold;
  const marginCard = document.getElementById('detail-margin-card');
  const takeoverPanel = document.getElementById('takeover-alert-panel');

  // Reset classes
  marginCard.classList.remove('margin-low-warning', 'margin-high-success');
  gmElem.classList.remove('text-low', 'text-high');

  if (isBelowThreshold) {
    marginCard.classList.add('margin-low-warning');
    gmElem.classList.add('text-low');
    if (project.status === 'pending') {
      takeoverPanel.classList.remove('hidden');
    } else {
      takeoverPanel.classList.add('hidden'); // Only show warning when pending
    }
  } else {
    marginCard.classList.add('margin-high-success');
    gmElem.classList.add('text-high');
    takeoverPanel.classList.add('hidden');
  }

  // Enable/Disable decision buttons based on status
  const btnApprove = document.getElementById('btn-approve-project');
  const btnReject = document.getElementById('btn-reject-project');
  if (project.status === 'pending') {
    btnApprove.disabled = false;
    btnReject.disabled = false;
  } else {
    btnApprove.disabled = true;
    btnReject.disabled = true;
  }

  // Render local audit timeline
  const timeline = document.getElementById('detail-audit-timeline');
  timeline.innerHTML = '';
  project.history.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'timeline-item';

    // Choose marker color
    let markerColor = 'info';
    if (h.action.includes('承認')) markerColor = 'success';
    if (h.action.includes('却下')) markerColor = 'danger';
    if (h.action.includes('基準未満') || h.action.includes('一時停止')) markerColor = 'warning';

    li.innerHTML = `
      <span class="timeline-marker ${markerColor}"></span>
      <div class="timeline-content">
        <span class="timeline-text">${h.action} (担当: ${h.operator})</span>
        <span class="timeline-time">${h.time}</span>
      </div>
    `;
    timeline.appendChild(li);
  });
};

const renderAuditLogs = () => {
  const tableBody = document.getElementById('logs-table-body');
  tableBody.innerHTML = '';

  // Accumulate all histories
  let allLogs = [];
  state.projects.forEach((p) => {
    p.history.forEach((h) => {
      allLogs.push({
        id: p.id,
        name: p.name,
        action: h.action,
        operator: h.operator,
        time: h.time,
      });
    });
  });

  // Sort by time descending
  allLogs.sort((a, b) => b.time.localeCompare(a.time));

  if (allLogs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center;">監査ログがありません。</td></tr>`;
    return;
  }

  allLogs.forEach((log) => {
    const tr = document.createElement('tr');

    let label = 'info';
    if (log.action.includes('承認')) label = 'success';
    if (log.action.includes('却下')) label = 'danger';
    if (log.action.includes('一時停止')) label = 'warning';

    tr.innerHTML = `
      <td class="text-muted">${log.time}</td>
      <td><strong>${log.operator}</strong></td>
      <td><span class="badge badge-${label}">${log.action.split('：')[0]}</span></td>
      <td>${log.id} - ${log.name}<br><small class="text-secondary">${log.action}</small></td>
      <td><span class="status-dot online"></span> 完了</td>
    `;
    tableBody.appendChild(tr);
  });
};

// Decision Actions Handler
const updateProjectStatus = (status) => {
  const projectId = state.activeProjectId;
  const projectIndex = state.projects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) return;

  const project = state.projects[projectIndex];
  project.status = status;

  const operator = 'Admin User';
  const nowStr = getNowTimeString();
  const actionText = status === 'approved' ? '承認完了' : '案件審査却下';

  // Update project audit history
  project.history.push({
    action: `${actionText}：人工承認によりステータスが更新されました。`,
    operator: operator,
    time: nowStr,
  });

  saveProjectsState();

  // Add system notification
  addNotification(
    `案件ステータス更新: ${project.id}`,
    `案件「${project.name}」が人工承認により ${status === 'approved' ? '承認' : '却下'} されました。`,
    nowStr
  );

  // Reload views
  viewProjectDetails(projectId);
  renderDashboardMetrics();
};

// Notifications Logic
const addNotification = (title, desc, time = getNowTimeString()) => {
  const id = `notif-${Date.now()}`;
  state.notifications.unshift({
    id: id,
    title: title,
    desc: desc,
    time: time,
    unread: true,
  });
  saveNotificationsState();
  renderNotifications();
};

const renderNotifications = () => {
  const notifList = document.getElementById('notification-list');
  const badge = document.getElementById('notification-count');

  const unreadCount = state.notifications.filter((n) => n.unread).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  notifList.innerHTML = '';
  if (state.notifications.length === 0) {
    notifList.innerHTML = `<div class="empty-notification-state">通知はありません</div>`;
    return;
  }

  state.notifications.forEach((n) => {
    const item = document.createElement('div');
    item.className = `notification-item ${n.unread ? 'unread' : ''}`;
    item.id = `notif-item-${n.id}`;

    item.innerHTML = `
      <div class="notification-title">${n.title}</div>
      <div class="notification-desc">${n.desc}</div>
      <div class="notification-time">${n.time}</div>
    `;

    // Mark as read on click
    item.addEventListener('click', () => {
      n.unread = false;
      saveNotificationsState();
      renderNotifications();
    });

    notifList.appendChild(item);
  });
};

// UI Interactions Binding
const initEventBindings = () => {
  // Back to list
  document.getElementById('btn-back-to-list').addEventListener('click', () => {
    document.getElementById('approvals-list-subview').classList.remove('hidden');
    document.getElementById('approvals-detail-subview').classList.add('hidden');
    state.activeProjectId = null;
    renderProjectsTable();
  });

  // Table status filters
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      state.currentFilter = e.target.getAttribute('data-filter');
      renderProjectsTable();
    });
  });

  // Decision actions
  document.getElementById('btn-approve-project').addEventListener('click', () => {
    updateProjectStatus('approved');
  });

  document.getElementById('btn-reject-project').addEventListener('click', () => {
    updateProjectStatus('rejected');
  });

  // Notification Bell Toggle
  const bellTrigger = document.getElementById('bell-dropdown-trigger');
  const bellPanel = document.getElementById('bell-dropdown-panel');

  bellTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    bellPanel.classList.toggle('show');
  });

  // Hide bell panel when clicking outside
  document.addEventListener('click', () => {
    bellPanel.classList.remove('show');
  });

  // Clear notifications
  document.getElementById('clear-notifications-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.notifications.forEach((n) => (n.unread = false));
    saveNotificationsState();
    renderNotifications();
  });

  // Settings Save
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const inputVal = parseFloat(document.getElementById('setting-threshold').value);
    if (!isNaN(inputVal) && inputVal >= 0 && inputVal <= 100) {
      state.settings.threshold = inputVal;
      saveSettingsState();

      const nowStr = getNowTimeString();
      addNotification(
        'システム設定変更',
        `自動承認のしきい値が ${formatPercent(inputVal)} に更新されました。`,
        nowStr
      );

      // Re-evaluate current projects history (optional: just trigger a notification logs)
      alert('設定を保存しました。しきい値: ' + formatPercent(inputVal));
    } else {
      alert('0から100までの正しい数値を入力してください。');
    }
  });

  // Reset Mock Data
  document.getElementById('reset-mock-data-btn').addEventListener('click', () => {
    localStorage.removeItem('mock_erp_projects');
    localStorage.removeItem('mock_erp_notifications');
    loadState();
    renderProjectsTable();
    renderDashboardMetrics();
    renderNotifications();
    alert('モックデータをリセットしました。');
  });

  // Global search mock
  document.getElementById('global-search-input').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (window.location.hash !== '#approvals') {
      switchTab('approvals');
    }

    // Filter table by ID or Name
    const rows = document.querySelectorAll('#projects-table-body tr');
    rows.forEach((row) => {
      if (row.cells.length < 2) return;
      const idText = row.cells[0].textContent.toLowerCase();
      const nameText = row.cells[1].textContent.toLowerCase();
      if (idText.includes(val) || nameText.includes(val)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });

  // Login event handlers
  document.getElementById('btn-submit-login').addEventListener('click', () => {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();

    if (user === 'admin' && pass === 'admin') {
      const urlParams = new URLSearchParams(window.location.search);
      const forceMfa = urlParams.get('force_mfa') === 'true';
      const skipMfa = urlParams.get('skip_mfa') === 'true';

      // Keep MFA deterministic for local verification: disabled by default,
      // enabled only when the page is opened with force_mfa=true.
      const triggerMfa = forceMfa && !skipMfa;

      if (triggerMfa) {
        showMfaScreen();
      } else {
        state.isLoggedIn = true;
        localStorage.setItem('mock_erp_logged_in', 'true');
        checkLoginState();

        const nowStr = getNowTimeString();
        addNotification('システムログイン', '管理者がシステムにログインしました。', nowStr);
      }
    } else {
      alert('ユーザー名またはパスワードが正しくありません。(admin / admin)');
    }
  });

  document.getElementById('btn-submit-mfa').addEventListener('click', () => {
    const inputCode = document.getElementById('login-mfa-code').value.trim();

    if (inputCode === state.mfaCode || inputCode === '123456') {
      state.isLoggedIn = true;
      state.mfaRequired = false;
      state.mfaCode = '';
      localStorage.setItem('mock_erp_logged_in', 'true');
      checkLoginState();

      const nowStr = getNowTimeString();
      addNotification('MFA認証完了', '多要素認証(MFA)に成功し、ログインしました。', nowStr);
    } else {
      alert('認証コードが正しくありません。');
    }
  });

  // Logout handler on clicking sidebar footer
  document.querySelector('.sidebar-footer').addEventListener('click', () => {
    if (confirm('ログアウトしますか？')) {
      state.isLoggedIn = false;
      localStorage.removeItem('mock_erp_logged_in');
      location.reload();
    }
  });

  // New application form auto margin calculation
  const calculateGrossMargin = () => {
    const amount = parseFloat(document.getElementById('req-amount').value);
    const profit = parseFloat(document.getElementById('req-profit').value);
    const marginInput = document.getElementById('req-gross-margin');

    if (!isNaN(amount) && !isNaN(profit) && amount > 0) {
      const margin = (profit / amount) * 100;
      marginInput.value = margin.toFixed(1);
    } else {
      marginInput.value = '0.0';
    }
  };

  document.getElementById('req-amount').addEventListener('input', calculateGrossMargin);
  document.getElementById('req-profit').addEventListener('input', calculateGrossMargin);

  // File Upload Handlers
  const fileInput = document.getElementById('req-file-input');
  const dropzone = document.getElementById('upload-dropzone');
  const selectFileBtn = document.getElementById('btn-select-file');

  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  const handleFileUpload = (file) => {
    const fileInfo = document.getElementById('uploaded-file-info');
    const fileName = document.getElementById('uploaded-file-name');
    const fileSize = document.getElementById('uploaded-file-size');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    fileName.textContent = file.name;
    fileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    fileInfo.classList.remove('hidden');
    progressContainer.classList.remove('hidden');

    let progress = 0;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    progressBar.style.background = 'var(--color-primary)';

    const interval = setInterval(() => {
      progress += 10;
      progressBar.style.width = progress + '%';
      progressText.textContent = progress + '%';
      if (progress >= 100) {
        clearInterval(interval);
        progressBar.style.background = 'var(--color-success)';
      }
    }, 100);
  };

  // Submit Application Request Handler
  document.getElementById('btn-submit-request').addEventListener('click', () => {
    const code = document.getElementById('req-project-code').value;
    const name = document.getElementById('req-project-name').value.trim();
    const customer = document.getElementById('req-customer-name').value;
    const amount = parseFloat(document.getElementById('req-amount').value);
    const profit = parseFloat(document.getElementById('req-profit').value);
    const margin = parseFloat(document.getElementById('req-gross-margin').value);
    const dept = document.querySelector('input[name="req-dept"]:checked').value;
    const priority = document.getElementById('req-priority').value;
    const notes = document.getElementById('req-notes').value.trim();

    if (!name || !customer || isNaN(amount) || isNaN(profit)) {
      alert('必須項目(*)を入力してください。');
      return;
    }

    const newProject = {
      id: code,
      name: name,
      customer: customer,
      amount: amount,
      profit: profit,
      grossMargin: margin,
      status: 'pending',
      history: [
        {
          action: `新規申請登録 (部署: ${dept}, 優先度: ${priority})`,
          operator: '営業担当者',
          time: getNowTimeString(),
        },
        { action: '自動審査フェーズ開始', operator: 'システム', time: getNowTimeString() },
      ],
    };

    const isBelowThreshold = margin < state.settings.threshold;
    if (isBelowThreshold) {
      newProject.history.push({
        action: `自動審査実行：毛利率 ${margin.toFixed(1)}% が基準(${state.settings.threshold.toFixed(1)}%)未満のため一時停止。人工接管待ち。`,
        operator: 'システム監査',
        time: getNowTimeString(),
      });
    }

    state.projects.push(newProject);
    saveProjectsState();

    addNotification(
      `新規案件登録: ${code}`,
      `案件「${name}」が新しく登録されました。毛利率: ${margin.toFixed(1)}%`,
      getNowTimeString()
    );

    alert('案件を登録しました。');
    switchTab('approvals');
  });
};

// App Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initRouter();
  initEventBindings();
  renderNotifications();
  renderDashboardMetrics();

  // Check auth state
  checkLoginState();
});
