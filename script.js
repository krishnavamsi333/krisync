// ── Firebase is loaded via CDN <script> tags in index.html ───────────────────
// No imports needed — firebase, firestore are global variables

// ── Default Data ──────────────────────────────────────────────────────────────
const defaultData = [
    { id: 1,  text: "Python: Basics & OOP",            phase: "phase1", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 2,  text: "C++: Pointers & Memory",          phase: "phase1", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 3,  text: "Linux: CLI & Shell Scripting",     phase: "phase1", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 4,  text: "Git: Version Control",             phase: "phase1", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 5,  text: "Data Structures & Algorithms",     phase: "phase1", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 6,  text: "Math: Linear Algebra & Calculus",  phase: "phase1", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 7,  text: "ROS 2: Topics & Services",         phase: "phase2", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 8,  text: "ROS 2: Actions & Parameters",      phase: "phase2", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 9,  text: "URDF & Robot Modeling",            phase: "phase2", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 10, text: "Gazebo Simulation",                phase: "phase2", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 11, text: "TF2: Coordinate Transforms",       phase: "phase2", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 12, text: "UART, I2C, SPI, CAN",             phase: "phase3", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 13, text: "Microcontroller Programming",      phase: "phase3", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 14, text: "Sensor Integration",               phase: "phase3", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 15, text: "Motor Control & PWM",              phase: "phase3", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 16, text: "Nav2: Autonomous Pathing",         phase: "phase4", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 17, text: "Computer Vision: OpenCV",          phase: "phase4", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 18, text: "SLAM: Mapping & Localization",     phase: "phase4", completed: false, priority: "high",   logEntries: [], tags: [], dueDate: null },
    { id: 19, text: "Machine Learning Basics",          phase: "phase4", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null },
    { id: 20, text: "ROS 2 Control Framework",          phase: "phase4", completed: false, priority: "normal", logEntries: [], tags: [], dueDate: null }
];

const phases = {
    phase1: { title: "PHASE I: FOUNDATIONS",  icon: "fa-cube"      },
    phase2: { title: "PHASE II: ROS 2 CORE",  icon: "fa-robot"     },
    phase3: { title: "PHASE III: HARDWARE",   icon: "fa-microchip" },
    phase4: { title: "PHASE IV: ADVANCED",    icon: "fa-rocket"    }
};

const MEETING_TYPE_COLORS = {
    standup:       'type-standup',
    review:        'type-review',
    brainstorm:    'type-brainstorm',
    retrospective: 'type-retro',
    demo:          'type-demo',
    planning:      'type-planning',
    other:         'type-other'
};

// ── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyAj1pV6opEQl39sI-qNhjUvu5EP2odCzjw",
    authDomain:        "krisync-b365b.firebaseapp.com",
    projectId:         "krisync-b365b",
    storageBucket:     "krisync-b365b.firebasestorage.app",
    messagingSenderId: "1029080543168",
    appId:             "1:1029080543168:web:341f3c446c4a51e500e225"
};

// ── App State ─────────────────────────────────────────────────────────────────
let db;
let tasks               = [];
let meetings            = [];
let history             = [];
let searchQuery         = '';
let activeFilter        = 'all';
let activeTagFilter     = null;
let editingMeetingId    = null;
let formActionItems     = [];
let editFormActionItems = [];
let isSaving            = false;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    showLoading(true);
    loadTheme();
    setupEventListeners();

    const now = new Date();
    document.getElementById('meetingDate').valueAsDate = now;
    document.getElementById('meetingTime').value = now.toTimeString().slice(0, 5);

    // Initialize Firebase using CDN globals
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    await loadFromFirestore();
    showLoading(false);
    startRealtimeListeners();
});

// ── Loading Bar ───────────────────────────────────────────────────────────────
function showLoading(on) {
    let el = document.getElementById('fbLoadingBar');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fbLoadingBar';
        el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:3px;z-index:9999;background:linear-gradient(90deg,#4ec9b0,#569cd6);transition:opacity 0.4s;';
        document.body.prepend(el);
    }
    el.style.opacity = on ? '1' : '0';
}

// ── Firestore Load ────────────────────────────────────────────────────────────
async function loadFromFirestore() {
    try {
        const tasksDoc = await db.collection('krisync').doc('tasks').get();
        if (tasksDoc.exists) {
            tasks = tasksDoc.data().list || [];
        } else {
            tasks = JSON.parse(JSON.stringify(defaultData));
            await db.collection('krisync').doc('tasks').set({ list: tasks });
        }

        const meetingsDoc = await db.collection('krisync').doc('meetings').get();
        meetings = meetingsDoc.exists ? (meetingsDoc.data().list || []) : [];

        migrateTasks();
        migrateMeetings();
        renderTasks();
        renderMeetings();
        updateProgress();
        renderTagFilterRow();
    } catch (err) {
        console.error('Firestore load error:', err);
        showToast('Cloud sync failed — using local cache', 'error');
        // Offline fallback
        const saved  = localStorage.getItem('roboticsTasks');
        tasks        = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(defaultData));
        const savedM = localStorage.getItem('roboticsMeetings');
        meetings     = savedM ? JSON.parse(savedM) : [];
        migrateTasks();
        migrateMeetings();
        renderTasks();
        renderMeetings();
        updateProgress();
        renderTagFilterRow();
    }
}

