// ── State ─────────────────────────────────────────────────────────────────────
let meetings      = [];
let currentView   = 'all';
let currentType   = 'all';
let currentSort   = 'date-desc';
let searchQuery   = '';
let actionFilter  = 'open';
let editingId     = null;
let formAIs       = [];   // action items being edited in modal

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    applyTheme(localStorage.getItem('ml-theme') || 'dark');
    render();
    bindEvents();
    setDefaultDateTime();
});

// ── Bind Events ───────────────────────────────────────────────────────────────
function bindEvents() {
    // Sidebar nav
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', () => {
            setView(btn.dataset.view);
            document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        })
    );
    document.querySelectorAll('.nav-btn[data-type]').forEach(btn =>
        btn.addEventListener('click', () => {
            currentType = btn.dataset.type;
            document.querySelectorAll('.nav-btn[data-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (currentView !== 'all' && currentView !== 'pinned') setView('all');
            renderMeetings();
        })
    );

    // Topbar
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
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('newMeetingBtn').addEventListener('click', openNewModal);

    // Action items view filter
    document.querySelectorAll('.chip-btn[data-afilter]').forEach(btn =>
        btn.addEventListener('click', () => {
            actionFilter = btn.dataset.afilter;
            document.querySelectorAll('.chip-btn[data-afilter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActions();
        })
    );

    // Modal
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
    document.getElementById('saveModalBtn').addEventListener('click', saveModal);
    document.getElementById('addAIBtn').addEventListener('click', () => addAIRow());
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === document.getElementById('modalOverlay')) closeModal(); });

    // Import / Export
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('exportMdBtn').addEventListener('click', exportMarkdown);
    document.getElementById('importFileInput').addEventListener('change', importJSON);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    // Keyboard shortcut: Escape closes modal
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { if (document.getElementById('modalOverlay').style.display !== 'none') saveModal(); }
    });
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
        document.getElementById('viewTitle').textContent = view === 'pinned' ? 'Pinned Meetings' : 'All Meetings';
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

    // Filter
    if (currentView === 'pinned') list = list.filter(m => m.pinned);
    if (currentType !== 'all')   list = list.filter(m => (m.type||'other') === currentType);
    if (searchQuery) list = list.filter(m =>
        m.title.toLowerCase().includes(searchQuery) ||
        (m.notes||'').toLowerCase().includes(searchQuery) ||
        (m.attendees||'').toLowerCase().includes(searchQuery) ||
        (m.tags||[]).some(t => t.toLowerCase().includes(searchQuery)) ||
        (m.actionItems||[]).some(ai => ai.text.toLowerCase().includes(searchQuery))
    );

    // Sort
    if (currentSort === 'date-desc') list.sort((a,b) => new Date(b.date+'T'+(b.time||'00:00')) - new Date(a.date+'T'+(a.time||'00:00')));
    else if (currentSort === 'date-asc')  list.sort((a,b) => new Date(a.date+'T'+(a.time||'00:00')) - new Date(b.date+'T'+(b.time||'00:00')));
    else if (currentSort === 'title')     list.sort((a,b) => a.title.localeCompare(b.title));

    // Pinned always first in all-view
    if (currentView === 'all') list.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));

    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fas fa-book-open"></i></div>
            <h3>${searchQuery ? 'No meetings match your search' : currentView === 'pinned' ? 'No pinned meetings' : 'No meetings yet'}</h3>
            <p>${searchQuery ? 'Try different keywords' : 'Click <strong>New Meeting</strong> to get started'}</p>
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

