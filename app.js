// ==================== 配置与状态 ====================
const DEFAULT_CATEGORIES = {
    expense: ['餐饮', '奶茶', '交通', '购物', '娱乐', '学习', '日用', '其他'],
    income: ['生活费', '兼职', '红包', '其他']
};

let state = {
    currentType: 'expense',
    selectedCategory: null,
    currentMonth: new Date(),
    teaRating: 0,
    editTeaRating: 0,
    editingRecordId: null,
    editingTeaId: null,
    selectedIce: '正常冰',
    selectedSugar: '正常糖',
    editIce: '正常冰',
    editSugar: '正常糖',
    supabase: null
};

// ==================== Supabase 连接 ====================
function initSupabase() {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key) {
        try {
            state.supabase = supabase.createClient(url, key);
            return true;
        } catch (e) { return false; }
    }
    return false;
}

// ==================== 数据层 ====================
async function saveRecord(record) {
    const records = getLocalRecords();
    records.unshift(record);
    localStorage.setItem('records', JSON.stringify(records));
    if (state.supabase) {
        try { await state.supabase.from('records').insert(record); } catch (e) {}
    }
}

async function updateRecord(id, updates) {
    let records = getLocalRecords();
    records = records.map(r => r.id === id ? { ...r, ...updates } : r);
    localStorage.setItem('records', JSON.stringify(records));
    if (state.supabase) {
        try { await state.supabase.from('records').update(updates).eq('id', id); } catch (e) {}
    }
}

async function deleteRecord(id) {
    let records = getLocalRecords();
    records = records.filter(r => r.id !== id);
    localStorage.setItem('records', JSON.stringify(records));
    if (state.supabase) {
        try { await state.supabase.from('records').delete().eq('id', id); } catch (e) {}
    }
}

async function saveTea(tea) {
    const teas = getLocalTeas();
    teas.unshift(tea);
    localStorage.setItem('teas', JSON.stringify(teas));
    if (state.supabase) {
        try { await state.supabase.from('milktea').insert(tea); } catch (e) {}
    }
}

async function updateTea(id, updates) {
    let teas = getLocalTeas();
    teas = teas.map(t => t.id === id ? { ...t, ...updates } : t);
    localStorage.setItem('teas', JSON.stringify(teas));
    if (state.supabase) {
        try { await state.supabase.from('milktea').update(updates).eq('id', id); } catch (e) {}
    }
}

async function deleteTea(id) {
    let teas = getLocalTeas();
    teas = teas.filter(t => t.id !== id);
    localStorage.setItem('teas', JSON.stringify(teas));
    if (state.supabase) {
        try { await state.supabase.from('milktea').delete().eq('id', id); } catch (e) {}
    }
}

function getLocalRecords() { return JSON.parse(localStorage.getItem('records') || '[]'); }
function getLocalTeas() { return JSON.parse(localStorage.getItem('teas') || '[]'); }
function getCategories() {
    const custom = JSON.parse(localStorage.getItem('custom_categories') || '{"expense":[],"income":[]}');
    return {
        expense: [...DEFAULT_CATEGORIES.expense, ...custom.expense],
        income: [...DEFAULT_CATEGORIES.income, ...custom.income]
    };
}

// ==================== 工具函数 ====================
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}
function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getNowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ==================== UI 渲染 ====================
function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const categories = getCategories()[state.currentType];
    grid.innerHTML = categories.map(cat =>
        `<div class="category-item${state.selectedCategory === cat ? ' active' : ''}" data-cat="${cat}">${cat}</div>`
    ).join('');
    grid.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => { state.selectedCategory = item.dataset.cat; renderCategoryGrid(); });
    });
}