// ── Real-time Listeners ───────────────────────────────────────────────────────
function startRealtimeListeners() {
    db.collection('krisync').doc('tasks').onSnapshot(snap => {
        if (isSaving || !snap.exists) return;
        tasks = snap.data().list || [];
        migrateTasks();
        renderTasks();
        renderTagFilterRow();
        updateProgress();
    });

    db.collection('krisync').doc('meetings').onSnapshot(snap => {
        if (isSaving || !snap.exists) return;
        meetings = snap.data().list || [];
        migrateMeetings();
        renderMeetings();
        updateProgress();
    });
}

// ── Firestore Save ────────────────────────────────────────────────────────────
async function saveTasks() {
    history.push(JSON.parse(JSON.stringify(tasks)));
    if (history.length > 20) history.shift();
    updateUndoButton();
    updateProgress();
    localStorage.setItem('roboticsTasks', JSON.stringify(tasks));

    isSaving = true;
    try {
        await db.collection('krisync').doc('tasks').set({ list: tasks });
    } catch (err) {
        console.error('Save tasks error:', err);
        showToast('Save failed — check connection', 'error');
    } finally {
        isSaving = false;
    }
}

async function saveMeetingsToStorage() {
    localStorage.setItem('roboticsMeetings', JSON.stringify(meetings));

    isSaving = true;
    try {
        await db.collection('krisync').doc('meetings').set({ list: meetings });
    } catch (err) {
        console.error('Save meetings error:', err);
        showToast('Save failed — check connection', 'error');
    } finally {
        isSaving = false;
    }
}

// ── Migration ─────────────────────────────────────────────────────────────────
function migrateTasks() {
    tasks.forEach(task => {
        if (!task.logEntries)            task.logEntries = [];
        if (!task.tags)                  task.tags = [];
        if (task.dueDate === undefined)  task.dueDate = null;
        if (task.notes && task.notes.trim() && task.logEntries.length === 0) {
            task.logEntries.push({ id: Date.now(), date: new Date().toISOString(), text: task.notes });
            delete task.notes;
        }
    });
}

function migrateMeetings() {
    meetings.forEach(m => {
        if (!m.actionItems)            m.actionItems = [];
        if (!m.attendees)              m.attendees = '';
        if (!m.type)                   m.type = 'other';
        if (!m.linkedTasks)            m.linkedTasks = [];
        if (!m.tags)                   m.tags = [];
        if (m.pinned === undefined)    m.pinned = false;
        if (m.collapsed === undefined) m.collapsed = false;
    });
}

// ── Undo ──────────────────────────────────────────────────────────────────────
function updateUndoButton() {
    document.getElementById('undoBtn').disabled = history.length === 0;
}

async function undo() {
    if (history.length > 0) {
        tasks = history.pop();
        updateUndoButton();
        updateProgress();
        renderTasks();
        renderTagFilterRow();
        localStorage.setItem('roboticsTasks', JSON.stringify(tasks));
        isSaving = true;
        try { await db.collection('krisync').doc('tasks').set({ list: tasks }); } finally { isSaving = false; }
        showToast('Action undone', 'success');
    }
}

// ── Progress ──────────────────────────────────────────────────────────────────
function updateProgress() {
    const total     = tasks.length;
    const done      = tasks.filter(t => t.completed).length;
    const overdue   = tasks.filter(t => isOverdue(t)).length;
    const high      = tasks.filter(t => t.priority === 'high' && !t.completed).length;
    const totalLogs = tasks.reduce((a, t) => a + (t.logEntries ? t.logEntries.length : 0), 0);
    const openActs  = meetings.reduce((a, m) => a + (m.actionItems || []).filter(ai => !ai.done).length, 0);
    const percent   = total === 0 ? 0 : Math.round((done / total) * 100);

    document.getElementById('progressBar').style.width   = percent + '%';
    document.getElementById('progressText').innerText    = `${percent}% SYSTEM OPTIMIZED (${done}/${total} OBJECTIVES COMPLETE)`;
    document.getElementById('statTotal').textContent     = total;
    document.getElementById('statDone').textContent      = done;
    document.getElementById('statOverdue').textContent   = overdue;
    document.getElementById('statHigh').textContent      = high;
    document.getElementById('statLogs').textContent      = totalLogs;
    document.getElementById('statActions').textContent   = openActs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOverdue(task) {
    if (!task.dueDate || task.completed) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(task.dueDate) < today;
}
function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateTime(dateStr, timeStr) {
    return new Date(dateStr + 'T' + (timeStr || '00:00')).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
}
function getAllTags() {
    const tags = new Set();
    tasks.forEach(t => (t.tags || []).forEach(tag => tags.add(tag)));
    return [...tags].sort();
}
function highlightSearch(text) {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}
function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('addTaskBtn').addEventListener('click', addTask);
    document.getElementById('taskInput').addEventListener('keypress', e => { if (e.key === 'Enter') addTask(); });

    document.getElementById('searchInput').addEventListener('input', e => {
        searchQuery = e.target.value.toLowerCase(); renderTasks();
    });
    document.getElementById('clearSearchBtn').addEventListener('click', () => {
        document.getElementById('searchInput').value = ''; searchQuery = ''; renderTasks();
    });
    document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); activeFilter = btn.dataset.filter; renderTasks();
    }));
    document.getElementById('clearTagFilter').addEventListener('click', () => {
        activeTagFilter = null;
        document.getElementById('clearTagFilter').style.display = 'none';
        document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
        renderTasks();
    });

    document.getElementById('resetBtn').addEventListener('click', resetToDefault);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('exportMdBtn').addEventListener('click', exportMarkdown);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', importData);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    document.getElementById('addMeetingBtn').addEventListener('click', showMeetingForm);
    document.getElementById('saveMeetingBtn').addEventListener('click', saveMeeting);
    document.getElementById('cancelMeetingBtn').addEventListener('click', hideMeetingForm);
    document.getElementById('addActionItemBtn').addEventListener('click', () => addActionItemRow('actionItemsForm', formActionItems));

    document.getElementById('saveEditMeetingBtn').addEventListener('click', saveEditMeeting);
    document.getElementById('cancelEditMeetingBtn').addEventListener('click', hideEditMeetingForm);
    document.getElementById('editAddActionItemBtn').addEventListener('click', () => addActionItemRow('editActionItemsForm', editFormActionItems));

    document.getElementById('meetingSearchInput').addEventListener('input', () => renderMeetings());
    document.getElementById('meetingTypeFilter').addEventListener('change', () => renderMeetings());

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    });
}