function renderCard(m) {
    const ais        = m.actionItems || [];
    const aiDone     = ais.filter(ai => ai.done).length;
    const aiOverdue  = ais.filter(ai => !ai.done && ai.dueDate && new Date(ai.dueDate+'T00:00:00') < new Date()).length;
    const tagsHTML   = (m.tags||[]).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const typeCls    = `type-${m.type||'other'}`;

    const dateStr = new Date(m.date+'T00:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const timeStr = m.time ? fmtTime(m.time) : '';

    const aiSummary = ais.length
        ? `<span class="ai-summary ${aiOverdue>0?'warn':aiDone===ais.length?'done':''}">${aiDone}/${ais.length} actions${aiOverdue>0?' · '+aiOverdue+' overdue':''}</span>`
        : '';

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

    const linkedHTML = (m.linkedMeetings||[]).length ? '' : '';

    return `
    <div class="meeting-card ${m.pinned?'pinned':''}" data-id="${m.id}">
        <div class="card-header">
            <div class="card-header-left">
                <span class="type-badge ${typeCls}">${m.type||'other'}</span>
                ${m.pinned ? '<span class="pin-dot" title="Pinned"><i class="fas fa-thumbtack"></i></span>' : ''}
            </div>
            <div class="card-actions">
                <button class="card-btn" onclick="togglePin(${m.id})" title="${m.pinned?'Unpin':'Pin'}"><i class="fas fa-thumbtack ${m.pinned?'active':''}"></i></button>
                <button class="card-btn" onclick="copyMeeting(${m.id})" title="Copy to clipboard"><i class="fas fa-copy"></i></button>
                <button class="card-btn" onclick="editMeeting(${m.id})" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                <button class="card-btn danger" onclick="deleteMeeting(${m.id})" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>

        <h3 class="card-title">${esc(m.title)}</h3>

        <div class="card-meta">
            <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
            ${timeStr ? `<span><i class="fas fa-clock"></i> ${timeStr}</span>` : ''}
            ${m.attendees ? `<span><i class="fas fa-user-friends"></i> ${esc(m.attendees)}</span>` : ''}
        </div>

        ${tagsHTML ? `<div class="card-tags">${tagsHTML}</div>` : ''}
        ${aiSummary ? `<div class="card-ai-badge">${aiSummary}</div>` : ''}
        ${notePreview}
        ${aiList}
    </div>`;
}

// ── Render Action Items View ──────────────────────────────────────────────────
function renderActions() {
    const container = document.getElementById('actionsList');
    const today = new Date(); today.setHours(0,0,0,0);

    let rows = [];
    meetings.forEach(m => {
        (m.actionItems||[]).forEach(ai => {
            const aiDate = ai.dueDate ? new Date(ai.dueDate+'T00:00:00') : null;
            const overdue = !ai.done && aiDate && aiDate < today;
            rows.push({ ...ai, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date, overdue });
        });
    });

    if (actionFilter === 'open')   rows = rows.filter(r => !r.done);
    if (actionFilter === 'overdue')rows = rows.filter(r => r.overdue);
    if (actionFilter === 'done')   rows = rows.filter(r => r.done);

    if (searchQuery) rows = rows.filter(r =>
        r.text.toLowerCase().includes(searchQuery) ||
        (r.assignee||'').toLowerCase().includes(searchQuery) ||
        r.meetingTitle.toLowerCase().includes(searchQuery)
    );

    rows.sort((a,b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return new Date(b.meetingDate) - new Date(a.meetingDate);
    });

    if (rows.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-check-double"></i></div><h3>No action items here</h3><p>Action items you add to meetings appear here</p></div>`;
        return;
    }

    container.innerHTML = `
        <table class="actions-table">
            <thead>
                <tr>
                    <th style="width:32px;"></th>
                    <th>Action</th>
                    <th>Assignee</th>
                    <th>Due Date</th>
                    <th>Meeting</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                <tr class="${r.done?'row-done':''} ${r.overdue?'row-overdue':''}">
                    <td><span class="ai-check-btn" onclick="toggleAI(${r.meetingId},${r.id})">${r.done?'<i class="fas fa-check-circle done-icon"></i>':'<i class="far fa-circle"></i>'}</span></td>
                    <td class="ai-cell-text">${esc(r.text)}</td>
                    <td>${r.assignee ? `<span class="assignee-pill"><i class="fas fa-user"></i> ${esc(r.assignee)}</span>` : '<span class="empty-cell">—</span>'}</td>
                    <td>${r.dueDate ? `<span class="due-pill ${r.overdue?'overdue':''}">${fmtDate(r.dueDate)}${r.overdue?' ⚠':''}</span>` : '<span class="empty-cell">—</span>'}</td>
                    <td><span class="meeting-ref" onclick="editMeeting(${r.meetingId})">${esc(r.meetingTitle)}</span></td>
                    <td><span class="status-pill ${r.done?'status-done':r.overdue?'status-overdue':'status-open'}">${r.done?'Done':r.overdue?'Overdue':'Open'}</span></td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
    const today = new Date(); today.setHours(0,0,0,0);
    let openActions = 0, overdueActions = 0;
    meetings.forEach(m => {
        (m.actionItems||[]).forEach(ai => {
            if (!ai.done) {
                openActions++;
                if (ai.dueDate && new Date(ai.dueDate+'T00:00:00') < today) overdueActions++;
            }
        });
    });
    document.getElementById('ss-total').textContent   = meetings.length;
    document.getElementById('ss-actions').textContent = openActions;
    document.getElementById('ss-overdue').textContent = overdueActions;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function setDefaultDateTime() {
    const now = new Date();
    document.getElementById('mDate').valueAsDate = now;
    document.getElementById('mTime').value = now.toTimeString().slice(0,5);
}

function openNewModal() {
    editingId = null;
    formAIs   = [];
    document.getElementById('modalTitle').textContent = 'New Meeting';
    document.getElementById('mTitle').value     = '';
    document.getElementById('mType').value      = 'standup';
    document.getElementById('mNotes').value     = '';
    document.getElementById('mAttendees').value = '';
    document.getElementById('mTags').value      = '';
    document.getElementById('mActionItems').innerHTML = '';
    setDefaultDateTime();
    openModal();
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

    row.querySelector('.mai-check').addEventListener('change',   e => item.done     = e.target.checked);
    row.querySelector('.mai-text').addEventListener('input',     e => item.text     = e.target.value);
    row.querySelector('.mai-assignee').addEventListener('input', e => item.assignee = e.target.value);
    row.querySelector('.mai-date').addEventListener('change',    e => item.dueDate  = e.target.value);
    row.querySelector('.mai-remove').addEventListener('click',   () => {
        formAIs = formAIs.filter(x => x !== item);
        row.remove();
    });

    container.appendChild(row);
    row.querySelector('.mai-text').focus();
}

function saveModal() {
    const title = document.getElementById('mTitle').value.trim();
    if (!title) { showToast('Please enter a meeting title', 'error'); return; }
    const date = document.getElementById('mDate').value;
    if (!date)  { showToast('Please select a date', 'error'); return; }

    const data = {
        title,
        type:        document.getElementById('mType').value,
        date,
        time:        document.getElementById('mTime').value || '00:00',
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

    saveData();
    render();
    closeModal();
}

// ── Meeting Actions ───────────────────────────────────────────────────────────
window.editMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (!m) return;
    editingId = id;
    formAIs   = JSON.parse(JSON.stringify(m.actionItems || []));

    document.getElementById('modalTitle').textContent  = 'Edit Meeting';
    document.getElementById('mTitle').value            = m.title;
    document.getElementById('mType').value             = m.type || 'other';
    document.getElementById('mDate').value             = m.date;
    document.getElementById('mTime').value             = m.time || '';
    document.getElementById('mAttendees').value        = m.attendees || '';
    document.getElementById('mTags').value             = (m.tags||[]).join(', ');
    document.getElementById('mNotes').value            = m.notes || '';

    const container = document.getElementById('mActionItems');
    container.innerHTML = '';
    formAIs.forEach(ai => addAIRow(ai));

    openModal();
};

window.deleteMeeting = function(id) {
    if (!confirm('Delete this meeting?')) return;
    meetings = meetings.filter(m => m.id !== id);
    saveData(); render();
    showToast('Meeting deleted', 'success');
};

window.togglePin = function(id) {
    const m = meetings.find(x => x.id === id);
    if (m) { m.pinned = !m.pinned; saveData(); render(); showToast(m.pinned ? 'Pinned' : 'Unpinned', 'success'); }
};

window.toggleAI = function(meetingId, aiId) {
    const m = meetings.find(x => x.id === meetingId);
    if (!m) return;
    const ai = m.actionItems.find(x => x.id === aiId);
    if (ai) { ai.done = !ai.done; saveData(); render(); }
};

window.copyMeeting = function(id) {
    const m = meetings.find(x => x.id === id);
    if (!m) return;
    let txt = `${m.title}\n`;
    txt += `${fmtDateFull(m.date)}${m.time ? ' at ' + fmtTime(m.time) : ''}\n`;
    if (m.attendees) txt += `Attendees: ${m.attendees}\n`;
    if ((m.tags||[]).length) txt += `Tags: ${m.tags.join(', ')}\n`;
    if (m.notes) txt += `\nNotes:\n${m.notes}\n`;
    if (m.actionItems && m.actionItems.length) {
        txt += `\nAction Items:\n`;
        m.actionItems.forEach(ai => { txt += `[${ai.done?'x':' '}] ${ai.text}${ai.assignee?' — '+ai.assignee:''}${ai.dueDate?' (due '+ai.dueDate+')':''}\n`; });
    }
    navigator.clipboard.writeText(txt).then(() => showToast('Copied!','success')).catch(()=>showToast('Copy failed','error'));
};

// ── Import / Export ───────────────────────────────────────────────────────────
function exportJSON() {
    const blob = new Blob([JSON.stringify({ meetings, exportDate: new Date().toISOString() }, null, 2)], { type:'application/json' });
    dl(blob, `minuteslog-${today()}.json`);
    showToast('Exported!','success');
}

function exportMarkdown() {
    const lines = ['# MinutesLog Export', `> ${new Date().toLocaleString()}`, ''];
    const sorted = [...meetings].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(m => {
        lines.push(`## ${m.title}`);
        lines.push(`*${fmtDateFull(m.date)}${m.time ? ' · ' + fmtTime(m.time) : ''}*`);
        if (m.attendees) lines.push(`**Attendees:** ${m.attendees}`);
        if ((m.tags||[]).length) lines.push(`**Tags:** ${m.tags.join(', ')}`);
        if (m.notes) lines.push('', m.notes);
        if (m.actionItems && m.actionItems.length) {
            lines.push('', '**Action Items:**');
            m.actionItems.forEach(ai => lines.push(`- [${ai.done?'x':' '}] ${ai.text}${ai.assignee?' — '+ai.assignee:''}${ai.dueDate?' (due '+ai.dueDate+')':''}`));
        }
        lines.push('', '---', '');
    });
    const blob = new Blob([lines.join('\n')], { type:'text/markdown' });
    dl(blob, `minuteslog-${today()}.md`);
    showToast('Markdown exported!','success');
}