function renderRecordList() {
    const list = document.getElementById('record-list');
    const records = getLocalRecords().slice(0, 50);
    if (records.length === 0) { list.innerHTML = '<div class="empty-state">还没有记录，记一笔吧</div>'; return; }
    list.innerHTML = records.map(r => `
        <div class="record-item">
            <div class="record-left" data-id="${r.id}" style="cursor:pointer">
                <span class="record-category">${r.category}</span>
                <span class="record-note">${r.date}${r.time ? ' ' + r.time : ''}${r.note ? ' · ' + r.note : ''}</span>
            </div>
            <div class="record-right">
                <span class="record-amount ${r.type}">${r.type === 'expense' ? '-' : '+'}${r.amount.toFixed(2)}</span>
                <span class="record-delete" data-id="${r.id}">✕</span>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.record-left').forEach(el => {
        el.addEventListener('click', () => openEditRecord(el.dataset.id));
    });
    list.querySelectorAll('.record-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('删除这条记录？')) { await deleteRecord(btn.dataset.id); renderRecordList(); renderMonthSummary(); }
        });
    });
}

function renderMonthSummary() {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    const records = getLocalRecords().filter(r => { const d = new Date(r.date); return d.getFullYear() === year && d.getMonth() === month; });
    const expense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const income = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    document.getElementById('month-summary').innerHTML = `本月支出 <b style="color:var(--danger)">¥${expense.toFixed(2)}</b> · 收入 <b style="color:var(--success)">¥${income.toFixed(2)}</b>`;
}

// ==================== 编辑记录弹窗 ====================
function openEditRecord(id) {
    const record = getLocalRecords().find(r => r.id === id);
    if (!record) return;
    state.editingRecordId = id;
    document.getElementById('edit-amount').value = record.amount;
    document.getElementById('edit-date').value = record.date;
    document.getElementById('edit-time').value = record.time || '';
    document.getElementById('edit-note').value = record.note || '';
    document.getElementById('modal-edit-record').classList.add('show');
}

function closeEditRecord() {
    document.getElementById('modal-edit-record').classList.remove('show');
    state.editingRecordId = null;
}

async function saveEditRecord() {
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const date = document.getElementById('edit-date').value;
    const time = document.getElementById('edit-time').value;
    const note = document.getElementById('edit-note').value.trim();
    if (!amount || amount <= 0) { toast('请输入金额'); return; }
    await updateRecord(state.editingRecordId, { amount, date, time, note });
    closeEditRecord();
    renderRecordList();
    renderMonthSummary();
    toast('已更新');
}

// ==================== 编辑奶茶弹窗 ====================
function openEditTea(id) {
    const tea = getLocalTeas().find(t => t.id === id);
    if (!tea) return;
    state.editingTeaId = id;
    document.getElementById('edit-tea-date').value = tea.date;
    document.getElementById('edit-tea-time').value = tea.time || '';
    document.getElementById('edit-tea-brand').value = tea.brand;
    document.getElementById('edit-tea-name').value = tea.name;
    document.getElementById('edit-tea-price').value = tea.price;
    state.editTeaRating = tea.rating;
    state.editIce = tea.ice || '正常冰';
    state.editSugar = tea.sugar || '正常糖';
    renderEditTeaRating();
    renderEditOptions();
    document.getElementById('modal-edit-tea').classList.add('show');
}

function closeEditTea() {
    document.getElementById('modal-edit-tea').classList.remove('show');
    state.editingTeaId = null;
}

function renderEditTeaRating() {
    document.querySelectorAll('#edit-tea-rating .star').forEach((s, i) => {
        s.textContent = i < state.editTeaRating ? '★' : '☆';
        s.classList.toggle('filled', i < state.editTeaRating);
    });
}

function renderEditOptions() {
    document.querySelectorAll('#edit-ice-options .option-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.val === state.editIce);
    });
    document.querySelectorAll('#edit-sugar-options .option-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.val === state.editSugar);
    });
}

async function saveEditTea() {
    const date = document.getElementById('edit-tea-date').value;
    const time = document.getElementById('edit-tea-time').value;
    const brand = document.getElementById('edit-tea-brand').value.trim();
    const name = document.getElementById('edit-tea-name').value.trim();
    const price = parseFloat(document.getElementById('edit-tea-price').value);
    if (!brand || !name || !price) { toast('请填写完整'); return; }
    await updateTea(state.editingTeaId, { date, time, brand, name, price, rating: state.editTeaRating, ice: state.editIce, sugar: state.editSugar });
    closeEditTea();
    renderTeaList();
    toast('已更新');
}

// ==================== 统计页 ====================
let pieChart = null;
let barChart = null;

function renderStats() {
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    document.getElementById('current-month').textContent = `${year}年${month + 1}月`;
    const records = getLocalRecords().filter(r => { const d = new Date(r.date); return d.getFullYear() === year && d.getMonth() === month; });
    const expense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const income = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const balance = income - expense;
    document.getElementById('stats-summary').innerHTML = `
        <div class="stats-box"><div class="label">支出</div><div class="value expense">¥${expense.toFixed(0)}</div></div>
        <div class="stats-box"><div class="label">收入</div><div class="value income">¥${income.toFixed(0)}</div></div>
        <div class="stats-box"><div class="label">结余</div><div class="value balance">¥${balance.toFixed(0)}</div></div>
    `;
    const expenseRecords = records.filter(r => r.type === 'expense');
    const categoryMap = {};
    expenseRecords.forEach(r => { categoryMap[r.category] = (categoryMap[r.category] || 0) + r.amount; });
    const labels = Object.keys(categoryMap);
    const data = Object.values(categoryMap);
    const colors = ['#f78fa7','#fdcb6e','#b57edc','#7dcea0','#74b9ff','#e84393','#fd79a8','#636e72','#00cec9','#fab1a0'];
    if (pieChart) pieChart.destroy();
    const pieCtx = document.getElementById('pie-chart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyExpense = new Array(daysInMonth).fill(0);
    expenseRecords.forEach(r => { const day = new Date(r.date).getDate(); dailyExpense[day - 1] += r.amount; });
    if (barChart) barChart.destroy();
    const barCtx = document.getElementById('bar-chart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: Array.from({length: daysInMonth}, (_, i) => i+1), datasets: [{ data: dailyExpense, backgroundColor: 'rgba(181,126,220,0.6)', borderRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { font: { size: 10 } } } } }
    });
}

// ==================== 奶茶页 ====================
function renderTeaList() {
    const list = document.getElementById('tea-list');
    const teas = getLocalTeas();
    const now = new Date();
    const monthTeas = teas.filter(t => { const d = new Date(t.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const monthTotal = monthTeas.reduce((s, t) => s + t.price, 0);
    document.getElementById('milktea-stats').innerHTML = `本月喝了 <b>${monthTeas.length}</b> 杯，花了 <b style="color:var(--danger)">¥${monthTotal.toFixed(2)}</b>`;
    if (teas.length === 0) { list.innerHTML = '<div class="empty-state">还没有奶茶记录</div>'; return; }
    list.innerHTML = teas.map(t => `
        <div class="tea-item">
            <div class="tea-header" data-id="${t.id}" style="cursor:pointer">
                <div>
                    <div class="tea-info">${t.name}</div>
                    <div class="tea-brand">${t.brand}${t.ice ? ' · '+t.ice : ''}${t.sugar ? ' · '+t.sugar : ''}</div>
                </div>
                <span class="tea-delete" data-id="${t.id}">✕</span>
            </div>
            <div class="tea-meta">
                <span class="tea-date">${t.date}${t.time ? ' '+t.time : ''}</span>
                <span class="tea-rating">${'★'.repeat(t.rating)}${'☆'.repeat(5-t.rating)}</span>
                <span class="tea-price">¥${t.price.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.tea-header').forEach(el => {
        el.addEventListener('click', (e) => { if (!e.target.classList.contains('tea-delete')) openEditTea(el.dataset.id); });
    });
    list.querySelectorAll('.tea-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => { e.stopPropagation(); if (confirm('删除？')) { await deleteTea(btn.dataset.id); renderTeaList(); } });
    });
}