// ── Task Rendering ────────────────────────────────────────────────────────────
function renderTasks() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    Object.entries(phases).forEach(([key, config]) => {
        const section = document.createElement('section');
        section.className = 'phase-section';

        let phaseTasks = tasks.filter(t => t.phase === key);
        if (searchQuery)                       phaseTasks = phaseTasks.filter(t => t.text.toLowerCase().includes(searchQuery) || (t.tags||[]).some(g => g.toLowerCase().includes(searchQuery)));
        if (activeFilter === 'active')         phaseTasks = phaseTasks.filter(t => !t.completed);
        else if (activeFilter === 'completed') phaseTasks = phaseTasks.filter(t => t.completed);
        else if (activeFilter === 'overdue')   phaseTasks = phaseTasks.filter(t => isOverdue(t));
        else if (activeFilter === 'high')      phaseTasks = phaseTasks.filter(t => t.priority === 'high');
        if (activeTagFilter) phaseTasks = phaseTasks.filter(t => (t.tags||[]).includes(activeTagFilter));

        const allPhase   = tasks.filter(t => t.phase === key);
        const doneCount  = allPhase.filter(t => t.completed).length;
        const totalCount = allPhase.length;
        const pct        = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

        section.innerHTML = `
            <div class="phase-header">
                <h2><i class="fas ${config.icon}"></i> ${config.title}</h2>
                <span class="phase-count">${doneCount}/${totalCount}</span>
            </div>
            <div class="phase-progress-bar-bg"><div class="phase-progress-bar" style="width:${pct}%"></div></div>`;

        if (phaseTasks.length === 0) {
            section.innerHTML += `<div class="empty-state"><i class="fas fa-inbox"></i><p>${searchQuery || activeFilter !== 'all' || activeTagFilter ? 'No tasks match filters' : 'No tasks yet'}</p></div>`;
        } else {
            phaseTasks.sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                const po = { high: 0, normal: 1, low: 2 };
                return po[a.priority || 'normal'] - po[b.priority || 'normal'];
            });
            phaseTasks.forEach(task => section.appendChild(createTaskElement(task)));
        }
        app.appendChild(section);
    });
}

function createTaskElement(task) {
    const item    = document.createElement('div');
    const overdue = isOverdue(task);
    item.className = `task-item ${task.completed ? 'completed' : ''} priority-${task.priority||'normal'} ${overdue ? 'overdue' : ''}`;

    const priorityBadge = task.priority === 'high'
        ? `<span class="priority-badge high"><i class="fas fa-exclamation-circle"></i> HIGH</span>`
        : task.priority === 'low' ? `<span class="priority-badge low"><i class="fas fa-arrow-down"></i> LOW</span>` : '';

    const dueBadge = task.dueDate
        ? `<span class="due-badge ${overdue ? 'overdue' : ''}"><i class="fas fa-calendar-alt"></i> ${formatDate(task.dueDate)}${overdue ? ' ⚠' : ''}</span>`
        : '';

    const tagsHTML = (task.tags && task.tags.length)
        ? `<div class="task-tags">${task.tags.map(tag => `<span class="task-tag" onclick="event.stopPropagation();filterByTag('${tag}')">${tag}</span>`).join('')}</div>`
        : '';

    const hasLogs  = task.logEntries && task.logEntries.length > 0;
    const logsIcon = hasLogs ? `<i class="fas fa-history log-hist-icon" title="${task.logEntries.length} log entries"></i>` : '';

    item.innerHTML = `
        <div class="task-content">
            <div class="task-main" onclick="toggleTask(${task.id})">
                <div class="task-checkbox">${task.completed ? '<i class="fas fa-check"></i>' : ''}</div>
                <div class="task-text-wrap">
                    <span class="task-text" id="task-text-${task.id}">${highlightSearch(task.text)}</span>${logsIcon}
                    ${dueBadge}${tagsHTML}
                </div>
            </div>
            ${buildLogsHTML(task)}
        </div>
        <div class="task-actions">
            ${priorityBadge}
            <button class="edit-task-btn" onclick="startEditTask(${task.id})" title="Edit task"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-btn" onclick="deleteTask(${task.id})" title="Delete"><i class="fas fa-times"></i></button>
        </div>`;
    return item;
}

