// ── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyAj1pV6opEQl39sI-qNhjUvu5EP2odCzjw",
    authDomain:        "krisync-b365b.firebaseapp.com",
    projectId:         "krisync-b365b",
    storageBucket:     "krisync-b365b.firebasestorage.app",
    messagingSenderId: "1029080543168",
    appId:             "1:1029080543168:web:341f3c446c4a51e500e225"
};

// ── State ─────────────────────────────────────────────────────────────────────
let db;
let meetings      = [];
let currentView   = 'all';
let currentType   = 'all';
let currentSort   = 'date-desc';
let searchQuery   = '';
let actionFilter  = 'open';
let editingId     = null;
let formAIs       = [];
let isSaving      = false;
let unsubscribeMeetings = null;

const ML_COLLECTION = 'minuteslog';
const ML_LEGACY_DOC = 'meetings';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(localStorage.getItem('ml-theme') || 'dark');
    bindEvents();
    initQuickAdd();
    initDraftAutosave();
    initTemplateChips();
    setDefaultDateTime();
    showSyncStatus('connecting');

    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    await loadFromFirestore();
    startRealtimeListener();
});

// ── Sync Status ───────────────────────────────────────────────────────────────
function showSyncStatus(state) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const states = {
        connecting: { color: '#fb923c', title: 'Connecting to cloud…' },
        synced:     { color: '#4ade80', title: 'Synced to cloud ✓'   },
        saving:     { color: '#facc15', title: 'Saving…'             },
        error:      { color: '#f87171', title: 'Sync error — using local cache' }
    };
    const s = states[state] || states.synced;
    el.style.cssText = `width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0;transition:background .3s;`;
    el.title = s.title;
}

// ── Firestore Load ────────────────────────────────────────────────────────────
async function loadFromFirestore() {
    try {
        const colRef = db.collection(ML_COLLECTION);
        const snap = await colRef.get();
        const cloudMeetings = extractMeetingsFromDocs(snap.docs);

        if (cloudMeetings.length === 0) {
            const legacy = snap.docs.find(d => d.id === ML_LEGACY_DOC);
            const legacyList = legacy?.data()?.list;
            if (Array.isArray(legacyList) && legacyList.length) {
                meetings = legacyList;
                migrateMeetings();
                await syncMeetingsToFirestore();
                showToast('Cloud data migrated to improved sync format', 'success');
            } else {
                meetings = [];
            }
        } else {
            meetings = cloudMeetings;
        }

        migrateMeetings();
        render();
        showSyncStatus('synced');
    } catch (err) {
        console.error('Firestore load error:', err);
        showSyncStatus('error');
        showToast('Cloud sync failed — using local cache', 'error');
        const saved = localStorage.getItem('minuteslog-v2');
        meetings = saved ? JSON.parse(saved) : [];
        migrateMeetings();
        render();
    }
}

// ── Real-time Listener ────────────────────────────────────────────────────────
function startRealtimeListener() {
    if (unsubscribeMeetings) unsubscribeMeetings();

    unsubscribeMeetings = db.collection(ML_COLLECTION).onSnapshot(snap => {
        if (isSaving) return;
        const incoming = extractMeetingsFromDocs(snap.docs);
        if (!incoming.length) return;

        meetings = incoming;
        migrateMeetings();
        render();
        showSyncStatus('synced');
    }, err => {
        console.error('Snapshot error:', err);
        showSyncStatus('error');
    });
}

// ── Firestore Save ────────────────────────────────────────────────────────────
async function saveData() {
    localStorage.setItem('minuteslog-v2', JSON.stringify(meetings));
    updateStats();
    showSyncStatus('saving');
    isSaving = true;
    try {
        await syncMeetingsToFirestore();
        showSyncStatus('synced');
    } catch (err) {
        console.error('Save error:', err);
        showSyncStatus('error');
        showToast('Save failed — check connection', 'error');
    } finally {
        isSaving = false;
    }
}

async function syncMeetingsToFirestore() {
    const colRef = db.collection(ML_COLLECTION);
    const snap = await colRef.get();
    const existingIds = new Set(
        snap.docs
            .filter(d => d.id !== ML_LEGACY_DOC && isMeetingDoc(d.data()))
            .map(d => d.id)
    );

    const desiredIds = new Set();
    const batch = db.batch();

    meetings.forEach(m => {
        const id = String(m.id);
        desiredIds.add(id);
        batch.set(colRef.doc(id), cleanMeetingForSave(m), { merge: true });
    });

    existingIds.forEach(id => {
        if (!desiredIds.has(id)) batch.delete(colRef.doc(id));
    });

    batch.set(
        colRef.doc(ML_LEGACY_DOC),
        {
            migratedToDocs: true,
            count: meetings.length,
            updatedAt: new Date().toISOString()
        },
        { merge: true }
    );

    await batch.commit();
}

function cleanMeetingForSave(m) {
    return {
        id: String(m.id),
        pinned: !!m.pinned,
        createdAt: m.createdAt || new Date().toISOString(),
        title: m.title || '',
        type: m.type || 'other',
        date: m.date || '',
        time: m.time || '',
        endTime: m.endTime || '',
        attendees: m.attendees || '',
        tags: Array.isArray(m.tags) ? m.tags : [],
        notes: m.notes || '',
        actionItems: (m.actionItems || []).map(ai => ({
            id: String(ai.id || newId()),
            text: ai.text || '',
            assignee: ai.assignee || '',
            dueDate: ai.dueDate || '',
            done: !!ai.done
        })),
        updatedAt: new Date().toISOString()
    };
}

function extractMeetingsFromDocs(docs) {
    return docs
        .filter(d => d.id !== ML_LEGACY_DOC && isMeetingDoc(d.data()))
        .map(d => {
            const data = d.data() || {};
            return { ...data, id: String(data.id || d.id) };
        });
}

function isMeetingDoc(data) {
    return !!data && typeof data === 'object' && typeof data.title === 'string';
}

// ── Migration ─────────────────────────────────────────────────────────────────
function migrateMeetings() {
    meetings.forEach(m => {
        if (!m.id)                 m.id = newId();
        m.id = String(m.id);
        if (!m.actionItems)         m.actionItems = [];
        if (!m.tags)                m.tags = [];
        if (!m.type)                m.type = 'other';
        if (m.pinned === undefined) m.pinned = false;
        if (!m.endTime)             m.endTime = '';
        m.actionItems.forEach(ai => {
            if (ai.id === undefined || ai.id === null || ai.id === '') ai.id = newId();
            ai.id = String(ai.id);
        });
    });
}

