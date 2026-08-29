// ==================== 配置与状态 ====================
const DEFAULT_CATEGORIES = {
    expense: ['餐饮', '奶茶', '交通', '购物', '娱乐', '学习', '日用', '其他'],
    income: ['生活费', '兼职', '红包', '其他']
};
const SYNC_QUEUE_KEY = 'sync_queue_v2';
const SYNC_BOOTSTRAPPED_KEY = 'sync_bootstrapped_v2';
const PENDING_CLOUD_REPLACE_KEY = 'pending_cloud_replace_v2';
const LAST_SYNC_KEY = 'last_sync_at';
const BACKUP_APP = 'shen-moneytracker';
const BACKUP_VERSION = 2;
let state = {
    currentType: 'expense', selectedCategory: null, editCategory: null,
    currentMonth: new Date(), teaRating: 0, editTeaRating: 0,
    editingRecordId: null, editingTeaId: null,
    selectedIce: '正常冰', selectedSugar: '正常糖',
    editIce: '正常冰', editSugar: '正常糖', supabase: null,
    syncPromise: null, fullSyncPromise: null, localRevision: 0
};

// ==================== Supabase ====================
function initSupabase() {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key) {
        try {
            state.supabase = supabase.createClient(url, key);
            renderSyncStatus();
            return true;
        } catch (e) {
            state.supabase = null;
            setConnectionStatus(`连接配置无效：${formatCloudError(e)}`, 'error');
            return false;
        }
    }
    state.supabase = null;
    renderSyncStatus();
    return false;
}