function buildLogsHTML(task) {
    const hasLogs = task.logEntries && task.logEntries.length > 0;
    let logsListHTML = '';
    if (hasLogs) {
        const sorted = [...task.logEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
        logsListHTML = `<div class="task-logs" id="logs-${task.id}" style="display:none;">${sorted.map(log => {
            const d = new Date(log.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
            const hBadge = log.hours ? `<span class="log-hours-badge"><i class="fas fa-clock"></i> ${log.hours}h</span>` : '';
            return `<div class="log-entry"><div class="log-header"><span class="log-date"><i class="fas fa-calendar-alt"></i> ${d} ${hBadge}</span><button class="log-delete-btn" onclick="event.stopPropagation();deleteLogEntry(${task.id},${log.id})"><i class="fas fa-trash-alt"></i></button></div><div class="log-text">${log.text}</div></div>`;
        }).join('')}</div>`;
    }
    return `${logsListHTML}
    <div class="log-controls">
        ${hasLogs ? `<span class="task-logs-toggle" onclick="event.stopPropagation();toggleLogs(${task.id})"><span id="toggle-text-${task.id}">Show history (${task.logEntries.length})</span></span>` : ''}
        <button class="add-log-btn" onclick="event.stopPropagation();showLogInput(${task.id})"><i class="fas fa-plus"></i> Add Entry</button>
    </div>
    <div class="log-input-container" id="log-input-${task.id}" style="display:none;">
        <textarea id="log-textarea-${task.id}" placeholder="What did you work on today?..." rows="3"></textarea>
        <div class="log-input-meta"><label class="log-hours-label"><i class="fas fa-clock"></i> Hours: <input type="number" id="log-hours-${task.id}" min="0.1" max="24" step="0.25" placeholder="e.g. 1.5" class="log-hours-input"></label></div>
        <div class="log-input-actions">
            <button class="log-save-btn" onclick="event.stopPropagation();saveLogEntry(${task.id})"><i class="fas fa-save"></i> Save</button>
            <button class="log-cancel-btn" onclick="event.stopPropagation();hideLogInput(${task.id})">Cancel</button>
        </div>
    </div>`;
}

function renderTagFilterRow() {
    const allTags = getAllTags();
    const row     = document.getElementById('tagFilterRow');
    const chips   = document.getElementById('tagFilterChips');
    if (!allTags.length) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    chips.innerHTML = allTags.map(tag =>
        `<span class="tag-chip ${activeTagFilter === tag ? 'active' : ''}" data-tag="${tag}" onclick="filterByTag('${tag}')">${tag}</span>`
    ).join('');
}

// ── Task Actions ──────────────────────────────────────────────────────────────
window.toggleTask = function(id) {
    const t = tasks.find(t => t.id === id);
    if (t) { t.completed = !t.completed; saveTasks(); renderTasks(); showToast(t.completed ? 'Task completed! ✓' : 'Task reopened', 'success'); }
};
window.deleteTask = function(id) {
    if (!confirm('Delete this task?')) return;
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(); renderTasks(); renderTagFilterRow(); showToast('Task deleted', 'success');
};
window.filterByTag = function(tag) {
    activeTagFilter = tag;
    document.getElementById('clearTagFilter').style.display = 'inline-block';
    document.querySelectorAll('.tag-chip').forEach(c => c.classList.toggle('active', c.dataset.tag === tag));
    renderTasks();
};
window.startEditTask = function(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const textEl    = document.getElementById(`task-text-${id}`);
    const container = textEl && textEl.closest('.task-text-wrap');
    if (!container || container.querySelector('.inline-edit-input')) return;

    const input          = Object.assign(document.createElement('input'), { type:'text', className:'inline-edit-input', value: task.text });
    const dueDateInput   = Object.assign(document.createElement('input'), { type:'date', className:'inline-edit-date', value: task.dueDate || '' });
    const tagsInput      = Object.assign(document.createElement('input'), { type:'text', className:'inline-edit-tags', placeholder:'Tags (comma-separated)', value: (task.tags||[]).join(', ') });
    const prioritySelect = document.createElement('select');
    prioritySelect.className = 'inline-edit-priority';
    ['high','normal','low'].forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p.toUpperCase(); if (p === task.priority) o.selected = true; prioritySelect.appendChild(o); });
    const saveBtn   = Object.assign(document.createElement('button'), { className:'inline-save-btn',   innerHTML:'<i class="fas fa-check"></i>', title:'Save' });
    const cancelBtn = Object.assign(document.createElement('button'), { className:'inline-cancel-btn', innerHTML:'<i class="fas fa-times"></i>', title:'Cancel' });

    const editRow  = document.createElement('div'); editRow.className = 'inline-edit-row'; editRow.append(input, saveBtn, cancelBtn);
    const editMeta = document.createElement('div'); editMeta.className = 'inline-edit-meta';
    const lDue = document.createElement('label'); lDue.textContent = 'Due: ';       lDue.appendChild(dueDateInput);
    const lPri = document.createElement('label'); lPri.textContent = ' Priority: '; lPri.appendChild(prioritySelect);
    const lTag = document.createElement('label'); lTag.textContent = ' Tags: ';     lTag.appendChild(tagsInput);
    editMeta.append(lDue, lPri, lTag);

    textEl.style.display = 'none';
    container.querySelectorAll('.due-badge,.task-tags').forEach(el => el.style.display = 'none');
    container.append(editRow, editMeta);
    input.focus(); input.select();

    const save = () => {
        const newText = input.value.trim();
        if (!newText) { showToast('Task name cannot be empty', 'error'); return; }
        task.text = newText; task.dueDate = dueDateInput.value || null;
        task.priority = prioritySelect.value;
        task.tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
        saveTasks(); renderTasks(); renderTagFilterRow(); showToast('Task updated', 'success');
    };
    const cancel = () => {
        editRow.remove(); editMeta.remove();
        textEl.style.display = '';
        container.querySelectorAll('.due-badge,.task-tags').forEach(el => el.style.display = '');
    };
    saveBtn.addEventListener('click',  e => { e.stopPropagation(); save(); });
    cancelBtn.addEventListener('click',e => { e.stopPropagation(); cancel(); });
    input.addEventListener('keydown',  e => { if (e.key==='Enter') { e.stopPropagation(); save(); } if (e.key==='Escape') { e.stopPropagation(); cancel(); } });
};