// ── Bind Events ───────────────────────────────────────────────────────────────
function bindEvents() {
    // Sidebar nav view buttons
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', () => {
            setView(btn.dataset.view);
            document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            closeSidebar();
        })
    );

    // Type filters
    document.querySelectorAll('.nav-btn[data-type]').forEach(btn =>
        btn.addEventListener('click', () => {
            currentType = btn.dataset.type;
            document.querySelectorAll('.nav-btn[data-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (currentView !== 'all' && currentView !== 'pinned' && currentView !== 'thisweek') setView('all');
            renderMeetings();
            closeSidebar();
        })
    );

    // Search
    document.getElementById('searchInput').addEventListener('input', e => {
        searchQuery = e.target.value.toLowerCase();
        document.getElementById('clearSearch').style.display = searchQuery ? 'flex' : 'none';
        render();
    });
    document.getElementById('clearSearch').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        searchQuery = '';
        document.getElementById('clearSearch').style.display = 'none';
        render();
    });
    document.getElementById('sortSelect').addEventListener('change', e => {
        currentSort = e.target.value;
        renderMeetings();
    });

    // Theme & new meeting
    document.getElementById('themeBtn').addEventListener('click', showThemePicker);
    document.getElementById('newMeetingBtn').addEventListener('click', openNewModal);
    document.getElementById('mobileNewBtn')?.addEventListener('click', openNewModal);

    // Action filter chips
    document.querySelectorAll('.chip-btn[data-afilter]').forEach(btn =>
        btn.addEventListener('click', () => {
            actionFilter = btn.dataset.afilter;
            document.querySelectorAll('.chip-btn[data-afilter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActions();
        })
    );

    // Modal controls
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('saveModalBtn').addEventListener('click', saveModal);
    document.getElementById('addAIBtn').addEventListener('click', () => addAIRow());
    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modalOverlay')) closeModal();
    });

    // AI Summarize button
    document.getElementById('aiSummarizeBtn').addEventListener('click', aiExtractActions);

    // Duplicate button
    document.getElementById('duplicateBtn').addEventListener('click', duplicateMeeting);

    // Notes word count
    document.getElementById('mNotes').addEventListener('input', updateWordCount);

    // Import / Export / Clear
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('exportMdBtn').addEventListener('click', exportMarkdown);
    document.getElementById('exportXlsxBtn').addEventListener('click', exportExcel);
    document.getElementById('importFileInput').addEventListener('change', importJSON);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    // Shortcuts
    document.getElementById('shortcutsBtn').addEventListener('click', showShortcuts);
    document.getElementById('closeShortcutsBtn').addEventListener('click', hideShortcuts);
    document.getElementById('shortcutsModal').addEventListener('click', e => {
        if (e.target === document.getElementById('shortcutsModal')) hideShortcuts();
    });

    document.getElementById('printBtn')?.addEventListener('click', printView);

    // Clear API key
    document.getElementById('clearApiKeyBtn').addEventListener('click', () => {
        if (!localStorage.getItem('ml-gemini-key')) {
            showToast('No API key saved', 'error'); return;
        }
        localStorage.removeItem('ml-gemini-key');
        showToast('API key cleared', 'success');
    });

    // Mobile sidebar
    document.getElementById('mobileMenuBtn')?.addEventListener('click', openSidebar);
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName.toLowerCase();
        const inInput = ['input','textarea','select'].includes(tag);
        const modalOpen = document.getElementById('modalOverlay').style.display !== 'none';

        if (e.key === 'Escape') {
            closeModal();
            hideShortcuts();
            if (searchQuery) {
                document.getElementById('searchInput').value = '';
                searchQuery = '';
                document.getElementById('clearSearch').style.display = 'none';
                render();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && modalOpen) {
            saveModal();
        }
        if (!inInput && !modalOpen) {
            if (e.key === 'n' || e.key === 'N') openNewModal();
            if (e.key === '/') { e.preventDefault(); document.getElementById('searchInput').focus(); }
            if (e.key === '?') showShortcuts();
            if (e.key === '1') { setView('all'); highlightNavBtn('all'); }
            if (e.key === '2') { setView('pinned'); highlightNavBtn('pinned'); }
            if (e.key === '3') { setView('thisweek'); highlightNavBtn('thisweek'); }
            if (e.key === '4') { setView('actions'); highlightNavBtn('actions'); }
            if (e.key === 'p' || e.key === 'P') printView();
            if (e.key === 'e' || e.key === 'E') exportMarkdown();
        }
    });
}

function highlightNavBtn(view) {
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
}

// ── Quick Add Bar ─────────────────────────────────────────────────────────────
function initQuickAdd() {
    const input  = document.getElementById('qaTitle');
    const submit = document.getElementById('qaSubmit');
    const expand = document.getElementById('qaExpand');
    if (!input) return;

    const doQuickAdd = async () => {
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        const type = document.getElementById('qaType').value;
        const now  = new Date();
        const meeting = {
            id: Date.now(), pinned: false, createdAt: now.toISOString(),
            title, type,
            date:  now.toISOString().split('T')[0],
            time:  now.toTimeString().slice(0,5),
            endTime: '', attendees: '', tags: [], notes: '', actionItems: []
        };
        meetings.unshift(meeting);
        await saveData();
        render();
        input.value = '';
        // flash the new card
        setTimeout(() => {
            const card = document.querySelector(`.meeting-card[data-id="${meeting.id}"]`);
            if (card) { card.classList.add('flash-new'); setTimeout(() => card.classList.remove('flash-new'), 900); }
        }, 100);
        showToast(`"${title}" logged`, 'success');
    };

    input.addEventListener('keydown', e => { if (e.key === 'Enter') doQuickAdd(); });
    submit.addEventListener('click', doQuickAdd);
    expand.addEventListener('click', () => {
        const title = input.value.trim();
        openNewModal();
        if (title) {
            document.getElementById('mTitle').value = title;
            document.getElementById('mType').value  = document.getElementById('qaType').value;
            input.value = '';
        }
    });
}