// ==================== 设置页 ====================
function renderCustomCategories() {
    const custom = JSON.parse(localStorage.getItem('custom_categories') || '{"expense":[],"income":[]}');
    const container = document.getElementById('custom-categories-list');
    const all = [...custom.expense.map(c => ({name:c,type:'expense'})), ...custom.income.map(c => ({name:c,type:'income'}))];
    if (all.length === 0) { container.innerHTML = '<div class="empty-state">暂无自定义分类</div>'; return; }
    container.innerHTML = all.map(c => `<div class="custom-cat-item"><span>${c.type==='expense'?'支出':'收入'} · ${c.name}</span><span class="record-delete" data-name="${c.name}" data-type="${c.type}">✕</span></div>`).join('');
    container.querySelectorAll('.record-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const custom = JSON.parse(localStorage.getItem('custom_categories') || '{"expense":[],"income":[]}');
            custom[btn.dataset.type] = custom[btn.dataset.type].filter(c => c !== btn.dataset.name);
            localStorage.setItem('custom_categories', JSON.stringify(custom));
            renderCustomCategories(); renderCategoryGrid(); toast('已删除');
        });
    });
}

// ==================== 初始化 ====================
function setupOptionChips(containerId, stateKey) {
    document.querySelectorAll(`#${containerId} .option-chip`).forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll(`#${containerId} .option-chip`).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state[stateKey] = chip.dataset.val;
        });
    });
}