function addTask() {
    const input      = document.getElementById('taskInput');
    const notesInput = document.getElementById('notesInput');
    const text       = input.value.trim();
    if (!text) { showToast('Please enter a task', 'error'); return; }

    const newTask = {
        id: Date.now(), text,
        phase:      document.getElementById('phaseSelect').value,
        priority:   document.getElementById('prioritySelect').value,
        logEntries: [],
        tags:       document.getElementById('tagsInput').value.split(',').map(t => t.trim()).filter(Boolean),
        dueDate:    document.getElementById('dueDateInput').value || null,
        completed:  false
    };
    const note = notesInput.value.trim();
    if (note) newTask.logEntries.push({ id: Date.now()+1, date: new Date().toISOString(), text: note });

    tasks.push(newTask);
    input.value = ''; notesInput.value = '';
    document.getElementById('prioritySelect').value = 'normal';
    document.getElementById('dueDateInput').value   = '';
    document.getElementById('tagsInput').value      = '';
    saveTasks(); renderTasks(); renderTagFilterRow();
    showToast('Task added!', 'success'); input.focus();
}

// ── Log Entries ───────────────────────────────────────────────────────────────
window.toggleLogs    = function(id) { const d=document.getElementById(`logs-${id}`),t=document.getElementById(`toggle-text-${id}`),task=tasks.find(x=>x.id===id);if(!d)return;const open=d.style.display==='none';d.style.display=open?'block':'none';t.textContent=open?`Hide history (${task.logEntries.length})`:`Show history (${task.logEntries.length})`;};
window.showLogInput  = function(id) { const c=document.getElementById(`log-input-${id}`);if(c){c.style.display='block';document.getElementById(`log-textarea-${id}`).focus();}};
window.hideLogInput  = function(id) { const c=document.getElementById(`log-input-${id}`);if(c){c.style.display='none';document.getElementById(`log-textarea-${id}`).value='';const h=document.getElementById(`log-hours-${id}`);if(h)h.value='';}};
window.saveLogEntry  = function(id) {
    const textarea = document.getElementById(`log-textarea-${id}`);
    const text = textarea.value.trim();
    if (!text) { showToast('Please enter some text','error'); return; }
    const task = tasks.find(t => t.id === id);
    if (task) {
        if (!task.logEntries) task.logEntries = [];
        const entry = { id: Date.now(), date: new Date().toISOString(), text };
        const hi = document.getElementById(`log-hours-${id}`);
        const hours = hi ? parseFloat(hi.value) : NaN;
        if (!isNaN(hours) && hours > 0) entry.hours = hours;
        task.logEntries.push(entry);
        saveTasks(); renderTasks(); showToast('Log entry added!','success');
    }
};
window.deleteLogEntry = function(taskId, logId) {
    if (!confirm('Delete this log entry?')) return;
    const task = tasks.find(t => t.id === taskId);
    if (task) { task.logEntries = task.logEntries.filter(l => l.id !== logId); saveTasks(); renderTasks(); showToast('Log entry deleted','success'); }
};

// ── Meeting Form ──────────────────────────────────────────────────────────────
function showMeetingForm() {
    formActionItems = [];
    document.getElementById('actionItemsForm').innerHTML = '';
    document.getElementById('meetingForm').style.display = 'block';
    document.getElementById('meetingTitle').focus();
    const now = new Date();
    document.getElementById('meetingDate').valueAsDate = now;
    document.getElementById('meetingTime').value = now.toTimeString().slice(0,5);
    populateLinkedTasksSelector('linkedTasksSelector', []);
}
function hideMeetingForm() {
    document.getElementById('meetingForm').style.display = 'none';
    ['meetingTitle','meetingAttendees','meetingTags','meetingNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('actionItemsForm').innerHTML = '';
    formActionItems = [];
}
function hideEditMeetingForm() {
    document.getElementById('meetingEditForm').style.display = 'none';
    editFormActionItems = []; editingMeetingId = null;
}
function addActionItemRow(containerId, itemsArray, existing = null) {
    const container = document.getElementById(containerId);
    const item = existing || { id: Date.now() + Math.random(), text: '', assignee: '', dueDate: '', done: false };
    if (!existing) itemsArray.push(item);

    const row = document.createElement('div');
    row.className = 'action-item-row';
    row.innerHTML = `
        <input type="checkbox" class="ai-done-check" ${item.done ? 'checked' : ''}>
        <input type="text"  class="ai-text-input"     placeholder="Action item..." value="${escapeHtml(item.text)}">
        <input type="text"  class="ai-assignee-input" placeholder="Assignee"       value="${escapeHtml(item.assignee||'')}">
        <input type="date"  class="ai-date-input"                                   value="${item.dueDate||''}">
        <button type="button" class="ai-remove-btn"><i class="fas fa-times"></i></button>`;

    row.querySelector('.ai-done-check').addEventListener('change',   e => { item.done     = e.target.checked; });
    row.querySelector('.ai-text-input').addEventListener('input',    e => { item.text     = e.target.value;   });
    row.querySelector('.ai-assignee-input').addEventListener('input',e => { item.assignee = e.target.value;   });
    row.querySelector('.ai-date-input').addEventListener('change',   e => { item.dueDate  = e.target.value;   });
    row.querySelector('.ai-remove-btn').addEventListener('click',    () => { itemsArray.splice(itemsArray.indexOf(item), 1); row.remove(); });

    container.appendChild(row);
    row.querySelector('.ai-text-input').focus();
}
function populateLinkedTasksSelector(containerId, selectedIds) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    tasks.forEach(task => {
        const chip = document.createElement('span');
        chip.className = 'linked-task-chip' + (selectedIds.includes(task.id) ? ' selected' : '');
        chip.textContent = task.text; chip.dataset.id = task.id;
        chip.addEventListener('click', () => chip.classList.toggle('selected'));
        container.appendChild(chip);
    });
}
function getSelectedLinkedTasks(containerId) {
    return [...document.querySelectorAll(`#${containerId} .linked-task-chip.selected`)].map(c => parseInt(c.dataset.id));
}