// ── Draft Autosave ─────────────────────────────────────────────────────────────
const DRAFT_KEY = 'ml-draft';
function saveDraft() {
    const draft = {
        title:     document.getElementById('mTitle').value,
        type:      document.getElementById('mType').value,
        date:      document.getElementById('mDate').value,
        time:      document.getElementById('mTime').value,
        endTime:   document.getElementById('mEndTime').value,
        attendees: document.getElementById('mAttendees').value,
        tags:      document.getElementById('mTags').value,
        notes:     document.getElementById('mNotes').value,
        formAIs:   JSON.parse(JSON.stringify(formAIs)),
        editingId
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    try {
        const d = JSON.parse(raw);
        if (!d.title && !d.notes) return false;
        if (!confirm('Restore unsaved draft?')) { clearDraft(); return false; }
        document.getElementById('mTitle').value     = d.title || '';
        document.getElementById('mType').value      = d.type  || 'standup';
        document.getElementById('mDate').value      = d.date  || '';
        document.getElementById('mTime').value      = d.time  || '';
        document.getElementById('mEndTime').value   = d.endTime || '';
        document.getElementById('mAttendees').value = d.attendees || '';
        document.getElementById('mTags').value      = d.tags  || '';
        document.getElementById('mNotes').value     = d.notes || '';
        editingId = d.editingId || null;
        formAIs   = d.formAIs  || [];
        const container = document.getElementById('mActionItems');
        container.innerHTML = '';
        formAIs.forEach(ai => addAIRow(ai));
        updateWordCount();
        return true;
    } catch { return false; }
}
function clearDraft() { localStorage.removeItem(DRAFT_KEY); }
function initDraftAutosave() {
    const fields = ['mTitle','mType','mDate','mTime','mEndTime','mAttendees','mTags','mNotes'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveDraft);
    });
}

// ── Agenda Templates ───────────────────────────────────────────────────────────
const TEMPLATES = {
    standup: `Yesterday:\n- \n\nToday:\n- \n\nBlockers:\n- `,
    review:  `Goals reviewed:\n- \n\nAccomplishments:\n- \n\nGaps / Issues:\n- \n\nNext steps:\n- `,
    retro:   `What went well:\n- \n\nWhat didn't go well:\n- \n\nWhat to improve:\n- \n\nAction items agreed:\n- `,
    planning: `Sprint goal:\n\nStories / tasks:\n- \n\nCapacity:\n\nRisks:\n- \n\nDefinition of done:\n- `
};
function initTemplateChips() {
    document.querySelectorAll('.tpl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tpl  = TEMPLATES[btn.dataset.tpl];
            const area = document.getElementById('mNotes');
            if (!area || !tpl) return;
            if (area.value && !confirm('Replace notes with template?')) return;
            area.value = tpl;
            updateWordCount();
            area.focus();
            saveDraft();
        });
    });
}

// ── Relative Time ─────────────────────────────────────────────────────────────
function relativeTime(dateStr) {
    const d    = new Date(dateStr + 'T00:00:00');
    const now  = new Date(); now.setHours(0,0,0,0);
    const diff = Math.round((now - d) / 86400000);
    if (diff === 0)  return '<span class="rel-time today">Today</span>';
    if (diff === 1)  return '<span class="rel-time yesterday">Yesterday</span>';
    if (diff === -1) return '<span class="rel-time tomorrow">Tomorrow</span>';
    if (diff > 0 && diff < 7)  return `<span class="rel-time recent">${diff}d ago</span>`;
    if (diff > 0 && diff < 30) return `<span class="rel-time">${Math.floor(diff/7)}w ago</span>`;
    return '';
}