// ==================== 数据层 ====================
function readJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); }
    catch (e) {
        console.warn(`无法读取本地数据：${key}`, e);
        return fallback;
    }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getLocalRecords() {
    const rows = readJson('records', []);
    return Array.isArray(rows) ? rows.map(normalizeRecord) : [];
}
function getLocalTeas() {
    const rows = readJson('teas', []);
    return Array.isArray(rows) ? rows.map(normalizeTea) : [];
}
function getLoveNotes() {
    const rows = readJson('love_notes', []);
    return Array.isArray(rows) ? rows.map(normalizeNote) : [];
}
function getCustomCategories() {
    const value = readJson('custom_categories', {expense: [], income: []});
    return {
        expense: Array.isArray(value && value.expense) ? value.expense.map(String) : [],
        income: Array.isArray(value && value.income) ? value.income.map(String) : []
    };
}
function normalizeRecord(r = {}) {
    if (!r || typeof r !== 'object') r = {};
    return {
        id: String(r.id || generateId()),
        type: r.type === 'income' ? 'income' : 'expense',
        amount: Number(r.amount) || 0,
        category: String(r.category || '其他'),
        date: String(r.date || getTodayStr()),
        time: String(r.time || ''),
        note: String(r.note || ''),
        created_at: String(r.created_at || new Date().toISOString())
    };
}
function normalizeTea(t = {}) {
    if (!t || typeof t !== 'object') t = {};
    const tea = {
        id: String(t.id || generateId()),
        date: String(t.date || getTodayStr()),
        time: String(t.time || ''),
        brand: String(t.brand || ''),
        name: String(t.name || ''),
        price: Number(t.price) || 0,
        rating: Math.max(0, Math.min(5, Number(t.rating) || 0)),
        ice: String(t.ice || '正常冰'),
        sugar: String(t.sugar || '正常糖'),
        created_at: String(t.created_at || new Date().toISOString())
    };
    if (t.recordId) tea.recordId = String(t.recordId);
    return tea;
}
function normalizeNote(n = {}) {
    if (!n || typeof n !== 'object') n = {};
    return {
        id: String(n.id || generateId()),
        content: String(n.content || ''),
        date: String(n.date || getTodayStr()),
        time: String(n.time || ''),
        created_at: String(n.created_at || new Date().toISOString())
    };
}
function recordForCloud(r) { return normalizeRecord(r); }
function teaForCloud(t) {
    const tea = normalizeTea(t);
    delete tea.recordId;
    return tea;
}
function noteForCloud(n) { return normalizeNote(n); }
function getCategories() {
    const c = getCustomCategories();
    return { expense: [...DEFAULT_CATEGORIES.expense, ...c.expense], income: [...DEFAULT_CATEGORIES.income, ...c.income] };
}
function getSyncQueue() {
    const queue = readJson(SYNC_QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
}
function saveSyncQueue(queue) {
    writeJson(SYNC_QUEUE_KEY, queue);
    renderSyncStatus();
}
function queueOperation(table, action, rowId, data) {
    const id = String(rowId);
    const queue = getSyncQueue().filter(op => !(op.table === table && String(op.rowId) === id));
    queue.push({
        id: generateId(), table, action, rowId: id,
        data: action === 'upsert' ? data : undefined,
        queuedAt: new Date().toISOString()
    });
    state.localRevision += 1;
    saveSyncQueue(queue);
}
function queueUpsert(table, row) {
    const data = table === 'records' ? recordForCloud(row) : table === 'milktea' ? teaForCloud(row) : noteForCloud(row);
    queueOperation(table, 'upsert', data.id, data);
}
function queueDelete(table, id) { queueOperation(table, 'delete', id); }
function findLinkedRecordForTea(tea, records = getLocalRecords()) {
    if (!tea) return null;
    if (tea.recordId) {
        const linked = records.find(r => r.id === String(tea.recordId));
        if (linked) return linked;
    }
    const sameId = records.find(r => r.id === String(tea.id) && r.category === '奶茶');
    if (sameId) return sameId;
    const expectedNote = `${tea.brand} - ${tea.name}`;
    return records.find(r => r.category === '奶茶' && r.date === tea.date && (r.time || '') === (tea.time || '') && Number(r.amount) === Number(tea.price) && (r.note || '') === expectedNote) || null;
}
function findLinkedTeaForRecord(record, teas = getLocalTeas()) {
    if (!record) return null;
    const direct = teas.find(t => String(t.recordId || '') === String(record.id));
    if (direct) return direct;
    const sameId = teas.find(t => t.id === String(record.id));
    if (sameId) return sameId;
    if (record.category !== '奶茶') return null;
    return teas.find(t => t.date === record.date && (t.time || '') === (record.time || '') && Number(t.price) === Number(record.amount) && `${t.brand} - ${t.name}` === (record.note || '')) || null;
}
function repairTeaLinks(teas, records) {
    const used = new Set();
    return teas.map(raw => {
        const tea = normalizeTea(raw);
        let linked = findLinkedRecordForTea(tea, records);
        if (linked && used.has(linked.id)) linked = null;
        if (linked) {
            tea.recordId = linked.id;
            used.add(linked.id);
        }
        return tea;
    });
}
async function saveRecord(r) {
    const row = normalizeRecord(r);
    const rs = getLocalRecords().filter(x => x.id !== row.id);
    rs.unshift(row);
    writeJson('records', rs);
    queueUpsert('records', row);
    return flushSyncQueue({silent: true});
}
async function updateRecord(id, updates) {
    const rs = getLocalRecords();
    const old = rs.find(r => r.id === String(id));
    if (!old) return {ok: false, reason: 'not-found'};
    const row = normalizeRecord({...old, ...updates, id: old.id});
    writeJson('records', rs.map(r => r.id === old.id ? row : r));
    queueUpsert('records', row);
    const linkedTea = findLinkedTeaForRecord(old);
    if (linkedTea) {
        const teaUpdates = {price: row.amount, date: row.date, time: row.time};
        const noteParts = row.note.match(/^(.+?)\s-\s(.+)$/);
        if (noteParts) { teaUpdates.brand = noteParts[1]; teaUpdates.name = noteParts[2]; }
        const updatedTea = normalizeTea({...linkedTea, ...teaUpdates, id: linkedTea.id, recordId: row.id});
        writeJson('teas', getLocalTeas().map(t => t.id === linkedTea.id ? updatedTea : t));
        queueUpsert('milktea', updatedTea);
    }
    return flushSyncQueue({silent: true});
}
async function deleteRecord(id) {
    const rowId = String(id);
    const records = getLocalRecords();
    const record = records.find(r => r.id === rowId);
    const linkedTea = findLinkedTeaForRecord(record);
    writeJson('records', records.filter(r => r.id !== rowId));
    queueDelete('records', rowId);
    if (linkedTea) {
        writeJson('teas', getLocalTeas().filter(t => t.id !== linkedTea.id));
        queueDelete('milktea', linkedTea.id);
    }
    return flushSyncQueue({silent: true});
}
async function saveTea(t) {
    const row = normalizeTea(t);
    const ts = getLocalTeas().filter(x => x.id !== row.id);
    ts.unshift(row);
    writeJson('teas', ts);
    queueUpsert('milktea', row);
    return flushSyncQueue({silent: true});
}
async function updateTea(id, updates) {
    const ts = getLocalTeas();
    const old = ts.find(t => t.id === String(id));
    if (!old) return {ok: false, reason: 'not-found'};
    const row = normalizeTea({...old, ...updates, id: old.id});
    writeJson('teas', ts.map(t => t.id === old.id ? row : t));
    queueUpsert('milktea', row);
    return flushSyncQueue({silent: true});
}
async function deleteTea(id) {
    const rowId = String(id);
    const teas = getLocalTeas();
    const tea = teas.find(t => t.id === rowId);
    const linked = findLinkedRecordForTea(tea);
    writeJson('teas', teas.filter(t => t.id !== rowId));
    queueDelete('milktea', rowId);
    if (linked) {
        writeJson('records', getLocalRecords().filter(r => r.id !== linked.id));
        queueDelete('records', linked.id);
    }
    return flushSyncQueue({silent: true});
}
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg) { let el = document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);} el.textContent=msg;el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2000); }
function getTodayStr() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function getNowTime() { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function getDateLabel(dateStr) { const today=getTodayStr(); if(dateStr===today) return '今天'; const y=new Date(); y.setDate(y.getDate()-1); const yStr=`${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`; if(dateStr===yStr) return '昨天'; return dateStr.slice(5).replace('-','月')+'日'; }

// ==================== 主题 ====================
const BUILTIN_THEMES = {
    puppy: {
        name: '小狗',
        vars: {
            '--primary': '#ffb8d4',
            '--primary-light': '#ffe0ec',
            '--primary-dark': '#e879a0',
            '--primary-soft': '#fff5f9',
            '--danger': '#ff7da0',
            '--success': '#a8d99c',
            '--bg': '#fff5f9',
            '--card-bg': '#ffffff',
            '--text': '#5d4954',
            '--text-light': '#bb98a8',
            '--border': '#ffd9e6',
            '--border-dashed': '#ffb8d4',
            '--nav-bg': '#fff5f9'
        },
        stickers: {
            settings: 'assets/stickers/balloon.png',
            home: 'assets/stickers/wave.png',
            stats: 'assets/stickers/scooter.png',
            milktea: 'assets/stickers/pool.png'
        },
        h3Stickers: ['assets/stickers/letter.png'],
        navIcons: {
            home: 'assets/stickers/wave.png',
            stats: 'assets/stickers/scooter.png',
            milktea: 'assets/stickers/pool.png',
            todo: 'assets/stickers/nap.png',
            notes: 'assets/stickers/hug.png'
        }
    },
    hellokitty: {
        name: 'Hello Kitty',
        vars: {
            '--primary': '#ff6b8a',
            '--primary-light': '#ffd9e3',
            '--primary-dark': '#d63867',
            '--primary-soft': '#fff5f8',
            '--danger': '#ff5571',
            '--success': '#a8d99c',
            '--bg': '#fffafc',
            '--card-bg': '#ffffff',
            '--text': '#5d4954',
            '--text-light': '#bb98a8',
            '--border': '#ffd9e6',
            '--border-dashed': '#ff6b8a',
            '--nav-bg': '#fffafc'
        },
        stickers: {
            settings: 'assets/themes/hellokitty/settings.png',
            home: 'assets/themes/hellokitty/home.png',
            stats: 'assets/themes/hellokitty/stats.png',
            milktea: 'assets/themes/hellokitty/milktea.png'
        },
        h3Stickers: ['assets/themes/hellokitty/sushi.png', 'assets/themes/hellokitty/uniform.png'],
        navIcons: {
            home: 'assets/themes/hellokitty/home.png',
            stats: 'assets/themes/hellokitty/stats.png',
            milktea: 'assets/themes/hellokitty/milktea.png',
            todo: 'assets/themes/hellokitty/h3.png',
            notes: 'assets/themes/hellokitty/settings.png'
        }
    }
};
function getThemeNames() {
    const names = readJson('theme_names', {});
    return names && typeof names === 'object' && !Array.isArray(names) ? names : {};
}
function setThemeName(id, name) { const n = getThemeNames(); n[id] = name; localStorage.setItem('theme_names', JSON.stringify(n)); }
function getDisplayName(id) { return getThemeNames()[id] || (BUILTIN_THEMES[id] && BUILTIN_THEMES[id].name) || id; }
function getActiveThemeId() { const id = localStorage.getItem('active_theme'); return BUILTIN_THEMES[id] ? id : 'puppy'; }
function setActiveTheme(id) { localStorage.setItem('active_theme', id); applyTheme(id); }
function applyTheme(id) {
    const t = BUILTIN_THEMES[id] || BUILTIN_THEMES.puppy;
    Object.entries(t.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    const setSrc = (elId, path) => { const el = document.getElementById(elId); if (el) el.src = path; };
    setSrc('btn-go-settings', t.stickers.settings);
    setSrc('sticker-home', t.stickers.home);
    setSrc('sticker-stats', t.stickers.stats);
    setSrc('sticker-milktea', t.stickers.milktea);
    if (t.navIcons) {
        setSrc('nav-icon-home', t.navIcons.home);
        setSrc('nav-icon-stats', t.navIcons.stats);
        setSrc('nav-icon-milktea', t.navIcons.milktea);
        setSrc('nav-icon-todo', t.navIcons.todo);
        setSrc('nav-icon-notes', t.navIcons.notes);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.vars['--bg']) meta.setAttribute('content', t.vars['--bg']);
    randomizeH3Stickers();
}
function randomizeH3Stickers() {
    const t = BUILTIN_THEMES[getActiveThemeId()] || BUILTIN_THEMES.puppy;
    const pool = t.h3Stickers && t.h3Stickers.length ? t.h3Stickers : ['assets/stickers/letter.png'];
    document.querySelectorAll('.card h3').forEach(h3 => {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        h3.style.setProperty('--sticker-h3', `url("${pick}")`);
    });
}
function renderThemeSettings() {
    const sel = document.getElementById('theme-select');
    if (!sel) return;
    const active = getActiveThemeId();
    sel.innerHTML = Object.keys(BUILTIN_THEMES).map(id =>
        `<option value="${esc(id)}"${id === active ? ' selected' : ''}>${esc(getDisplayName(id))}</option>`
    ).join('');
    const input = document.getElementById('theme-rename-input');
    if (input) input.value = getDisplayName(active);
}

// ==================== 渲染 ====================
function renderCategoryGrid(containerId, activeCategory, type, onClick) {
    const grid = document.getElementById(containerId);
    const cats = getCategories()[type || state.currentType];
    grid.innerHTML = cats.map(c => `<div class="category-item${activeCategory===c?' active':''}" data-cat="${esc(c)}">${esc(c)}</div>`).join('');
    grid.querySelectorAll('.category-item').forEach(item => { item.addEventListener('click', () => onClick(item.dataset.cat)); });
}

function onHomeCatClick(cat) { state.selectedCategory = cat; renderCategoryGrid('category-grid', cat, null, onHomeCatClick); }
function renderEditCatGrid(activeCat, type) { renderCategoryGrid('edit-category-grid', activeCat, type, (cat) => { state.editCategory = cat; renderEditCatGrid(cat, type); }); }

function renderRecordList() {
    const list = document.getElementById('record-list');
    let records = getLocalRecords();
    records.sort((a, b) => {
        if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
        if ((a.time || '') !== (b.time || '')) return (b.time || '').localeCompare(a.time || '');
        return (b.created_at || '').localeCompare(a.created_at || '');
    });
    const filterCat = document.getElementById('filter-category').value;
    const filterSearch = document.getElementById('filter-search').value.trim().toLowerCase();
    if (filterCat) records = records.filter(r => r.category === filterCat);
    if (filterSearch) records = records.filter(r => (r.note||'').toLowerCase().includes(filterSearch));
    records = records.slice(0, 80);
    if (records.length === 0) { list.innerHTML = '<div class="empty-state">没有匹配的记录</div>'; return; }
    // 按日期分组
    const groups = {};
    records.forEach(r => { if(!groups[r.date]) groups[r.date]=[]; groups[r.date].push(r); });
    let html = '';
    Object.keys(groups).forEach(date => {
        const dayRecords = groups[date];
        const dayTotal = dayRecords.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
        html += `<div class="date-group-header" data-date="${date}"><span>${getDateLabel(date)}</span><span class="day-total">-¥${dayTotal.toFixed(2)} ▾</span></div>`;
        html += `<div class="date-group-items" data-date="${date}">`;
        dayRecords.forEach(r => {
            html += `<div class="record-item"><div class="record-left" data-id="${r.id}" style="cursor:pointer"><span class="record-category">${esc(r.category)}</span><span class="record-note">${esc(r.time||'')}${r.note?' · '+esc(r.note):''}</span></div><div class="record-right"><span class="record-amount ${r.type}">${r.type==='expense'?'-':'+'}${r.amount.toFixed(2)}</span><span class="record-delete" data-id="${r.id}">✕</span></div></div>`;
        });
        html += `</div>`;
    });
    list.innerHTML = html;
    // 折叠/展开
    list.querySelectorAll('.date-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const items = list.querySelector(`.date-group-items[data-date="${header.dataset.date}"]`);
            const isHidden = items.classList.toggle('collapsed');
            header.querySelector('.day-total').textContent = `-¥${groups[header.dataset.date].filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0).toFixed(2)} ${isHidden?'▸':'▾'}`;
        });
    });
    list.querySelectorAll('.record-left').forEach(el => { el.addEventListener('click', () => openEditRecord(el.dataset.id)); });
    list.querySelectorAll('.record-delete').forEach(btn => { btn.addEventListener('click', async () => { if(confirm('删除？')){await deleteRecord(btn.dataset.id);renderRecordList();renderMonthSummary();} }); });
}