function saveMeeting() {
    const title = document.getElementById('meetingTitle').value.trim();
    const date  = document.getElementById('meetingDate').value;
    if (!title) { showToast('Please enter a meeting title','error'); return; }
    if (!date)  { showToast('Please select a date','error'); return; }

    meetings.unshift({
        id: Date.now(), title,
        type:        document.getElementById('meetingType').value,
        date,
        time:        document.getElementById('meetingTime').value || '00:00',
        attendees:   document.getElementById('meetingAttendees').value.trim(),
        tags:        document.getElementById('meetingTags').value.split(',').map(t=>t.trim()).filter(Boolean),
        notes:       document.getElementById('meetingNotes').value.trim(),
        actionItems: formActionItems.filter(ai => ai.text.trim()),
        linkedTasks: getSelectedLinkedTasks('linkedTasksSelector'),
        pinned: false, collapsed: false,
        createdAt: new Date().toISOString()
    });
    saveMeetingsToStorage(); renderMeetings(); updateProgress();
    hideMeetingForm(); showToast('Meeting saved!','success');
}

window.editMeeting = function(id) {
    const m = meetings.find(x => x.id === id); if (!m) return;
    editingMeetingId    = id;
    editFormActionItems = JSON.parse(JSON.stringify(m.actionItems || []));

    document.getElementById('editMeetingTitle').value     = m.title;
    document.getElementById('editMeetingType').value      = m.type || 'other';
    document.getElementById('editMeetingDate').value      = m.date;
    document.getElementById('editMeetingTime').value      = m.time;
    document.getElementById('editMeetingAttendees').value = m.attendees || '';
    document.getElementById('editMeetingTags').value      = (m.tags||[]).join(', ');
    document.getElementById('editMeetingNotes').value     = m.notes || '';

    const container = document.getElementById('editActionItemsForm');
    container.innerHTML = '';
    editFormActionItems.forEach(ai => addActionItemRow('editActionItemsForm', editFormActionItems, ai));
    populateLinkedTasksSelector('editLinkedTasksSelector', m.linkedTasks || []);

    document.getElementById('meetingEditForm').style.display = 'block';
    document.getElementById('editMeetingTitle').focus();
};
function saveEditMeeting() {
    const title = document.getElementById('editMeetingTitle').value.trim();
    if (!title) { showToast('Please enter a meeting title','error'); return; }
    const idx = meetings.findIndex(m => m.id === editingMeetingId);
    if (idx !== -1) {
        meetings[idx] = {
            ...meetings[idx], title,
            type:        document.getElementById('editMeetingType').value,
            date:        document.getElementById('editMeetingDate').value,
            time:        document.getElementById('editMeetingTime').value || '00:00',
            attendees:   document.getElementById('editMeetingAttendees').value.trim(),
            tags:        document.getElementById('editMeetingTags').value.split(',').map(t=>t.trim()).filter(Boolean),
            notes:       document.getElementById('editMeetingNotes').value.trim(),
            actionItems: editFormActionItems.filter(ai => ai.text.trim()),
            linkedTasks: getSelectedLinkedTasks('editLinkedTasksSelector'),
        };
        saveMeetingsToStorage(); renderMeetings(); updateProgress();
        hideEditMeetingForm(); showToast('Meeting updated!','success');
    }
}