function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            const imported = Array.isArray(data) ? data : (data.meetings || []);
            if (!confirm(`Import ${imported.length} meetings? This will replace all current data.`)) return;
            meetings = imported;
            saveData(); render();
            showToast(`Imported ${imported.length} meetings!`, 'success');
        } catch { showToast('Invalid file format', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function clearAll() {
    if (!confirm('Delete ALL meetings? This cannot be undone.')) return;
    meetings = [];
    saveData(); render();
    showToast('All data cleared', 'success');
}

function dl(blob, name) {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href:url, download:name }).click();
    URL.revokeObjectURL(url);
}

// ── Storage ───────────────────────────────────────────────────────────────────
function loadData() {
    const saved = localStorage.getItem('minuteslog-v2');
    meetings = saved ? JSON.parse(saved) : [];
    // Migrate: ensure fields
    meetings.forEach(m => {
        if (!m.actionItems)  m.actionItems = [];
        if (!m.tags)         m.tags = [];
        if (!m.type)         m.type = 'other';
        if (m.pinned === undefined) m.pinned = false;
        m.actionItems.forEach(ai => { if (ai.id === undefined) ai.id = Date.now() + Math.random(); });
    });
}

function saveData() {
    localStorage.setItem('minuteslog-v2', JSON.stringify(meetings));
    updateStats();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ml-theme', theme);
    const icon = document.querySelector('#themeBtn i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}
function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d)     { return d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''; }
function fmtDateFull(d) { return d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}) : ''; }
function fmtTime(t)     { if(!t) return ''; const [h,m]=t.split(':'); const hh=+h; return `${hh%12||12}:${m} ${hh>=12?'PM':'AM'}`; }
function today()        { return new Date().toISOString().split('T')[0]; }