function renderMonthSummary() {
    const now=new Date(), year=now.getFullYear(), month=now.getMonth();
    const records = getLocalRecords().filter(r => { const d=new Date(r.date); return d.getFullYear()===year && d.getMonth()===month; });
    const expense = records.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
    const income = records.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
    document.getElementById('month-summary').innerHTML = `本月支出 <b style="color:var(--danger)">¥${expense.toFixed(2)}</b> · 收入 <b style="color:var(--success)">¥${income.toFixed(2)}</b>`;
}

function renderFilterOptions() {
    const sel = document.getElementById('filter-category');
    const cats = [...getCategories().expense, ...getCategories().income];
    sel.innerHTML = '<option value="">全部分类</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

// ==================== 编辑记录 ====================
function openEditRecord(id) {
    const r = getLocalRecords().find(x => x.id===id); if(!r) return;
    state.editingRecordId = id; state.editCategory = r.category;
    document.getElementById('edit-amount').value = r.amount;
    document.getElementById('edit-date').value = r.date;
    document.getElementById('edit-time').value = r.time || '';
    document.getElementById('edit-note').value = r.note || '';
    renderEditCatGrid(r.category, r.type);
    document.getElementById('modal-edit-record').classList.add('show');
}
function closeEditRecord() { document.getElementById('modal-edit-record').classList.remove('show'); }
async function saveEditRecord() {
    const amount=parseFloat(document.getElementById('edit-amount').value);
    const date=document.getElementById('edit-date').value;
    const time=document.getElementById('edit-time').value;
    const note=document.getElementById('edit-note').value.trim();
    if(!amount||amount<=0){toast('请输入金额');return;}
    await updateRecord(state.editingRecordId, {amount, date, time, note, category: state.editCategory});
    closeEditRecord(); renderRecordList(); renderMonthSummary(); toast(getSyncQueue().length ? '已更新本机，等待同步' : '已更新');
}

// ==================== 编辑奶茶 ====================
function openEditTea(id) {
    const t = getLocalTeas().find(x=>x.id===id); if(!t) return;
    state.editingTeaId=id; state.editTeaRating=t.rating; state.editIce=t.ice||'正常冰'; state.editSugar=t.sugar||'正常糖';
    document.getElementById('edit-tea-date').value=t.date;
    document.getElementById('edit-tea-time').value=t.time||'';
    document.getElementById('edit-tea-brand').value=t.brand;
    document.getElementById('edit-tea-name').value=t.name;
    document.getElementById('edit-tea-price').value=t.price;
    renderEditTeaUI();
    document.getElementById('modal-edit-tea').classList.add('show');
}
function closeEditTea() { document.getElementById('modal-edit-tea').classList.remove('show'); }
function renderEditTeaUI() {
    document.querySelectorAll('#edit-tea-rating .star').forEach((s,i)=>{s.textContent=i<state.editTeaRating?'★':'☆';s.classList.toggle('filled',i<state.editTeaRating);});
    document.querySelectorAll('#edit-ice-options .option-chip').forEach(c=>{c.classList.toggle('active',c.dataset.val===state.editIce);});
    document.querySelectorAll('#edit-sugar-options .option-chip').forEach(c=>{c.classList.toggle('active',c.dataset.val===state.editSugar);});
}
async function saveEditTea() {
    const date=document.getElementById('edit-tea-date').value, time=document.getElementById('edit-tea-time').value;
    const brand=document.getElementById('edit-tea-brand').value.trim(), name=document.getElementById('edit-tea-name').value.trim();
    const price=parseFloat(document.getElementById('edit-tea-price').value);
    if(!brand||!name||!price){toast('请填写完整');return;}
    const tea = getLocalTeas().find(x => x.id===state.editingTeaId);
    const linkedRecord = findLinkedRecordForTea(tea);
    await updateTea(state.editingTeaId, {date,time,brand,name,price,rating:state.editTeaRating,ice:state.editIce,sugar:state.editSugar});
    if(linkedRecord) await updateRecord(linkedRecord.id, {amount:price, date, time, note:`${brand} - ${name}`, category:'奶茶'});
    closeEditTea(); renderTeaList(); renderRecordList(); renderMonthSummary(); toast(getSyncQueue().length ? '已更新本机，等待同步' : '已更新');
}

// ==================== 统计页 ====================
let pieChart=null, barChart=null;
function renderStats() {
    const year=state.currentMonth.getFullYear(), month=state.currentMonth.getMonth();
    document.getElementById('current-month').textContent=`${year}年${month+1}月`;
    const records=getLocalRecords().filter(r=>{const d=new Date(r.date);return d.getFullYear()===year&&d.getMonth()===month;});
    const expense=records.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
    const income=records.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
    document.getElementById('stats-summary').innerHTML=`<div class="stats-box"><div class="label">支出</div><div class="value expense">¥${expense.toFixed(0)}</div></div><div class="stats-box"><div class="label">收入</div><div class="value income">¥${income.toFixed(0)}</div></div><div class="stats-box"><div class="label">结余</div><div class="value balance">¥${(income-expense).toFixed(0)}</div></div>`;
    // 预算条
    const budget=parseFloat(localStorage.getItem('monthly_budget')||'0');
    const budgetBar=document.getElementById('budget-bar');
    if(budget>0){const pct=Math.min((expense/budget)*100,100);const over=expense>budget;budgetBar.innerHTML=`<div class="budget-track"><div class="budget-fill${over?' over':''}" style="width:${pct}%"></div></div><div class="budget-text">${over?'超支':'已用'} ¥${expense.toFixed(0)} / ¥${budget.toFixed(0)}</div>`;}else{budgetBar.innerHTML='<div class="budget-text" style="opacity:0.5">未设置预算，去设置页添加</div>';}
    // 饼图
    const expRecs=records.filter(r=>r.type==='expense');const catMap={};expRecs.forEach(r=>{catMap[r.category]=(catMap[r.category]||0)+r.amount;});
    const labels=Object.keys(catMap),data=Object.values(catMap);
    const colors=['#f78fa7','#fdcb6e','#b57edc','#7dcea0','#74b9ff','#e84393','#fd79a8','#636e72','#00cec9','#fab1a0'];
    if(pieChart)pieChart.destroy();
    pieChart=new Chart(document.getElementById('pie-chart').getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors.slice(0,labels.length),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}}}});
    // 柱状图
    const days=new Date(year,month+1,0).getDate();const daily=new Array(days).fill(0);expRecs.forEach(r=>{daily[new Date(r.date).getDate()-1]+=r.amount;});
    if(barChart)barChart.destroy();
    barChart=new Chart(document.getElementById('bar-chart').getContext('2d'),{type:'bar',data:{labels:Array.from({length:days},(_,i)=>i+1),datasets:[{data:daily,backgroundColor:'rgba(181,126,220,0.6)',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{beginAtZero:true,ticks:{font:{size:10}}}}}});
}