window.toggleActionItem = function(meetingId, aiId) {
    const m = meetings.find(x => x.id === meetingId); if (!m) return;
    const ai = m.actionItems.find(x => x.id === aiId);
    if (ai) { ai.done = !ai.done; saveMeetingsToStorage(); renderMeetings(); updateProgress(); }
};
window.togglePinMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (m) { m.pinned = !m.pinned; saveMeetingsToStorage(); renderMeetings(); showToast(m.pinned ? 'Pinned' : 'Unpinned','success'); }
};
window.toggleCollapseMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (m) { m.collapsed = !m.collapsed; saveMeetingsToStorage(); renderMeetings(); }
};
window.copyMeeting = function(id) {
    const m = meetings.find(x => x.id === id); if (!m) return;
    let text = `${m.title}\n${formatDateTime(m.date, m.time)}\n`;
    if (m.attendees) text += `Attendees: ${m.attendees}\n`;
    if (m.notes) text += `\nNotes:\n${m.notes}\n`;
    if (m.actionItems && m.actionItems.length) {
        text += '\nAction Items:\n';
        m.actionItems.forEach(ai => { text += `[${ai.done?'x':' '}] ${ai.text}${ai.assignee?' — '+ai.assignee:''}${ai.dueDate?' (due: '+ai.dueDate+')':''}\n`; });
    }
    navigator.clipboard.writeText(text).then(()=>showToast('Copied!','success')).catch(()=>showToast('Copy failed','error'));
};
window.deleteMeeting = function(id) {
    if (!confirm('Delete this meeting?')) return;
    meetings = meetings.filter(m => m.id !== id);
    saveMeetingsToStorage(); renderMeetings(); updateProgress(); showToast('Meeting deleted','success');
};