// ── Assignee Filter ────────────────────────────────────────────────────────────
let assigneeFilter = '';
function renderAssigneeFilterBar() {
    const bar = document.getElementById('assigneeFilterBar');
    if (!bar) return;
    const assignees = new Set();
    meetings.forEach(m => (m.actionItems||[]).forEach(ai => { if (ai.assignee) assignees.add(ai.assignee); }));
    if (assignees.size === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `
        <span class="afilter-label">Assignee:</span>
        <button class="afilter-chip ${!assigneeFilter?'active':''}" data-a="">All</button>
        ${[...assignees].map(a => `<button class="afilter-chip ${assigneeFilter===a?'active':''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}
    `;
    bar.querySelectorAll('.afilter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            assigneeFilter = btn.dataset.a;
            renderAssigneeFilterBar();
            renderActions();
        });
    });
}

// ── Print / PDF ────────────────────────────────────────────────────────────────
function printView() {
    let list = [...meetings];
    if (currentView === 'pinned')   list = list.filter(m => m.pinned);
    if (currentType !== 'all')      list = list.filter(m => (m.type||'other') === currentType);
    if (searchQuery) list = list.filter(m =>
        m.title.toLowerCase().includes(searchQuery) ||
        (m.notes||'').toLowerCase().includes(searchQuery)
    );
    list.sort((a,b) => new Date(b.date) - new Date(a.date));

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>MinutesLog Export</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'JetBrains Mono',monospace;font-size:11pt;color:#1a1508;background:#fff;padding:2cm}
  h1{font-family:'Playfair Display',serif;font-size:24pt;margin-bottom:6pt;color:#1a1508}
  .meta{font-size:9pt;color:#8a7d68;margin-bottom:2cm;border-bottom:1px solid #ddd;padding-bottom:8pt}
  .meeting{margin-bottom:1.5cm;page-break-inside:avoid;border-left:3px solid #e8a830;padding-left:14pt}
  .meeting-title{font-family:'Playfair Display',serif;font-size:15pt;font-weight:500;margin-bottom:4pt}
  .meeting-date{font-size:9pt;color:#8a7d68;margin-bottom:8pt}
  .meeting-notes{font-size:10.5pt;line-height:1.6;color:#333;white-space:pre-wrap;margin-bottom:8pt}
  .ai-list{margin-top:6pt}
  .ai-item{font-size:10pt;padding:3pt 0;border-bottom:1px solid #f0ead8;display:flex;gap:8pt}
  .ai-done{text-decoration:line-through;color:#aaa}
  .badge{font-size:7.5pt;padding:1.5pt 6pt;border-radius:3pt;background:#f7f3eb;border:1px solid #ddd;margin-right:6pt;text-transform:uppercase;letter-spacing:.5pt}
  @media print{body{padding:1cm}h1{font-size:18pt}}
</style></head><body>
<h1>MinutesLog</h1>
<div class="meta">Exported ${new Date().toLocaleString()} · ${list.length} meeting${list.length!==1?'s':''}</div>
${list.map(m => `
<div class="meeting">
  <div class="meeting-title"><span class="badge">${m.type||'other'}</span>${esc(m.title)}</div>
  <div class="meeting-date">${fmtDateFull(m.date)}${m.time?' · '+fmtTime(m.time):''}${m.attendees?' · '+esc(m.attendees):''}</div>
  ${m.notes?`<div class="meeting-notes">${esc(m.notes)}</div>`:''}
  ${(m.actionItems||[]).length?`<div class="ai-list">${m.actionItems.map(ai=>`<div class="ai-item"><span>${ai.done?'☑':'☐'}</span><span class="${ai.done?'ai-done':''}">${esc(ai.text)}${ai.assignee?' → '+esc(ai.assignee):''}${ai.dueDate?' ('+ai.dueDate+')':''}</span></div>`).join('')}</div>`:''}
</div>`).join('')}
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
}


function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

// ── Views ─────────────────────────────────────────────────────────────────────
function setView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    if (view === 'actions') {
        document.getElementById('view-actions').classList.add('active');
        renderActions();
    } else {
        document.getElementById('view-meetings').classList.add('active');
        const titles = { pinned: 'Pinned Meetings', thisweek: 'This Week', all: 'All Meetings' };
        document.getElementById('viewTitle').textContent = titles[view] || 'All Meetings';
        renderMeetings();
    }
}

function render() {
    renderMeetings();
    renderActions();
    updateStats();
}

// ── Render Meetings ───────────────────────────────────────────────────────────
function renderMeetings() {
    const container = document.getElementById('meetingsList');
    let list = [...meetings];

    if (currentView === 'pinned') list = list.filter(m => m.pinned);
    if (currentView === 'thisweek') {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(0,0,0,0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23,59,59,999);
        list = list.filter(m => {
            const d = new Date(m.date + 'T00:00:00');
            return d >= monday && d <= sunday;
        });
    }
    if (currentType !== 'all') list = list.filter(m => (m.type||'other') === currentType);
    if (searchQuery) list = list.filter(m =>
        m.title.toLowerCase().includes(searchQuery) ||
        (m.notes||'').toLowerCase().includes(searchQuery) ||
        (m.attendees||'').toLowerCase().includes(searchQuery) ||
        (m.tags||[]).some(t => t.toLowerCase().includes(searchQuery)) ||
        (m.actionItems||[]).some(ai => ai.text.toLowerCase().includes(searchQuery))
    );

    if (currentSort === 'date-desc') list.sort((a,b) => new Date(b.date+'T'+(b.time||'00:00')) - new Date(a.date+'T'+(a.time||'00:00')));
    else if (currentSort === 'date-asc')  list.sort((a,b) => new Date(a.date+'T'+(a.time||'00:00')) - new Date(b.date+'T'+(b.time||'00:00')));
    else if (currentSort === 'title')     list.sort((a,b) => a.title.localeCompare(b.title));

    if (currentView === 'all') list.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));

    if (list.length === 0) {
        const icons = { pinned: 'fa-thumbtack', thisweek: 'fa-calendar-week', all: 'fa-book-open' };
        const icon = icons[currentView] || 'fa-book-open';
        const msgs = {
            pinned: ['No pinned meetings', 'Pin important meetings to keep them here'],
            thisweek: ['No meetings this week', 'Schedule a meeting or import existing ones'],
            all: ['No meetings yet', 'Click <strong>New Meeting</strong> to get started']
        };
        const [h, p] = searchQuery
            ? ['No meetings match your search', 'Try different keywords']
            : (msgs[currentView] || msgs.all);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas ${icon}"></i></div>
                <h3>${h}</h3>
                <p>${p}</p>
            </div>`;
        return;
    }

    // Group by month
    const groups = {};
    list.forEach(m => {
        const key = new Date(m.date+'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });

    container.innerHTML = Object.entries(groups).map(([month, mList]) => `
        <div class="month-group">
            <div class="month-label">${month}</div>
            <div class="month-cards">
                ${mList.map(m => renderCard(m)).join('')}
            </div>
        </div>`
    ).join('');
}

// ── Duration Calculation ──────────────────────────────────────────────────────
function calcDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

function renderCard(m) {
    const ais       = m.actionItems || [];
    const aiDone    = ais.filter(ai => ai.done).length;
    const aiOverdue = ais.filter(ai => !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < new Date()).length;
    const tagsHTML  = (m.tags||[]).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const typeCls   = `type-${m.type||'other'}`;
    const dateStr   = new Date(m.date+'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const timeStr   = m.time ? fmtTime(m.time) : '';
    const duration  = calcDuration(m.time, m.endTime);
    const relTime   = relativeTime(m.date);

    // Progress bar for action items
    const progressHTML = ais.length > 0 ? (() => {
        const pct = Math.round((aiDone / ais.length) * 100);
        const allDone = aiDone === ais.length;
        return `
            <div class="ai-progress-wrap" title="${aiDone}/${ais.length} done">
                <div class="ai-progress-bar">
                    <div class="ai-progress-fill ${allDone ? 'complete' : ''}" style="width:${pct}%"></div>
                </div>
                <span class="ai-progress-label ${aiOverdue > 0 ? 'warn' : allDone ? 'done' : ''}">${aiDone}/${ais.length}${aiOverdue > 0 ? ' · '+aiOverdue+' overdue ⚠' : allDone ? ' · All done ✓' : ''}</span>
            </div>`;
    })() : '';

    const notePreview = m.notes
        ? `<p class="card-notes">${esc(m.notes.slice(0, 160))}${m.notes.length > 160 ? '…' : ''}</p>`
        : '';

    const aiList = ais.length ? `
        <div class="card-ai-list">
            ${ais.map(ai => {
                const aiOv = !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < new Date();
                return `<div class="card-ai ${ai.done?'done':''} ${aiOv?'overdue':''}">
                    <span class="card-ai-check" onclick="toggleAI(${m.id},${ai.id})">
                        ${ai.done ? '<i class="fas fa-check-circle"></i>' : '<i class="far fa-circle"></i>'}
                    </span>
                    <span class="card-ai-text">${esc(ai.text)}</span>
                    ${ai.assignee ? `<span class="card-ai-meta"><i class="fas fa-user"></i> ${esc(ai.assignee)}</span>` : ''}
                    ${ai.dueDate  ? `<span class="card-ai-meta ${aiOv?'overdue':''}"><i class="fas fa-calendar"></i> ${fmtDate(ai.dueDate)}${aiOv?' ⚠':''}</span>` : ''}
                </div>`;
            }).join('')}
        </div>` : '';

    return `
    <div class="meeting-card ${m.pinned?'pinned':''}" data-id="${m.id}" data-type="${m.type||'other'}">
        <div class="card-body">
            <div class="card-header">
                <div class="card-header-left">
                    <span class="type-badge ${typeCls}">${m.type||'other'}</span>
                    ${m.pinned ? '<span class="pin-dot" title="Pinned"><i class="fas fa-thumbtack"></i></span>' : ''}
                    ${duration ? `<span class="duration-chip"><i class="fas fa-hourglass-half"></i> ${duration}</span>` : ''}
                </div>
                <div class="card-actions">
                    <button class="card-btn" onclick="togglePin(${m.id})" title="${m.pinned?'Unpin':'Pin'}"><i class="fas fa-thumbtack ${m.pinned?'active':''}"></i></button>
                    <button class="card-btn" onclick="copyMeeting(${m.id})" title="Copy to clipboard"><i class="fas fa-copy"></i></button>
                    <button class="card-btn" onclick="editMeeting(${m.id})" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                    <button class="card-btn danger" onclick="deleteMeeting(${m.id})" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <h3 class="card-title">${esc(m.title)}</h3>
            <div class="card-dateline">
                <span><i class="fas fa-calendar-alt"></i>${dateStr}</span>
                ${relTime ? `<span class="card-dateline-sep">·</span>${relTime}` : ''}
                ${timeStr ? `<span class="card-dateline-sep">·</span><span><i class="fas fa-clock"></i>${timeStr}</span>` : ''}
                ${m.attendees ? `<span class="card-dateline-sep">·</span><span class="dateline-attendees"><i class="fas fa-user-friends"></i>${esc(m.attendees)}</span>` : ''}
            </div>
            ${tagsHTML ? `<div class="card-tags">${tagsHTML}</div>` : ''}
            ${progressHTML}
            ${notePreview}
            ${aiList}
        </div>
    </div>`;
}

// ── Render Action Items ───────────────────────────────────────────────────────
function renderActions() {
    const container = document.getElementById('actionsList');
    const today = new Date(); today.setHours(0,0,0,0);

    let rows = [];
    meetings.forEach(m => {
        (m.actionItems||[]).forEach(ai => {
            const aiDate  = ai.dueDate ? new Date(ai.dueDate+'T00:00:00') : null;
            const overdue = !ai.done && aiDate && aiDate < today;
            rows.push({ ...ai, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date, overdue });
        });
    });

    if (actionFilter === 'open')    rows = rows.filter(r => !r.done);
    if (actionFilter === 'overdue') rows = rows.filter(r => r.overdue);
    if (actionFilter === 'done')    rows = rows.filter(r => r.done);
    if (assigneeFilter) rows = rows.filter(r => r.assignee === assigneeFilter);
    if (searchQuery) rows = rows.filter(r =>
        r.text.toLowerCase().includes(searchQuery) ||
        (r.assignee||'').toLowerCase().includes(searchQuery) ||
        r.meetingTitle.toLowerCase().includes(searchQuery)
    );

    rows.sort((a,b) => {
        if (a.done !== b.done)       return a.done ? 1 : -1;
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return new Date(b.meetingDate) - new Date(a.meetingDate);
    });

    renderAssigneeFilterBar();

    if (rows.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-check-double"></i></div><h3>No action items here</h3><p>Action items you add to meetings will appear here</p></div>`;
        return;
    }

    container.innerHTML = `
        <table class="actions-table">
            <thead><tr>
                <th style="width:32px;"></th>
                <th>Action</th>
                <th>Assignee</th>
                <th>Due Date</th>
                <th>Meeting</th>
                <th>Status</th>
            </tr></thead>
            <tbody>
                ${rows.map(r => `
                <tr class="${r.done?'row-done':''} ${r.overdue?'row-overdue':''}">
                    <td><span class="ai-check-btn" onclick="toggleAI(${r.meetingId},${r.id})">${r.done?'<i class="fas fa-check-circle done-icon"></i>':'<i class="far fa-circle"></i>'}</span></td>
                    <td class="ai-cell-text">${esc(r.text)}</td>
                    <td>${r.assignee ? `<span class="assignee-pill clickable-assignee" onclick="filterByAssignee('${esc(r.assignee)}')" title="Filter by ${esc(r.assignee)}"><i class="fas fa-user"></i> ${esc(r.assignee)}</span>` : '<span class="empty-cell">—</span>'}</td>
                    <td>${r.dueDate ? `<span class="due-pill ${r.overdue?'overdue':''}">${fmtDate(r.dueDate)}${r.overdue?' ⚠':''}</span>` : '<span class="empty-cell">—</span>'}</td>
                    <td><span class="meeting-ref" onclick="editMeeting(${r.meetingId})">${esc(r.meetingTitle)}</span></td>
                    <td><span class="status-pill ${r.done?'status-done':r.overdue?'status-overdue':'status-open'}">${r.done?'Done':r.overdue?'Overdue':'Open'}</span></td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

window.filterByAssignee = function(name) {
    assigneeFilter = assigneeFilter === name ? '' : name;
    renderAssigneeFilterBar();
    renderActions();
};

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
    const today = new Date(); today.setHours(0,0,0,0);
    let open = 0, overdue = 0;
    meetings.forEach(m => {
        (m.actionItems||[]).forEach(ai => {
            if (!ai.done) {
                open++;
                if (ai.dueDate && new Date(ai.dueDate+'T00:00:00') < today) overdue++;
            }
        });
    });
    document.getElementById('ss-total').textContent   = meetings.length;
    document.getElementById('ss-actions').textContent = open;
    document.getElementById('ss-overdue').textContent = overdue;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function setDefaultDateTime() {
    const now = new Date();
    document.getElementById('mDate').valueAsDate = now;
    document.getElementById('mTime').value = now.toTimeString().slice(0,5);
    // Default end time = start + 1 hour
    const end = new Date(now.getTime() + 60*60*1000);
    document.getElementById('mEndTime').value = end.toTimeString().slice(0,5);
}

function updateWordCount() {
    const words = document.getElementById('mNotes').value.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('wordCountBadge').textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

function openNewModal() {
    editingId = null;
    formAIs   = [];
    document.getElementById('modalTitle').textContent   = 'New Meeting';
    document.getElementById('mTitle').value             = '';
    document.getElementById('mType').value              = 'standup';
    document.getElementById('mNotes').value             = '';
    document.getElementById('mAttendees').value         = '';
    document.getElementById('mTags').value              = '';
    document.getElementById('mActionItems').innerHTML   = '';
    document.getElementById('duplicateBtn').style.display = 'none';
    updateWordCount();
    setDefaultDateTime();
    openModal();
    // Check for draft after modal opens
    setTimeout(() => loadDraft(), 50);
}

function openModal() {
    document.getElementById('modalOverlay').style.display = 'flex';
    setTimeout(() => document.getElementById('modalOverlay').classList.add('open'), 10);
    document.getElementById('mTitle').focus();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    setTimeout(() => { document.getElementById('modalOverlay').style.display = 'none'; }, 250);
}

function addAIRow(existing = null) {
    const item = existing || { id: Date.now() + Math.random(), text: '', assignee: '', dueDate: '', done: false };
    if (!existing) formAIs.push(item);

    const container = document.getElementById('mActionItems');
    const row = document.createElement('div');
    row.className = 'mai-row';
    row.innerHTML = `
        <input type="checkbox" class="mai-check" ${item.done?'checked':''}>
        <input type="text"  class="mai-text"     placeholder="Action item…"  value="${esc(item.text)}">
        <input type="text"  class="mai-assignee" placeholder="Assignee"      value="${esc(item.assignee||'')}">
        <input type="date"  class="mai-date"                                  value="${item.dueDate||''}">
        <button type="button" class="mai-remove"><i class="fas fa-times"></i></button>`;

    row.querySelector('.mai-check').addEventListener('change',   e => { item.done     = e.target.checked; });
    row.querySelector('.mai-text').addEventListener('input',     e => { item.text     = e.target.value;   });
    row.querySelector('.mai-assignee').addEventListener('input', e => { item.assignee = e.target.value;   });
    row.querySelector('.mai-date').addEventListener('change',    e => { item.dueDate  = e.target.value;   });
    row.querySelector('.mai-remove').addEventListener('click',   () => {
        formAIs = formAIs.filter(x => x !== item);
        row.remove();
    });

    container.appendChild(row);
    row.querySelector('.mai-text').focus();
}

async function saveModal() {
    const title = document.getElementById('mTitle').value.trim();
    if (!title) { showToast('Please enter a meeting title', 'error'); return; }
    const date = document.getElementById('mDate').value;
    if (!date)  { showToast('Please select a date', 'error'); return; }

    const data = {
        title,
        type:        document.getElementById('mType').value,
        date,
        time:        document.getElementById('mTime').value || '00:00',
        endTime:     document.getElementById('mEndTime').value || '',
        attendees:   document.getElementById('mAttendees').value.trim(),
        tags:        document.getElementById('mTags').value.split(',').map(t=>t.trim()).filter(Boolean),
        notes:       document.getElementById('mNotes').value.trim(),
        actionItems: formAIs.filter(ai => ai.text.trim()),
    };

    if (editingId !== null) {
        const idx = meetings.findIndex(m => m.id === editingId);
        if (idx !== -1) meetings[idx] = { ...meetings[idx], ...data };
        showToast('Meeting updated!', 'success');
    } else {
        meetings.unshift({ id: Date.now(), pinned: false, createdAt: new Date().toISOString(), ...data });
        showToast('Meeting saved!', 'success');
    }

    await saveData();
    render();
    closeModal();
    clearDraft();
}

// ── Meeting Actions ───────────────────────────────────────────────────────────
window.editMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (!m) return;
    editingId = id;
    formAIs   = JSON.parse(JSON.stringify(m.actionItems || []));

    document.getElementById('modalTitle').textContent = 'Edit Meeting';
    document.getElementById('mTitle').value           = m.title;
    document.getElementById('mType').value            = m.type || 'other';
    document.getElementById('mDate').value            = m.date;
    document.getElementById('mTime').value            = m.time || '';
    document.getElementById('mEndTime').value         = m.endTime || '';
    document.getElementById('mAttendees').value       = m.attendees || '';
    document.getElementById('mTags').value            = (m.tags||[]).join(', ');
    document.getElementById('mNotes').value           = m.notes || '';
    document.getElementById('duplicateBtn').style.display = 'inline-flex';
    updateWordCount();

    const container = document.getElementById('mActionItems');
    container.innerHTML = '';
    formAIs.forEach(ai => addAIRow(ai));
    openModal();
};

window.deleteMeeting = async function(id) {
    if (!confirm('Delete this meeting?')) return;
    meetings = meetings.filter(m => m.id !== id);
    await saveData();
    render();
    showToast('Meeting deleted', 'success');
};

window.togglePin = async function(id) {
    const m = meetings.find(x => x.id === id);
    if (m) {
        m.pinned = !m.pinned;
        await saveData();
        render();
        showToast(m.pinned ? 'Pinned ✓' : 'Unpinned', 'success');
    }
};

window.toggleAI = async function(meetingId, aiId) {
    const m = meetings.find(x => x.id === meetingId);
    if (!m) return;
    const ai = m.actionItems.find(x => x.id === aiId);
    if (ai) {
        ai.done = !ai.done;
        await saveData();
        // Check if all actions for this meeting are done → confetti!
        const allDone = m.actionItems.length > 0 && m.actionItems.every(a => a.done);
        if (allDone && ai.done) {
            showToast('🎉 All actions complete!', 'success');
            launchConfetti();
        }
        render();
    }
};

window.copyMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (!m) return;
    const dur = calcDuration(m.time, m.endTime);
    let txt = `${m.title}\n${fmtDateFull(m.date)}`;
    if (m.time) txt += ` at ${fmtTime(m.time)}`;
    if (dur) txt += ` (${dur})`;
    txt += '\n';
    if (m.attendees)         txt += `Attendees: ${m.attendees}\n`;
    if ((m.tags||[]).length) txt += `Tags: ${m.tags.join(', ')}\n`;
    if (m.notes)             txt += `\nNotes:\n${m.notes}\n`;
    if (m.actionItems && m.actionItems.length) {
        txt += `\nAction Items:\n`;
        m.actionItems.forEach(ai => {
            txt += `[${ai.done?'x':' '}] ${ai.text}${ai.assignee?' — '+ai.assignee:''}${ai.dueDate?' (due '+ai.dueDate+')':''}\n`;
        });
    }
    navigator.clipboard.writeText(txt)
        .then(() => showToast('Copied to clipboard!', 'success'))
        .catch(() => showToast('Copy failed', 'error'));
};

// ── Duplicate Meeting ─────────────────────────────────────────────────────────
function duplicateMeeting() {
    if (editingId === null) return;
    const m = meetings.find(x => x.id === editingId);
    if (!m) return;
    closeModal();
    const copy = JSON.parse(JSON.stringify(m));
    copy.id = Date.now();
    copy.title = m.title + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.pinned = false;
    copy.actionItems = copy.actionItems.map(ai => ({ ...ai, id: Date.now() + Math.random(), done: false }));
    meetings.unshift(copy);
    saveData().then(() => {
        render();
        showToast('Meeting duplicated!', 'success');
    });
}

// ── AI Extract Actions (Gemini Flash — free tier) ─────────────────────────────
async function aiExtractActions() {
    const notes = document.getElementById('mNotes').value.trim();
    if (!notes) {
        showToast('Add some notes first!', 'error');
        return;
    }

    // Get or prompt for Gemini API key
    let apiKey = localStorage.getItem('ml-gemini-key') || '';
    if (!apiKey) {
        apiKey = prompt(
            'Enter your FREE Gemini API key to use AI extraction.\n' +
            'It will be saved locally in your browser only.\n\n' +
            'Get one free (no credit card) at:\n' +
            'aistudio.google.com → Get API Key'
        );
        if (!apiKey || !apiKey.trim()) return;
        apiKey = apiKey.trim();
        localStorage.setItem('ml-gemini-key', apiKey);
    }

    document.getElementById('aiLoadingOverlay').style.display = 'flex';

    const prompt_text = `You are a meeting minutes assistant. Given raw meeting notes, extract action items and provide a clean summary.
Respond ONLY with a valid JSON object in this exact format (no markdown, no backticks, no preamble):
{
  "summary": "2-3 sentence concise summary of the meeting",
  "actionItems": [
    { "text": "action description", "assignee": "name or empty string", "dueDate": "YYYY-MM-DD or empty string" }
  ]
}
If no clear action items exist, return an empty array. For due dates, only include if explicitly mentioned. Keep action items concise and actionable.

Meeting notes:
${notes}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt_text }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1000 }
                })
            }
        );

        if (response.status === 400 || response.status === 403) {
            localStorage.removeItem('ml-gemini-key');
            showToast('Invalid API key — cleared, try again', 'error');
            return;
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Replace notes with summary
        if (parsed.summary) {
            document.getElementById('mNotes').value = parsed.summary;
            updateWordCount();
        }

        // Append extracted action items
        if (parsed.actionItems && parsed.actionItems.length > 0) {
            parsed.actionItems.forEach(ai => {
                const item = {
                    id: Date.now() + Math.random(),
                    text: ai.text || '',
                    assignee: ai.assignee || '',
                    dueDate: ai.dueDate || '',
                    done: false
                };
                formAIs.push(item);
                addAIRow(item);
            });
            showToast(`✨ Extracted ${parsed.actionItems.length} action item${parsed.actionItems.length > 1 ? 's' : ''}!`, 'success');
        } else {
            showToast('Notes summarized — no action items found', 'success');
        }

    } catch (err) {
        console.error('AI extract error:', err);
        showToast(`AI failed: ${err.message || 'check console'}`, 'error');
    } finally {
        document.getElementById('aiLoadingOverlay').style.display = 'none';
    }
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#c084fc','#4ade80','#fb923c','#60a5fa','#f472b6','#facc15','#2dd4bf'];
    const particles = Array.from({length: 80}, () => ({
        x: Math.random() * canvas.width,
        y: -10,
        r: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        angle: Math.random() * 360,
        spin: (Math.random() - 0.5) * 6,
        alpha: 1
    }));

    let frame = 0;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.angle += p.spin;
            if (frame > 60) p.alpha -= 0.015;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
            ctx.restore();
        });
        frame++;
        if (frame < 120) requestAnimationFrame(animate);
        else canvas.style.display = 'none';
    }
    animate();
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────
function showShortcuts() {
    document.getElementById('shortcutsModal').style.display = 'flex';
}
function hideShortcuts() {
    document.getElementById('shortcutsModal').style.display = 'none';
}

// ── Import / Export ───────────────────────────────────────────────────────────
function exportJSON() {
    const blob = new Blob([JSON.stringify({ meetings, exportDate: new Date().toISOString() }, null, 2)], { type:'application/json' });
    dl(blob, `minuteslog-${today()}.json`);
    showToast('Exported!', 'success');
}

function exportMarkdown() {
    const lines = ['# MinutesLog Export', `> ${new Date().toLocaleString()}`, ''];
    [...meetings].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(m => {
        const dur = calcDuration(m.time, m.endTime);
        lines.push(`## ${m.title}`);
        lines.push(`*${fmtDateFull(m.date)}${m.time ? ' · ' + fmtTime(m.time) : ''}${dur ? ' · ' + dur : ''}*`);
        if (m.attendees)         lines.push(`**Attendees:** ${m.attendees}`);
        if ((m.tags||[]).length) lines.push(`**Tags:** ${m.tags.join(', ')}`);
        if (m.notes)             lines.push('', m.notes);
        if (m.actionItems && m.actionItems.length) {
            lines.push('', '**Action Items:**');
            m.actionItems.forEach(ai => lines.push(`- [${ai.done?'x':' '}] ${ai.text}${ai.assignee?' — '+ai.assignee:''}${ai.dueDate?' (due '+ai.dueDate+')':''}`));
        }
        lines.push('', '---', '');
    });
    const blob = new Blob([lines.join('\n')], { type:'text/markdown' });
    dl(blob, `minuteslog-${today()}.md`);
    showToast('Markdown exported!', 'success');
}

function exportExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library loading, try again…', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Meetings ──
    const meetRows = [['Title','Type','Date','Start','End','Duration','Attendees','Tags','Notes','Actions Total','Actions Done','Actions Overdue']];
    const today0 = new Date(); today0.setHours(0,0,0,0);
    meetings.forEach(m => {
        const ais      = m.actionItems || [];
        const done     = ais.filter(a => a.done).length;
        const overdue  = ais.filter(a => !a.done && a.dueDate && new Date(a.dueDate+'T00:00:00') < today0).length;
        const dur      = calcDuration(m.time, m.endTime) || '';
        meetRows.push([
            m.title, m.type||'other', m.date, m.time||'', m.endTime||'', dur,
            m.attendees||'', (m.tags||[]).join(', '), m.notes||'',
            ais.length, done, overdue
        ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(meetRows);
    ws1['!cols'] = [32,12,12,8,8,10,24,20,50,8,8,8].map(w => ({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws1, 'Meetings');

    // ── Sheet 2: Action Items ──
    const aiRows = [['Action','Assignee','Due Date','Status','Meeting','Meeting Date']];
    meetings.forEach(m => {
        (m.actionItems||[]).forEach(ai => {
            const overdue = !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < today0;
            aiRows.push([
                ai.text, ai.assignee||'', ai.dueDate||'',
                ai.done ? 'Done' : overdue ? 'Overdue' : 'Open',
                m.title, m.date
            ]);
        });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(aiRows);
    ws2['!cols'] = [40,18,12,10,32,12].map(w => ({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws2, 'Action Items');

    // ── Sheet 3: Summary ──
    const allTypes = ['standup','review','brainstorm','retrospective','demo','planning','other'];
    const typeCounts = Object.fromEntries(allTypes.map(t => [t, 0]));
    meetings.forEach(m => { typeCounts[m.type||'other'] = (typeCounts[m.type||'other']||0) + 1; });
    const allAIs   = meetings.flatMap(m => m.actionItems||[]);
    const summRows = [
        ['MinutesLog Summary', ''],
        ['Exported', new Date().toLocaleString()],
        ['', ''],
        ['Total Meetings', meetings.length],
        ['Total Action Items', allAIs.length],
        ['Done', allAIs.filter(a=>a.done).length],
        ['Open', allAIs.filter(a=>!a.done).length],
        ['Overdue', allAIs.filter(a=>!a.done&&a.dueDate&&new Date(a.dueDate+'T00:00:00')<today0).length],
        ['', ''],
        ['By Type', ''],
        ...allTypes.map(t => [t.charAt(0).toUpperCase()+t.slice(1), typeCounts[t]||0])
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(summRows);
    ws3['!cols'] = [{wch:28},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

    XLSX.writeFile(wb, `minuteslog-${today()}.xlsx`);
    showToast('Excel exported! 3 sheets', 'success');
}

function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const data     = JSON.parse(ev.target.result);
            const imported = Array.isArray(data) ? data : (data.meetings || []);
            if (!confirm(`Import ${imported.length} meetings? Current data will be replaced.`)) return;
            meetings = imported;
            migrateMeetings();
            await saveData();
            render();
            showToast(`Imported ${imported.length} meetings!`, 'success');
        } catch { showToast('Invalid file format', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

async function clearAll() {
    if (!confirm('Delete ALL meetings? This cannot be undone.')) return;
    meetings = [];
    await saveData();
    render();
    showToast('All data cleared', 'success');
}

function dl(blob, name) {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href:url, download:name }).click();
    URL.revokeObjectURL(url);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const THEMES = {
    dark:      { label: 'Amber Dark',    icon: '🟡' },
    light:     { label: 'Amber Light',   icon: '☀️' },
    purple:    { label: 'Deep Purple',   icon: '🟣' },
    lavender:  { label: 'Lavender',      icon: '💜' },
    burgundy:  { label: 'Burgundy',      icon: '🍷' },
    teal:      { label: 'Midnight Teal', icon: '🩵' },
    forest:    { label: 'Forest',        icon: '🌿' },
};

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ml-theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.title = THEMES[theme]?.label || theme;
}

function toggleTheme() {
    // cycle through themes
    const keys = Object.keys(THEMES);
    const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = keys[(keys.indexOf(cur) + 1) % keys.length];
    applyTheme(next);
    showToast(`Theme: ${THEMES[next].label}`, 'success');
}

function showThemePicker() {
    const existing = document.getElementById('themePicker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.id = 'themePicker';
    picker.className = 'theme-picker';
    picker.innerHTML = `
        <div class="theme-picker-title">Choose Theme</div>
        ${Object.entries(THEMES).map(([key, t]) => `
            <button class="theme-option ${document.documentElement.getAttribute('data-theme') === key ? 'active' : ''}" data-theme="${key}">
                <span class="theme-option-icon">${t.icon}</span>
                <span class="theme-option-label">${t.label}</span>
                ${document.documentElement.getAttribute('data-theme') === key ? '<i class="fas fa-check theme-check"></i>' : ''}
            </button>`).join('')}
    `;
    picker.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            picker.remove();
            showToast(`${THEMES[btn.dataset.theme].icon} ${THEMES[btn.dataset.theme].label}`, 'success');
        });
    });

    document.getElementById('themeBtn').parentNode.style.position = 'relative';
    document.getElementById('themeBtn').after(picker);

    // close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target) && e.target.id !== 'themeBtn') {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s)         { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d)     { return d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''; }
function fmtDateFull(d) { return d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}) : ''; }
function fmtTime(t)     { if(!t) return ''; const [h,m]=t.split(':'); const hh=+h; return `${hh%12||12}:${m} ${hh>=12?'PM':'AM'}`; }
function today()        { return new Date().toISOString().split('T')[0]; }