// ==================== 奶茶页 ====================
function renderTeaList() {
    const list=document.getElementById('tea-list'),teas=getLocalTeas();
    teas.sort((a, b) => {
        if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
        if ((a.time || '') !== (b.time || '')) return (b.time || '').localeCompare(a.time || '');
        return (b.created_at || '').localeCompare(a.created_at || '');
    });
    const now=new Date();const mTeas=teas.filter(t=>{const d=new Date(t.date);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
    document.getElementById('milktea-stats').innerHTML=`本月喝了 <b>${mTeas.length}</b> 杯，花了 <b style="color:var(--danger)">¥${mTeas.reduce((s,t)=>s+t.price,0).toFixed(2)}</b>`;
    if(teas.length===0){list.innerHTML='<div class="empty-state">还没有奶茶记录</div>';renderTeaRanking([]);return;}
    list.innerHTML=teas.map(t=>`<div class="tea-item"><div class="tea-header" data-id="${t.id}" style="cursor:pointer"><div><div class="tea-info">${esc(t.name)}</div><div class="tea-brand">${esc(t.brand)}${t.ice?' · '+esc(t.ice):''}${t.sugar?' · '+esc(t.sugar):''}</div></div><span class="tea-delete" data-id="${t.id}">✕</span></div><div class="tea-meta"><span class="tea-date">${esc(t.date)}${t.time?' '+esc(t.time):''}</span><span class="tea-rating">${'★'.repeat(t.rating)}${'☆'.repeat(5-t.rating)}</span><span class="tea-price">¥${t.price.toFixed(2)}</span></div></div>`).join('');
    list.querySelectorAll('.tea-header').forEach(el=>{el.addEventListener('click',(e)=>{if(!e.target.classList.contains('tea-delete'))openEditTea(el.dataset.id);});});
    list.querySelectorAll('.tea-delete').forEach(btn=>{btn.addEventListener('click',async(e)=>{e.stopPropagation();if(confirm('删除？')){await deleteTea(btn.dataset.id);renderTeaList();renderRecordList();renderMonthSummary();}});});
    renderTeaRanking(teas);
}
function renderTeaRanking(teas) {
    const el=document.getElementById('tea-ranking');
    if(teas.length===0){el.innerHTML='<div class="empty-state">暂无数据</div>';return;}
    const sorted=[...teas].sort((a,b)=>b.rating-a.rating||b.price-a.price).slice(0,5);
    const brandCount={};teas.forEach(t=>{brandCount[t.brand]=(brandCount[t.brand]||0)+1;});
    const topBrand=Object.entries(brandCount).sort((a,b)=>b[1]-a[1])[0];
    el.innerHTML=`<div class="ranking-section"><b>最爱喝：</b>${esc(sorted[0].name)}（${esc(sorted[0].brand)}）⭐${sorted[0].rating}</div><div class="ranking-section"><b>最常买：</b>${esc(topBrand[0])}（${topBrand[1]}杯）</div>`;
}

// ==================== 设置页 ====================
function renderCustomCategories() {
    const custom=getCustomCategories();
    const container=document.getElementById('custom-categories-list');
    const all=[...custom.expense.map(c=>({name:c,type:'expense'})),...custom.income.map(c=>({name:c,type:'income'}))];
    if(all.length===0){container.innerHTML='<div class="empty-state">暂无自定义分类</div>';return;}
    container.innerHTML=all.map(c=>`<div class="custom-cat-item"><span>${c.type==='expense'?'支出':'收入'} · ${esc(c.name)}</span><span class="record-delete" data-name="${esc(c.name)}" data-type="${c.type}">✕</span></div>`).join('');
    container.querySelectorAll('.record-delete').forEach(btn=>{btn.addEventListener('click',()=>{const custom=getCustomCategories();custom[btn.dataset.type]=custom[btn.dataset.type].filter(c=>c!==btn.dataset.name);writeJson('custom_categories',custom);renderCustomCategories();renderFilterOptions();toast('已删除');});});
}

// ==================== 云端同步 ====================
function setConnectionStatus(message, type = '') {
    const el = document.getElementById('connection-status');
    if (!el) return;
    el.textContent = message;
    el.className = `connection-status${type ? ` ${type}` : ''}`;
}
function formatCloudError(error) {
    const message = error && (error.message || error.error_description || error.details);
    if (!message) return '未知错误';
    if (/failed to fetch|network|load failed/i.test(message)) return '网络不可用或项目仍在启动';
    if (/jwt|api key|unauthorized|invalid key/i.test(message)) return 'Project URL 或 Anon Key 无效';
    if (/does not exist|not found|relation/i.test(message)) return '数据表不存在，请检查 Supabase 表结构';
    return String(message);
}
function formatSyncTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(date);
}
function renderSyncStatus(message, type) {
    if (message) { setConnectionStatus(message, type); return; }
    const pending = getSyncQueue().length;
    const lastSync = formatSyncTime(localStorage.getItem(LAST_SYNC_KEY));
    if (!state.supabase) {
        setConnectionStatus(pending ? `已保存在本机 · ${pending} 项等待云端连接` : '云端未连接 · 当前数据保存在本机', 'warning');
    } else if (pending) {
        setConnectionStatus(`本机数据安全 · ${pending} 项等待同步`, 'warning');
    } else if (lastSync) {
        setConnectionStatus(`已同步 · ${lastSync}`, 'success');
    } else {
        setConnectionStatus('云端已配置 · 正在等待首次同步', 'syncing');
    }
}
async function checkCloudClient(client) {
    const checks = await Promise.all([
        client.from('records').select('id').limit(1),
        client.from('milktea').select('id').limit(1),
        client.from('love_notes').select('id').limit(1)
    ]);
    const failed = checks.find(result => result.error);
    if (failed) throw failed.error;
    return true;
}
async function flushSyncQueue({silent = false} = {}) {
    if (state.syncPromise) return state.syncPromise;
    if (!state.supabase) {
        renderSyncStatus();
        return {ok: false, reason: 'not-connected', pending: getSyncQueue().length};
    }
    state.syncPromise = (async () => {
        const original = getSyncQueue();
        if (original.length === 0) return {ok: true, pending: 0};
        setConnectionStatus(`正在同步 ${original.length} 项本机更改…`, 'syncing');
        const completedIds = new Set();
        try {
            const groups = new Map();
            original.forEach(op => {
                if (!['records', 'milktea', 'love_notes'].includes(op.table) || !['upsert', 'delete'].includes(op.action)) throw new Error('同步队列包含无效操作');
                const key = `${op.table}:${op.action}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(op);
            });
            for (const group of groups.values()) {
                for (let offset = 0; offset < group.length; offset += 200) {
                    const chunk = group.slice(offset, offset + 200);
                    const result = chunk[0].action === 'delete'
                        ? await state.supabase.from(chunk[0].table).delete().in('id', chunk.map(op => op.rowId))
                        : await state.supabase.from(chunk[0].table).upsert(chunk.map(op => op.data), {onConflict: 'id'});
                    if (result.error) throw result.error;
                    chunk.forEach(op => completedIds.add(op.id));
                }
            }
            const pending = getSyncQueue().filter(op => !completedIds.has(op.id));
            saveSyncQueue(pending);
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            renderSyncStatus();
            if (pending.length) setTimeout(() => flushSyncQueue({silent: true}), 0);
            return {ok: true, pending: pending.length};
        } catch (e) {
            const remaining = getSyncQueue().filter(op => !completedIds.has(op.id));
            saveSyncQueue(remaining);
            setConnectionStatus(`同步失败：${formatCloudError(e)} · ${remaining.length} 项已留在本机`, 'error');
            if (!silent) toast('云端暂时不可用，数据已保存在本机');
            return {ok: false, error: e, pending: remaining.length};
        }
    })();
    try { return await state.syncPromise; }
    finally { state.syncPromise = null; }
}
function enqueueBatch(operations) {
    const map = new Map(getSyncQueue().map(op => [`${op.table}:${op.rowId}`, op]));
    operations.forEach(op => {
        const rowId = String(op.rowId);
        map.set(`${op.table}:${rowId}`, {
            id: generateId(), table: op.table, action: op.action, rowId,
            data: op.action === 'upsert' ? op.data : undefined,
            queuedAt: new Date().toISOString()
        });
    });
    if (operations.length) state.localRevision += 1;
    saveSyncQueue([...map.values()]);
}
function localCloudSnapshot() {
    return {records: getLocalRecords(), teas: getLocalTeas(), notes: getLoveNotes()};
}
function queueFullLocalSnapshot() {
    const snapshot = localCloudSnapshot();
    enqueueBatch([
        ...snapshot.records.map(row => ({table: 'records', action: 'upsert', rowId: row.id, data: recordForCloud(row)})),
        ...snapshot.teas.map(row => ({table: 'milktea', action: 'upsert', rowId: row.id, data: teaForCloud(row)})),
        ...snapshot.notes.map(row => ({table: 'love_notes', action: 'upsert', rowId: row.id, data: noteForCloud(row)}))
    ]);
}
async function fetchAllRows(table) {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; from < 100000; from += pageSize) {
        const {data, error} = await state.supabase.from(table).select('*').range(from, from + pageSize - 1);
        if (error) throw error;
        const page = Array.isArray(data) ? data : [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
    throw new Error(`${table} 数据量超过同步上限`);
}
async function fetchCloudSnapshot() {
    const [records, teas, notes] = await Promise.all([
        fetchAllRows('records'), fetchAllRows('milktea'), fetchAllRows('love_notes')
    ]);
    return {records, teas, notes};
}
function queueExactCloudReplacement(remote) {
    const local = localCloudSnapshot();
    const localIds = {
        records: new Set(local.records.map(row => row.id)),
        teas: new Set(local.teas.map(row => row.id)),
        notes: new Set(local.notes.map(row => row.id))
    };
    const deletes = [
        ...remote.records.filter(row => !localIds.records.has(String(row.id))).map(row => ({table: 'records', action: 'delete', rowId: row.id})),
        ...remote.teas.filter(row => !localIds.teas.has(String(row.id))).map(row => ({table: 'milktea', action: 'delete', rowId: row.id})),
        ...remote.notes.filter(row => !localIds.notes.has(String(row.id))).map(row => ({table: 'love_notes', action: 'delete', rowId: row.id}))
    ];
    const upserts = [
        ...local.records.map(row => ({table: 'records', action: 'upsert', rowId: row.id, data: recordForCloud(row)})),
        ...local.teas.map(row => ({table: 'milktea', action: 'upsert', rowId: row.id, data: teaForCloud(row)})),
        ...local.notes.map(row => ({table: 'love_notes', action: 'upsert', rowId: row.id, data: noteForCloud(row)}))
    ];
    enqueueBatch([...deletes, ...upserts]);
}
function applyCloudSnapshot(snapshot) {
    const records = snapshot.records.map(normalizeRecord);
    const teas = repairTeaLinks(snapshot.teas, records);
    const notes = snapshot.notes.map(normalizeNote);
    writeJson('records', records);
    writeJson('teas', teas);
    writeJson('love_notes', notes);
}
function renderAllDataViews() {
    renderFilterOptions();
    renderRecordList();
    renderMonthSummary();
    renderTeaList();
    renderNotes();
    renderTodoList();
    renderCustomCategories();
    renderThemeSettings();
    renderDailyQuote();
    renderStreak();
    if (document.getElementById('page-stats').classList.contains('active')) renderStats();
}
async function syncNow({silent = false} = {}) {
    if (state.fullSyncPromise) return state.fullSyncPromise;
    if (!state.supabase) {
        renderSyncStatus();
        if (!silent) toast('请先配置 Supabase');
        return {ok: false, reason: 'not-connected'};
    }
    state.fullSyncPromise = (async () => {
        setConnectionStatus('正在核对本机与云端数据…', 'syncing');
        try {
            let handledReplacementToken = null;
            if (!localStorage.getItem(PENDING_CLOUD_REPLACE_KEY) && localStorage.getItem(SYNC_BOOTSTRAPPED_KEY) !== '1') {
                // 第一次升级时先上传本机快照，避免旧数据被云端空表覆盖。
                queueFullLocalSnapshot();
            }

            let snapshot = null;
            let settled = false;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const replacementToken = localStorage.getItem(PENDING_CLOUD_REPLACE_KEY);
                if (replacementToken && replacementToken !== handledReplacementToken) {
                    const remote = await fetchCloudSnapshot();
                    queueExactCloudReplacement(remote);
                    handledReplacementToken = replacementToken;
                }
                const flushed = await flushSyncQueue({silent: true});
                if (!flushed.ok) return flushed;
                const revisionBeforeFetch = state.localRevision;
                snapshot = await fetchCloudSnapshot();
                const latestReplacementToken = localStorage.getItem(PENDING_CLOUD_REPLACE_KEY);
                if (getSyncQueue().length === 0 && revisionBeforeFetch === state.localRevision && (!latestReplacementToken || latestReplacementToken === handledReplacementToken)) {
                    settled = true;
                    break;
                }
            }
            if (!settled) throw new Error('同步期间产生了新的本机更改，请再试一次');

            applyCloudSnapshot(snapshot);
            localStorage.setItem(SYNC_BOOTSTRAPPED_KEY, '1');
            if (localStorage.getItem(PENDING_CLOUD_REPLACE_KEY) === handledReplacementToken) localStorage.removeItem(PENDING_CLOUD_REPLACE_KEY);
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            renderAllDataViews();
            renderSyncStatus();
            if (!silent) toast('本机与云端已同步');
            return {ok: true};
        } catch (e) {
            setConnectionStatus(`同步失败：${formatCloudError(e)} · 本机数据未丢失`, 'error');
            if (!silent) toast('同步失败，本机数据不受影响');
            return {ok: false, error: e};
        }
    })();
    try { return await state.fullSyncPromise; }
    finally { state.fullSyncPromise = null; }
}

// ==================== 备份与恢复 ====================
function collectBackup() {
    return {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exported_at: new Date().toISOString(),
        data: {
            records: getLocalRecords(),
            teas: getLocalTeas(),
            love_notes: getLoveNotes(),
            todos: getTodos(),
            custom_categories: getCustomCategories(),
            monthly_budget: localStorage.getItem('monthly_budget') || '0',
            active_theme: getActiveThemeId(),
            theme_names: getThemeNames()
        }
    };
}
function downloadBackup() {
    const backup = collectBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `记账本完整备份_${getTodayStr()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('完整备份已导出');
}
function normalizeBackup(raw) {
    const data = raw && raw.data && raw.app === BACKUP_APP ? raw.data : raw;
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.teas)) throw new Error('不是有效的记账本备份');
    const records = data.records.map(normalizeRecord);
    const categories = data.custom_categories || data.categories || {expense: [], income: []};
    const todos = Array.isArray(data.todos) ? data.todos.map(value => {
        const todo = value && typeof value === 'object' ? value : {};
        return {
            id: String(todo.id || generateId()), text: String(todo.text || ''), done: Boolean(todo.done),
            created_at: String(todo.created_at || new Date().toISOString())
        };
    }) : [];
    return {
        records,
        teas: repairTeaLinks(data.teas.map(normalizeTea), records),
        love_notes: Array.isArray(data.love_notes) ? data.love_notes.map(normalizeNote) : [],
        todos,
        custom_categories: {
            expense: Array.isArray(categories.expense) ? categories.expense.map(String) : [],
            income: Array.isArray(categories.income) ? categories.income.map(String) : []
        },
        monthly_budget: String(data.monthly_budget == null ? '0' : data.monthly_budget),
        active_theme: BUILTIN_THEMES[data.active_theme] ? data.active_theme : getActiveThemeId(),
        theme_names: data.theme_names && typeof data.theme_names === 'object' && !Array.isArray(data.theme_names) ? data.theme_names : {}
    };
}
function queueKnownReplacement(previous, next) {
    const nextIds = {
        records: new Set(next.records.map(row => row.id)),
        teas: new Set(next.teas.map(row => row.id)),
        notes: new Set(next.love_notes.map(row => row.id))
    };
    enqueueBatch([
        ...previous.records.filter(row => !nextIds.records.has(row.id)).map(row => ({table: 'records', action: 'delete', rowId: row.id})),
        ...previous.teas.filter(row => !nextIds.teas.has(row.id)).map(row => ({table: 'milktea', action: 'delete', rowId: row.id})),
        ...previous.notes.filter(row => !nextIds.notes.has(row.id)).map(row => ({table: 'love_notes', action: 'delete', rowId: row.id})),
        ...next.records.map(row => ({table: 'records', action: 'upsert', rowId: row.id, data: recordForCloud(row)})),
        ...next.teas.map(row => ({table: 'milktea', action: 'upsert', rowId: row.id, data: teaForCloud(row)})),
        ...next.love_notes.map(row => ({table: 'love_notes', action: 'upsert', rowId: row.id, data: noteForCloud(row)}))
    ]);
}
function applyImportedBackup(data) {
    writeJson('records', data.records);
    writeJson('teas', data.teas);
    writeJson('love_notes', data.love_notes);
    writeJson('todos', data.todos);
    writeJson('custom_categories', data.custom_categories);
    localStorage.setItem('monthly_budget', data.monthly_budget);
    localStorage.setItem('active_theme', data.active_theme);
    writeJson('theme_names', data.theme_names);
}
async function importBackupFile(file) {
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const next = normalizeBackup(parsed);
        if (!confirm(`将导入 ${next.records.length} 笔账目、${next.teas.length} 条奶茶记录，并替换当前本机数据。继续吗？`)) return;
        const previous = localCloudSnapshot();
        try { localStorage.setItem('last_pre_import_backup_v2', JSON.stringify(collectBackup())); } catch (e) { console.warn('无法保存导入前快照', e); }
        applyImportedBackup(next);
        queueKnownReplacement(previous, next);
        localStorage.setItem(PENDING_CLOUD_REPLACE_KEY, generateId());
        applyTheme(next.active_theme);
        const budgetInput = document.getElementById('budget-input');
        if (budgetInput) budgetInput.value = next.monthly_budget;
        renderAllDataViews();
        toast('备份已恢复到本机');
        if (state.supabase) {
            const result = await syncNow({silent: true});
            toast(result.ok ? '导入完成，云端已同步' : '导入完成，云端稍后自动补传');
        }
    } catch (e) {
        toast(`导入失败：${e.message}`);
    }
}
async function clearAllData() {
    if (!confirm('确定清空账目、奶茶、留言和待办数据？')) return;
    if (!confirm('此操作不可撤销。真的确定吗？')) return;
    const previous = localCloudSnapshot();
    const next = {records: [], teas: [], love_notes: []};
    queueKnownReplacement(previous, next);
    ['records', 'teas', 'love_notes', 'todos', 'custom_categories', 'monthly_budget'].forEach(key => localStorage.removeItem(key));
    localStorage.setItem(PENDING_CLOUD_REPLACE_KEY, generateId());
    const budgetInput = document.getElementById('budget-input');
    if (budgetInput) budgetInput.value = '';
    renderAllDataViews();
    toast('本机数据已清空');
    if (state.supabase) await syncNow({silent: true});
}

// ==================== 初始化 ====================
function setupChips(id,key){document.querySelectorAll(`#${id} .option-chip`).forEach(c=>{c.addEventListener('click',()=>{document.querySelectorAll(`#${id} .option-chip`).forEach(x=>x.classList.remove('active'));c.classList.add('active');state[key]=c.dataset.val;});});}

function init() {
    initSupabase();
    applyTheme(getActiveThemeId());
    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 500);
        }
    }, 1500);
    document.getElementById('record-date').value=getTodayStr();
    document.getElementById('record-time').value=getNowTime();
    document.getElementById('tea-date').value=getTodayStr();
    document.getElementById('tea-time').value=getNowTime();
    const savedBudget=localStorage.getItem('monthly_budget');
    if(savedBudget) document.getElementById('budget-input').value=savedBudget;

    // 导航
    document.querySelectorAll('.nav-item').forEach(item=>{item.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));item.classList.add('active');document.getElementById(`page-${item.dataset.page}`).classList.add('active');if(item.dataset.page==='stats')renderStats();if(item.dataset.page==='milktea')renderTeaList();if(item.dataset.page==='settings'){renderCustomCategories();renderThemeSettings();renderSyncStatus();}if(item.dataset.page==='notes')renderNotes();if(item.dataset.page==='todo')renderTodoList();});});
    // 设置按钮
    document.getElementById('btn-go-settings').addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-settings').classList.add('active');renderCustomCategories();renderThemeSettings();renderSyncStatus();});

    // 类型切换
    document.querySelectorAll('.toggle-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.currentType=btn.dataset.type;state.selectedCategory=null;renderCategoryGrid('category-grid',null,null,onHomeCatClick);});});

    // 添加记录
    document.getElementById('btn-add').addEventListener('click',async()=>{
        const amount=parseFloat(document.getElementById('amount').value),date=document.getElementById('record-date').value,time=document.getElementById('record-time').value,note=document.getElementById('note').value.trim();
        if(!amount||amount<=0){toast('请输入金额');return;}if(!state.selectedCategory){toast('请选择分类');return;}
        await saveRecord({id:generateId(),type:state.currentType,amount,category:state.selectedCategory,date,time,note,created_at:new Date().toISOString()});
        toast(getSyncQueue().length ? '已保存到本机，等待同步' : '记录成功');document.getElementById('amount').value='';document.getElementById('note').value='';document.getElementById('record-time').value=getNowTime();state.selectedCategory=null;
        renderCategoryGrid('category-grid',null,null,onHomeCatClick);renderRecordList();renderMonthSummary();
    });

    // 筛选
    document.getElementById('filter-category').addEventListener('change',renderRecordList);
    document.getElementById('filter-search').addEventListener('input',renderRecordList);

    // 月份切换
    document.getElementById('prev-month').addEventListener('click',()=>{state.currentMonth.setMonth(state.currentMonth.getMonth()-1);renderStats();});
    document.getElementById('next-month').addEventListener('click',()=>{state.currentMonth.setMonth(state.currentMonth.getMonth()+1);renderStats();});

    // 周报
    document.getElementById('btn-weekly-report').addEventListener('click',()=>{const el=document.getElementById('weekly-report-output');el.textContent=generateWeeklyReport();el.style.display='block';});

    // 奶茶评分
    document.querySelectorAll('#tea-rating .star').forEach(star=>{star.addEventListener('click',()=>{state.teaRating=parseInt(star.dataset.val);document.querySelectorAll('#tea-rating .star').forEach((s,i)=>{s.textContent=i<state.teaRating?'★':'☆';s.classList.toggle('filled',i<state.teaRating);});});});
    setupChips('ice-options','selectedIce');setupChips('sugar-options','selectedSugar');

    // 添加奶茶
    document.getElementById('btn-add-tea').addEventListener('click',async()=>{
        const date=document.getElementById('tea-date').value,time=document.getElementById('tea-time').value,brand=document.getElementById('tea-brand').value.trim(),name=document.getElementById('tea-name').value.trim(),price=parseFloat(document.getElementById('tea-price').value);
        if(!brand){toast('请输入品牌');return;}if(!name){toast('请输入名称');return;}if(!price||price<=0){toast('请输入价格');return;}if(state.teaRating===0){toast('请评分');return;}
        const sharedId=generateId(),createdAt=new Date().toISOString();
        await saveRecord({id:sharedId,type:'expense',amount:price,category:'奶茶',date,time,note:`${brand} - ${name}`,created_at:createdAt});
        await saveTea({id:sharedId,date,time,brand,name,price,rating:state.teaRating,ice:state.selectedIce,sugar:state.selectedSugar,recordId:sharedId,created_at:createdAt});
        toast(getSyncQueue().length ? '已保存到本机，等待同步' : '记录成功');document.getElementById('tea-brand').value='';document.getElementById('tea-name').value='';document.getElementById('tea-price').value='';document.getElementById('tea-time').value=getNowTime();
        state.teaRating=0;document.querySelectorAll('#tea-rating .star').forEach(s=>{s.textContent='☆';s.classList.remove('filled');});
        renderTeaList();renderRecordList();renderMonthSummary();
    });

    // 编辑弹窗
    document.getElementById('btn-cancel-edit').addEventListener('click',closeEditRecord);
    document.getElementById('btn-save-edit').addEventListener('click',saveEditRecord);
    document.getElementById('btn-cancel-edit-tea').addEventListener('click',closeEditTea);
    document.getElementById('btn-save-edit-tea').addEventListener('click',saveEditTea);
    document.querySelectorAll('#edit-tea-rating .star').forEach(star=>{star.addEventListener('click',()=>{state.editTeaRating=parseInt(star.dataset.val);renderEditTeaUI();});});
    document.querySelectorAll('#edit-ice-options .option-chip').forEach(c=>{c.addEventListener('click',()=>{state.editIce=c.dataset.val;renderEditTeaUI();});});
    document.querySelectorAll('#edit-sugar-options .option-chip').forEach(c=>{c.addEventListener('click',()=>{state.editSugar=c.dataset.val;renderEditTeaUI();});});
    document.getElementById('modal-edit-record').addEventListener('click',(e)=>{if(e.target.classList.contains('modal-overlay'))closeEditRecord();});
    document.getElementById('modal-edit-tea').addEventListener('click',(e)=>{if(e.target.classList.contains('modal-overlay'))closeEditTea();});

    // Supabase
    document.getElementById('btn-save-config').addEventListener('click',async()=>{
        const url=document.getElementById('supabase-url').value.trim(),key=document.getElementById('supabase-key').value.trim();
        if(!url||!key){toast('请填写完整');return;}
        setConnectionStatus('正在测试连接和数据表…','syncing');
        try{
            const candidate=supabase.createClient(url,key);
            await checkCloudClient(candidate);
            if(state.fullSyncPromise)await state.fullSyncPromise;
            else if(state.syncPromise)await state.syncPromise;
            const changed=url!==localStorage.getItem('supabase_url')||key!==localStorage.getItem('supabase_key');
            localStorage.setItem('supabase_url',url);localStorage.setItem('supabase_key',key);
            if(changed)localStorage.removeItem(SYNC_BOOTSTRAPPED_KEY);
            state.supabase=candidate;
            const result=await syncNow({silent:true});
            toast(result.ok?'连接成功，数据已同步':'连接成功，数据稍后自动补传');
        }catch(e){setConnectionStatus(`连接失败：${formatCloudError(e)}`,'error');}
    });
    document.getElementById('btn-sync-now').addEventListener('click',()=>syncNow());

    // 预算
    document.getElementById('btn-save-budget').addEventListener('click',()=>{const v=document.getElementById('budget-input').value;localStorage.setItem('monthly_budget',v||'0');toast('预算已保存');});

    // 主题
    document.getElementById('theme-select').addEventListener('change', (e) => {
        setActiveTheme(e.target.value);
        document.getElementById('theme-rename-input').value = getDisplayName(e.target.value);
        toast('已切换主题');
    });
    document.getElementById('btn-save-theme-name').addEventListener('click', () => {
        const name = document.getElementById('theme-rename-input').value.trim();
        if (!name) { toast('请输入主题名'); return; }
        setThemeName(getActiveThemeId(), name);
        renderThemeSettings();
        toast('名称已保存');
    });
    renderThemeSettings();

    // 自定义分类
    document.getElementById('btn-add-category').addEventListener('click',()=>{
        const type=document.getElementById('custom-cat-type').value,name=document.getElementById('custom-cat-name').value.trim();
        if(!name){toast('请输入名称');return;}const custom=getCustomCategories();
        if(custom[type].includes(name)||DEFAULT_CATEGORIES[type].includes(name)){toast('已存在');return;}
        custom[type].push(name);writeJson('custom_categories',custom);document.getElementById('custom-cat-name').value='';renderCustomCategories();renderFilterOptions();toast('添加成功');
    });

    // 导出/清空
    document.getElementById('btn-export').addEventListener('click',downloadBackup);
    document.getElementById('btn-import').addEventListener('click',()=>document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change',async(e)=>{const file=e.target.files&&e.target.files[0];await importBackupFile(file);e.target.value='';});
    document.getElementById('btn-clear').addEventListener('click',clearAllData);

    // 加载配置
    const su=localStorage.getItem('supabase_url'),sk=localStorage.getItem('supabase_key');
    if(su)document.getElementById('supabase-url').value=su;if(sk)document.getElementById('supabase-key').value=sk;

    // 初始渲染
    renderCategoryGrid('category-grid',null,null,onHomeCatClick);
    renderFilterOptions();renderRecordList();renderMonthSummary();
    renderDailyQuote();renderStreak();

    // 随机奶茶
    document.getElementById('btn-random-tea').addEventListener('click', () => {
        const teas = getLocalTeas().filter(t => t.rating >= 3);
        const el = document.getElementById('random-tea-result');
        if (teas.length === 0) { el.innerHTML = '<div class="empty-state">还没有评分≥3的奶茶记录</div>'; return; }
        const pick = teas[Math.floor(Math.random() * teas.length)];
        el.innerHTML = `<div class="random-tea-card"><div class="tea-info">${esc(pick.name)}</div><div class="tea-brand">${esc(pick.brand)} · ${esc(pick.ice||'')} · ${esc(pick.sugar||'')}</div><div class="tea-rating">${'★'.repeat(pick.rating)}${'☆'.repeat(5-pick.rating)} · ¥${pick.price.toFixed(2)}</div></div>`;
    });

    // 留言板
    document.getElementById('btn-save-note').addEventListener('click', async () => {
        const input = document.getElementById('note-input');
        const text = input.value.trim();
        if (!text) { toast('写点什么吧'); return; }
        const note = { id: generateId(), content: text, date: getTodayStr(), time: getNowTime(), created_at: new Date().toISOString() };
        const notes = getLoveNotes();
        notes.unshift(note);
        writeJson('love_notes', notes);
        queueUpsert('love_notes', note);
        await flushSyncQueue({silent: true});
        input.value = '';
        renderNotes();
        toast(getSyncQueue().length ? '留言已保存到本机' : '留言成功 💌');
    });
    renderNotes();

    // 待办清单
    document.getElementById('btn-add-todo').addEventListener('click', () => {
        const input = document.getElementById('todo-input');
        const text = input.value.trim();
        if (!text) { toast('写点什么'); return; }
        const todos = getTodos();
        todos.unshift({ id: generateId(), text, done: false, created_at: new Date().toISOString() });
        saveTodos(todos);
        input.value = '';
        renderTodoList();
        toast('已添加');
    });
    document.getElementById('todo-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-add-todo').click();
    });

    renderSyncStatus();
    if (state.supabase) setTimeout(() => syncNow({silent: true}), 0);
    window.addEventListener('online', () => { if (state.supabase) syncNow({silent: true}); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.supabase && getSyncQueue().length) {
            if (localStorage.getItem(PENDING_CLOUD_REPLACE_KEY)) syncNow({silent: true});
            else flushSyncQueue({silent: true});
        }
    });
    setInterval(() => {
        if (!document.hidden && state.supabase && getSyncQueue().length) {
            if (localStorage.getItem(PENDING_CLOUD_REPLACE_KEY)) syncNow({silent: true});
            else flushSyncQueue({silent: true});
        }
    }, 60000);
}