function init() {
    initSupabase();
    document.getElementById('record-date').value = getTodayStr();
    document.getElementById('record-time').value = getNowTime();
    document.getElementById('tea-date').value = getTodayStr();
    document.getElementById('tea-time').value = getNowTime();

    // 页面导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`page-${item.dataset.page}`).classList.add('active');
            if (item.dataset.page === 'stats') renderStats();
            if (item.dataset.page === 'milktea') renderTeaList();
            if (item.dataset.page === 'settings') renderCustomCategories();
        });
    });

    // 类型切换
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentType = btn.dataset.type;
            state.selectedCategory = null;
            renderCategoryGrid();
        });
    });

    // 添加记录
    document.getElementById('btn-add').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('amount').value);
        const date = document.getElementById('record-date').value;
        const time = document.getElementById('record-time').value;
        const note = document.getElementById('note').value.trim();
        if (!amount || amount <= 0) { toast('请输入金额'); return; }
        if (!state.selectedCategory) { toast('请选择分类'); return; }
        const record = { id: generateId(), type: state.currentType, amount, category: state.selectedCategory, date, time, note, created_at: new Date().toISOString() };
        await saveRecord(record);
        toast('记录成功');
        document.getElementById('amount').value = '';
        document.getElementById('note').value = '';
        document.getElementById('record-time').value = getNowTime();
        state.selectedCategory = null;
        renderCategoryGrid(); renderRecordList(); renderMonthSummary();
    });

    // 月份切换
    document.getElementById('prev-month').addEventListener('click', () => { state.currentMonth.setMonth(state.currentMonth.getMonth()-1); renderStats(); });
    document.getElementById('next-month').addEventListener('click', () => { state.currentMonth.setMonth(state.currentMonth.getMonth()+1); renderStats(); });

    // 奶茶评分
    document.querySelectorAll('#tea-rating .star').forEach(star => {
        star.addEventListener('click', () => {
            state.teaRating = parseInt(star.dataset.val);
            document.querySelectorAll('#tea-rating .star').forEach((s, i) => { s.textContent = i < state.teaRating ? '★' : '☆'; s.classList.toggle('filled', i < state.teaRating); });
        });
    });

    // 冰度甜度选择
    setupOptionChips('ice-options', 'selectedIce');
    setupOptionChips('sugar-options', 'selectedSugar');

    // 添加奶茶
    document.getElementById('btn-add-tea').addEventListener('click', async () => {
        const date = document.getElementById('tea-date').value;
        const time = document.getElementById('tea-time').value;
        const brand = document.getElementById('tea-brand').value.trim();
        const name = document.getElementById('tea-name').value.trim();
        const price = parseFloat(document.getElementById('tea-price').value);
        if (!brand) { toast('请输入品牌'); return; }
        if (!name) { toast('请输入名称'); return; }
        if (!price || price <= 0) { toast('请输入价格'); return; }
        if (state.teaRating === 0) { toast('请评分'); return; }
        const tea = { id: generateId(), date, time, brand, name, price, rating: state.teaRating, ice: state.selectedIce, sugar: state.selectedSugar, created_at: new Date().toISOString() };
        await saveTea(tea);
        const record = { id: generateId(), type: 'expense', amount: price, category: '奶茶', date, time, note: `${brand} - ${name}`, created_at: new Date().toISOString() };
        await saveRecord(record);
        toast('记录成功');
        document.getElementById('tea-brand').value = '';
        document.getElementById('tea-name').value = '';
        document.getElementById('tea-price').value = '';
        document.getElementById('tea-time').value = getNowTime();
        state.teaRating = 0;
        document.querySelectorAll('#tea-rating .star').forEach(s => { s.textContent = '☆'; s.classList.remove('filled'); });
        renderTeaList(); renderRecordList(); renderMonthSummary();
    });

    // 编辑记录弹窗
    document.getElementById('btn-cancel-edit').addEventListener('click', closeEditRecord);
    document.getElementById('btn-save-edit').addEventListener('click', saveEditRecord);

    // 编辑奶茶弹窗
    document.getElementById('btn-cancel-edit-tea').addEventListener('click', closeEditTea);
    document.getElementById('btn-save-edit-tea').addEventListener('click', saveEditTea);
    document.querySelectorAll('#edit-tea-rating .star').forEach(star => {
        star.addEventListener('click', () => { state.editTeaRating = parseInt(star.dataset.val); renderEditTeaRating(); });
    });
    document.querySelectorAll('#edit-ice-options .option-chip').forEach(chip => {
        chip.addEventListener('click', () => { state.editIce = chip.dataset.val; renderEditOptions(); });
    });
    document.querySelectorAll('#edit-sugar-options .option-chip').forEach(chip => {
        chip.addEventListener('click', () => { state.editSugar = chip.dataset.val; renderEditOptions(); });
    });

    // 点击弹窗外关闭
    document.getElementById('modal-edit-record').addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) closeEditRecord(); });
    document.getElementById('modal-edit-tea').addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) closeEditTea(); });

    // Supabase 配置
    document.getElementById('btn-save-config').addEventListener('click', async () => {
        const url = document.getElementById('supabase-url').value.trim();
        const key = document.getElementById('supabase-key').value.trim();
        const statusEl = document.getElementById('connection-status');
        if (!url || !key) { toast('请填写完整'); return; }
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
        try {
            state.supabase = supabase.createClient(url, key);
            const { error } = await state.supabase.from('records').select('id').limit(1);
            if (error) throw error;
            statusEl.textContent = '连接成功！'; statusEl.className = 'connection-status success';
            await syncToCloud(); toast('连接成功，数据已同步');
        } catch (e) { statusEl.textContent = '连接失败: ' + e.message; statusEl.className = 'connection-status error'; }
    });

    // 自定义分类
    document.getElementById('btn-add-category').addEventListener('click', () => {
        const type = document.getElementById('custom-cat-type').value;
        const name = document.getElementById('custom-cat-name').value.trim();
        if (!name) { toast('请输入分类名称'); return; }
        const custom = JSON.parse(localStorage.getItem('custom_categories') || '{"expense":[],"income":[]}');
        if (custom[type].includes(name) || DEFAULT_CATEGORIES[type].includes(name)) { toast('分类已存在'); return; }
        custom[type].push(name);
        localStorage.setItem('custom_categories', JSON.stringify(custom));
        document.getElementById('custom-cat-name').value = '';
        renderCustomCategories(); renderCategoryGrid(); toast('添加成功');
    });

    // 导出
    document.getElementById('btn-export').addEventListener('click', () => {
        const data = { records: getLocalRecords(), teas: getLocalTeas(), categories: JSON.parse(localStorage.getItem('custom_categories') || '{}'), exported_at: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `记账数据_${getTodayStr()}.json`; a.click(); URL.revokeObjectURL(url); toast('导出成功');
    });

    // 清空
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('确定要清空所有数据吗？')) { if (confirm('真的确定吗？')) { localStorage.removeItem('records'); localStorage.removeItem('teas'); renderRecordList(); renderMonthSummary(); toast('已清空'); } }
    });

    // 加载配置
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_key');
    if (savedUrl) document.getElementById('supabase-url').value = savedUrl;
    if (savedKey) document.getElementById('supabase-key').value = savedKey;

    renderCategoryGrid(); renderRecordList(); renderMonthSummary();
}

async function syncToCloud() {
    if (!state.supabase) return;
    const records = getLocalRecords();
    const teas = getLocalTeas();
    if (records.length > 0) { try { await state.supabase.from('records').upsert(records, { onConflict: 'id' }); } catch (e) {} }
    if (teas.length > 0) { try { await state.supabase.from('milktea').upsert(teas, { onConflict: 'id' }); } catch (e) {} }
}

document.addEventListener('DOMContentLoaded', init);