// ── Render Meetings ───────────────────────────────────────────────────────────
function renderMeetings() {
    const container = document.getElementById('meetingsList');
    const searchVal = document.getElementById('meetingSearchInput').value.toLowerCase();
    const typeVal   = document.getElementById('meetingTypeFilter').value;

    let filtered = [...meetings];
    if (searchVal) filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(searchVal) ||
        (m.notes||'').toLowerCase().includes(searchVal) ||
        (m.attendees||'').toLowerCase().includes(searchVal) ||
        (m.tags||[]).some(t => t.toLowerCase().includes(searchVal)) ||
        (m.actionItems||[]).some(ai => ai.text.toLowerCase().includes(searchVal))
    );
    if (typeVal !== 'all') filtered = filtered.filter(m => (m.type||'other') === typeVal);
    filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.date+'T'+(b.time||'00:00')) - new Date(a.date+'T'+(a.time||'00:00'));
    });

    const openActions = meetings.reduce((acc, m) => acc + (m.actionItems||[]).filter(ai => !ai.done).length, 0);
    document.getElementById('meetingCountPill').textContent = `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}`;
    document.getElementById('openActionsPill').textContent  = `${openActions} open action${openActions !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard"></i><p>${searchVal || typeVal !== 'all' ? 'No meetings match your filters' : 'No meetings yet. Click "NEW MEETING" to add one.'}</p></div>`;
        return;
    }

    const groups = {};
    filtered.forEach(m => {
        const key = new Date(m.date+'T00:00:00').toLocaleDateString('en-US', { month:'long', year:'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });

    container.innerHTML = Object.entries(groups).map(([month, mList]) => `
        <div class="meeting-month-group">
            <div class="meeting-month-header">${month}</div>
            ${mList.map(m => renderMeetingCard(m)).join('')}
        </div>`).join('');
}

function renderMeetingCard(m) {
    const dateStr    = formatDateTime(m.date, m.time);
    const timeStr    = new Date(m.date+'T'+(m.time||'00:00')).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    const typeCls    = MEETING_TYPE_COLORS[m.type||'other'] || 'type-other';
    const actionItems= m.actionItems || [];
    const doneCount  = actionItems.filter(ai => ai.done).length;
    const totalAI    = actionItems.length;
    const overdueAI  = actionItems.filter(ai => !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < new Date()).length;
    const linkedTasks= (m.linkedTasks||[]).map(tid => tasks.find(t => t.id === tid)).filter(Boolean);
    const tagsHTML   = (m.tags||[]).length ? `<div class="meeting-tags-row">${m.tags.map(t=>`<span class="task-tag">${escapeHtml(t)}</span>`).join('')}</div>` : '';
    const attendeesHTML = m.attendees ? `<span class="meeting-attendees"><i class="fas fa-user-friends"></i> ${escapeHtml(m.attendees)}</span>` : '';
    const actionBadge = totalAI > 0 ? `<span class="action-badge ${overdueAI>0?'has-overdue':doneCount===totalAI?'all-done':''}">${doneCount}/${totalAI} actions</span>` : '';

    const aiHTML = actionItems.length ? `
        <div class="meeting-actions-section">
            <div class="meeting-actions-header">
                <span class="meeting-section-label"><i class="fas fa-check-square"></i> Action Items</span>${actionBadge}
            </div>
            <div class="action-items-list">
                ${actionItems.map(ai => {
                    const aiOv = !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < new Date();
                    return `<div class="action-item-display ${ai.done?'ai-done':''} ${aiOv?'ai-overdue':''}">
                        <span class="ai-checkbox" onclick="toggleActionItem(${m.id},${ai.id})">${ai.done?'<i class="fas fa-check-circle"></i>':'<i class="far fa-circle"></i>'}</span>
                        <span class="ai-text">${escapeHtml(ai.text)}</span>
                        ${ai.assignee?`<span class="ai-assignee"><i class="fas fa-user"></i> ${escapeHtml(ai.assignee)}</span>`:''}
                        ${ai.dueDate?`<span class="ai-due ${aiOv?'overdue':''}"><i class="fas fa-calendar-alt"></i> ${formatDate(ai.dueDate)}${aiOv?' ⚠':''}</span>`:''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : '';

    const linkedHTML = linkedTasks.length ? `
        <div class="meeting-linked-section">
            <span class="meeting-section-label"><i class="fas fa-link"></i> Linked Tasks</span>
            <div class="meeting-linked-tasks">${linkedTasks.map(t=>`<span class="linked-task-ref ${t.completed?'done':''}">${escapeHtml(t.text)}</span>`).join('')}</div>
        </div>` : '';

    const notesHTML = m.notes && !m.collapsed ? `
        <div class="meeting-notes">${m.notes.split('\n').map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '').join('')}</div>` : '';

    return `
    <div class="meeting-card ${m.pinned?'pinned':''} ${m.collapsed?'collapsed':''}">
        <div class="meeting-card-header">
            <div class="meeting-title-area">
                <span class="meeting-type-badge ${typeCls}">${m.type||'other'}</span>
                ${m.pinned?'<span class="pin-indicator"><i class="fas fa-thumbtack"></i></span>':''}
                <h3 class="meeting-card-title">${escapeHtml(m.title)}</h3>
            </div>
            <div class="meeting-card-actions">
                <button class="mcard-btn" onclick="togglePinMeeting(${m.id})" title="${m.pinned?'Unpin':'Pin'}"><i class="fas fa-thumbtack ${m.pinned?'pinned-icon':''}"></i></button>
                <button class="mcard-btn" onclick="copyMeeting(${m.id})" title="Copy"><i class="fas fa-copy"></i></button>
                <button class="mcard-btn" onclick="editMeeting(${m.id})" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                <button class="mcard-btn danger" onclick="deleteMeeting(${m.id})" title="Delete"><i class="fas fa-trash"></i></button>
                <button class="mcard-btn" onclick="toggleCollapseMeeting(${m.id})"><i class="fas fa-chevron-${m.collapsed?'down':'up'}"></i></button>
            </div>
        </div>
        <div class="meeting-card-meta">
            <span class="meeting-meta-item"><i class="fas fa-calendar"></i> ${dateStr}</span>
            <span class="meeting-meta-item"><i class="fas fa-clock"></i> ${timeStr}</span>
            ${attendeesHTML}${actionBadge && m.collapsed ? actionBadge : ''}
        </div>
        ${tagsHTML}
        ${m.collapsed ? '' : `${notesHTML}${aiHTML}${linkedHTML}`}
        <div class="meeting-collapse-toggle" onclick="toggleCollapseMeeting(${m.id})">
            <i class="fas fa-chevron-${m.collapsed?'down':'up'}"></i> ${m.collapsed?'Expand':'Collapse'}
        </div>
    </div>`;
}

// ── Import / Export ───────────────────────────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify({tasks, meetings, exportDate: new Date().toISOString()}, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {href:url, download:`robotics-tracker-${new Date().toISOString().split('T')[0]}.json`}).click();
    URL.revokeObjectURL(url);
    showToast('Exported!','success');
}
function exportMarkdown() {
    const lines = ['# Robotics Tracker Export', `> Exported: ${new Date().toLocaleString()}`, ''];
    Object.entries(phases).forEach(([key, config]) => {
        const pt = tasks.filter(t => t.phase === key);
        lines.push(`## ${config.title}`, `Progress: ${pt.filter(t=>t.completed).length}/${pt.length}`, '');
        pt.forEach(task => {
            lines.push(`- ${task.completed?'[x]':'[ ]'} **${task.text}**${task.priority!=='normal'?` *(${task.priority})*`:''}${task.dueDate?` 📅 ${formatDate(task.dueDate)}`:''}${(task.tags||[]).length?` 🏷 ${task.tags.join(', ')}`:''}` );
            if (task.logEntries && task.logEntries.length) {
                [...task.logEntries].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(log => {
                    lines.push(`  - *${new Date(log.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}${log.hours?` (${log.hours}h)`:''}: ${log.text}`);
                });
            }
        });
        lines.push('');
    });
    const blob = new Blob([lines.join('\n')], {type:'text/markdown'});
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {href:url, download:`robotics-tracker-${new Date().toISOString().split('T')[0]}.md`}).click();
    URL.revokeObjectURL(url);
    showToast('Markdown exported!','success');
}
async function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const imp = JSON.parse(e.target.result);
            let impTasks, impMeetings;
            if (Array.isArray(imp))   { impTasks = imp; impMeetings = []; }
            else if (imp.tasks)       { impTasks = imp.tasks||[]; impMeetings = imp.meetings||[]; }
            else throw new Error('Invalid format');
            if (confirm('Import? Current data will be replaced.')) {
                tasks = impTasks; meetings = impMeetings; history = [];
                await saveTasks(); await saveMeetingsToStorage();
                renderTasks(); renderMeetings(); renderTagFilterRow();
                showToast('Imported!','success');
            }
        } catch(err) { showToast('Import error: '+err.message,'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}
async function resetToDefault() {
    if (!confirm('⚠️ Reset to defaults? All data will be deleted.')) return;
    tasks = JSON.parse(JSON.stringify(defaultData));
    meetings = []; history = [];
    activeTagFilter = null; activeFilter = 'all';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter==='all'));
    await saveTasks(); await saveMeetingsToStorage();
    renderTasks(); renderMeetings(); renderTagFilterRow();
    showToast('Reset to defaults','success');
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}
function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    showToast(`${next==='dark'?'Dark':'Light'} mode activated`,'success');
}
function updateThemeIcon(theme) {
    document.querySelector('#themeToggle i').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className   = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}