// ==================== 每日一句 ====================
function renderDailyQuote() {
    const quotes = [
        "今天也要好好吃饭哦",
        "花钱的时候想想我在看着你",
        "记得喝水",
        "今天开心吗",
        "少喝奶茶...算了当我没说",
        "想你了，快来记账让我看看你在干嘛",
        "今天的你也很可爱",
        "钱是赚来花的，但别花太狠",
        "乖，今天辛苦了",
        "你的每一笔消费我都会看到哦",
        "今天有没有吃到好吃的",
        "别熬夜，早点睡",
        "今天过得怎么样",
        "花钱使你快乐，你快乐使我快乐"
    ];
    const today = new Date();
    const idx = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % quotes.length;
    document.getElementById('daily-quote').textContent = `"${quotes[idx]}"`;
}

// ==================== 连续打卡 ====================
function renderStreak() {
    const records = getLocalRecords();
    if (records.length === 0) { document.getElementById('streak-badge').textContent = ''; return; }
    const dates = [...new Set(records.map(r => r.date))].sort().reverse();
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (dates.includes(dStr)) { streak++; } else { break; }
    }
    if (streak > 0) { document.getElementById('streak-badge').innerHTML = `🔥 连续记账 <b>${streak}</b> 天`; }
}

// ==================== 留言板 ====================
function renderNotes() {
    const all = getLoveNotes();
    all.sort((a, b) => {
        if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
        if ((a.time || '') !== (b.time || '')) return (b.time || '').localeCompare(a.time || '');
        return (b.created_at || '').localeCompare(a.created_at || '');
    });
    const notes = all.slice(0, 20);
    const el = document.getElementById('notes-list');
    if (notes.length === 0) { el.innerHTML = '<div class="empty-state">还没有留言</div>'; return; }
    el.innerHTML = notes.map(n => `<div class="record-item"><div class="record-left"><span class="record-category">${esc(n.content)}</span><span class="record-note">${esc(n.date)} ${esc(n.time||'')}</span></div><div class="record-right"><span class="record-delete" data-nid="${n.id}">✕</span></div></div>`).join('');
    el.querySelectorAll('.record-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            let notes = getLoveNotes();
            notes = notes.filter(n => n.id !== btn.dataset.nid);
            writeJson('love_notes', notes);
            queueDelete('love_notes', btn.dataset.nid);
            await flushSyncQueue({silent: true});
            renderNotes();
            toast(getSyncQueue().length ? '已从本机删除，等待同步' : '留言已删除');
        });
    });
}

// ==================== 待办清单 ====================
function getTodos() {
    const todos = readJson('todos', []);
    return Array.isArray(todos) ? todos : [];
}
function saveTodos(todos) { writeJson('todos', todos); }

function renderTodoList() {
    const todos = getTodos();
    const el = document.getElementById('todo-list');
    if (todos.length === 0) { el.innerHTML = '<div class="card"><div class="empty-state">暂无待办事项</div></div>'; return; }
    el.innerHTML = todos.map(t => `
        <div class="todo-item ${t.done ? 'done' : ''}">
            <div class="todo-check" data-id="${t.id}">${t.done ? '✓' : ''}</div>
            <span class="todo-text">${esc(t.text)}</span>
            <span class="todo-delete" data-id="${t.id}">✕</span>
        </div>
    `).join('');
    el.querySelectorAll('.todo-check').forEach(btn => {
        btn.addEventListener('click', () => {
            const todos = getTodos();
            const t = todos.find(x => x.id === btn.dataset.id);
            if (t) { t.done = !t.done; saveTodos(todos); renderTodoList(); }
        });
    });
    el.querySelectorAll('.todo-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            let todos = getTodos();
            todos = todos.filter(x => x.id !== btn.dataset.id);
            saveTodos(todos); renderTodoList();
        });
    });
}

// ==================== 周报生成 ====================
function generateWeeklyReport() {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth()+1).padStart(2,'0')}-${String(weekAgo.getDate()).padStart(2,'0')}`;
    const records = getLocalRecords().filter(r => r.date >= weekAgoStr);
    const expense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const income = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const catMap = {}; records.filter(r => r.type === 'expense').forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const teas = getLocalTeas().filter(t => t.date >= weekAgoStr);
    let report = `📊 本周消费周报\n`;
    report += `日期：${weekAgoStr} ~ ${getTodayStr()}\n\n`;
    report += `💰 总支出：¥${expense.toFixed(2)}\n`;
    report += `💵 总收入：¥${income.toFixed(2)}\n`;
    report += `📈 结余：¥${(income - expense).toFixed(2)}\n\n`;
    if (topCat) report += `🏷️ 花最多的分类：${topCat[0]}（¥${topCat[1].toFixed(2)}）\n`;
    if (teas.length > 0) report += `🧋 本周喝了 ${teas.length} 杯奶茶，花了 ¥${teas.reduce((s, t) => s + t.price, 0).toFixed(2)}\n`;
    report += `\n📝 日均支出：¥${(expense / 7).toFixed(2)}`;
    return report;
}

document.addEventListener('DOMContentLoaded', init);
