// ==================== 配置与状态 ====================
const DEFAULT_CATEGORIES = {
    expense: ['餐饮', '奶茶', '交通', '购物', '娱乐', '学习', '日用', '其他'],
    income: ['生活费', '兼职', '红包', '其他']
};
let state = {
    currentType: 'expense', selectedCategory: null, editCategory: null,
    currentMonth: new Date(), teaRating: 0, editTeaRating: 0,
    editingRecordId: null, editingTeaId: null,
    selectedIce: '正常冰', selectedSugar: '正常糖',
    editIce: '正常冰', editSugar: '正常糖', supabase: null
};

// ==================== Supabase ====================
function initSupabase() {
    const url = localStorage.getItem('supabase_url');
    const key = localStorage.getItem('supabase_key');
    if (url && key) { try { state.supabase = supabase.createClient(url, key); return true; } catch(e) { return false; } }
    return false;
}

// ==================== 数据层 ====================
async function saveRecord(r) { const rs = getLocalRecords(); rs.unshift(r); localStorage.setItem('records', JSON.stringify(rs)); if(state.supabase) try { await state.supabase.from('records').insert(r); } catch(e){} }
async function updateRecord(id, u) { let rs = getLocalRecords(); rs = rs.map(r => r.id===id ? {...r,...u} : r); localStorage.setItem('records', JSON.stringify(rs)); if(state.supabase) try { await state.supabase.from('records').update(u).eq('id',id); } catch(e){} }
async function deleteRecord(id) { let rs = getLocalRecords(); rs = rs.filter(r => r.id!==id); localStorage.setItem('records', JSON.stringify(rs)); if(state.supabase) try { await state.supabase.from('records').delete().eq('id',id); } catch(e){} }
async function saveTea(t) { const ts = getLocalTeas(); ts.unshift(t); localStorage.setItem('teas', JSON.stringify(ts)); if(state.supabase) try { await state.supabase.from('milktea').insert(teaForCloud(t)); } catch(e){} }
async function updateTea(id, u) { let ts = getLocalTeas(); ts = ts.map(t => t.id===id ? {...t,...u} : t); localStorage.setItem('teas', JSON.stringify(ts)); if(state.supabase) try { await state.supabase.from('milktea').update(teaForCloud(u)).eq('id',id); } catch(e){} }
async function deleteTea(id) { let ts = getLocalTeas(); const t = ts.find(x => x.id===id); ts = ts.filter(t => t.id!==id); localStorage.setItem('teas', JSON.stringify(ts)); if(state.supabase) try { await state.supabase.from('milktea').delete().eq('id',id); } catch(e){} if(t && t.recordId) await deleteRecord(t.recordId); }
function getLocalRecords() { return JSON.parse(localStorage.getItem('records') || '[]'); }
function getLocalTeas() { return JSON.parse(localStorage.getItem('teas') || '[]'); }
function teaForCloud(t) { const { recordId, ...rest } = t; return rest; }
function getCategories() { const c = JSON.parse(localStorage.getItem('custom_categories') || '{"expense":[],"income":[]}'); return { expense: [...DEFAULT_CATEGORIES.expense,...c.expense], income: [...DEFAULT_CATEGORIES.income,...c.income] }; }
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
function getThemeNames() { return JSON.parse(localStorage.getItem('theme_names') || '{}'); }
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
    closeEditRecord(); renderRecordList(); renderMonthSummary(); toast('已更新');
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
    await updateTea(state.editingTeaId, {date,time,brand,name,price,rating:state.editTeaRating,ice:state.editIce,sugar:state.editSugar});
    if(tea && tea.recordId) await updateRecord(tea.recordId, {amount:price, date, time, note:`${brand} - ${name}`, category:'奶茶'});
    closeEditTea(); renderTeaList(); renderRecordList(); renderMonthSummary(); toast('已更新');
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
    const custom=JSON.parse(localStorage.getItem('custom_categories')||'{"expense":[],"income":[]}');
    const container=document.getElementById('custom-categories-list');
    const all=[...custom.expense.map(c=>({name:c,type:'expense'})),...custom.income.map(c=>({name:c,type:'income'}))];
    if(all.length===0){container.innerHTML='<div class="empty-state">暂无自定义分类</div>';return;}
    container.innerHTML=all.map(c=>`<div class="custom-cat-item"><span>${c.type==='expense'?'支出':'收入'} · ${esc(c.name)}</span><span class="record-delete" data-name="${esc(c.name)}" data-type="${c.type}">✕</span></div>`).join('');
    container.querySelectorAll('.record-delete').forEach(btn=>{btn.addEventListener('click',()=>{const custom=JSON.parse(localStorage.getItem('custom_categories')||'{"expense":[],"income":[]}');custom[btn.dataset.type]=custom[btn.dataset.type].filter(c=>c!==btn.dataset.name);localStorage.setItem('custom_categories',JSON.stringify(custom));renderCustomCategories();renderFilterOptions();toast('已删除');});});
}

// ==================== 云端同步 ====================
async function syncToCloud() {
    if(!state.supabase)return;
    const records=getLocalRecords(),teas=getLocalTeas();
    const notes=JSON.parse(localStorage.getItem('love_notes')||'[]');
    if(records.length>0) try{await state.supabase.from('records').upsert(records,{onConflict:'id'});}catch(e){}
    if(teas.length>0) try{await state.supabase.from('milktea').upsert(teas.map(teaForCloud),{onConflict:'id'});}catch(e){}
    if(notes.length>0) try{await state.supabase.from('love_notes').upsert(notes,{onConflict:'id'});}catch(e){}
}
async function syncFromCloud() {
    if(!state.supabase){toast('未连接');return;}
    try {
        const {data:records}=await state.supabase.from('records').select('*');
        const {data:teas}=await state.supabase.from('milktea').select('*');
        const {data:notes}=await state.supabase.from('love_notes').select('*');
        if(records) localStorage.setItem('records',JSON.stringify(records));
        if(teas) localStorage.setItem('teas',JSON.stringify(teas));
        if(notes) localStorage.setItem('love_notes',JSON.stringify(notes));
        renderRecordList();renderMonthSummary();renderFilterOptions();renderNotes();toast('已从云端拉取');
    } catch(e){toast('拉取失败: '+e.message);}
}

// ==================== 初始化 ====================
function setupChips(id,key){document.querySelectorAll(`#${id} .option-chip`).forEach(c=>{c.addEventListener('click',()=>{document.querySelectorAll(`#${id} .option-chip`).forEach(x=>x.classList.remove('active'));c.classList.add('active');state[key]=c.dataset.val;});});}

function init() {
    initSupabase();
    applyTheme(getActiveThemeId());
    document.getElementById('record-date').value=getTodayStr();
    document.getElementById('record-time').value=getNowTime();
    document.getElementById('tea-date').value=getTodayStr();
    document.getElementById('tea-time').value=getNowTime();
    const savedBudget=localStorage.getItem('monthly_budget');
    if(savedBudget) document.getElementById('budget-input').value=savedBudget;

    // 导航
    document.querySelectorAll('.nav-item').forEach(item=>{item.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));item.classList.add('active');document.getElementById(`page-${item.dataset.page}`).classList.add('active');if(item.dataset.page==='stats')renderStats();if(item.dataset.page==='milktea')renderTeaList();if(item.dataset.page==='settings'){renderCustomCategories();renderThemeSettings();}if(item.dataset.page==='notes')renderNotes();if(item.dataset.page==='todo')renderTodoList();});});
    // 设置按钮
    document.getElementById('btn-go-settings').addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-settings').classList.add('active');renderCustomCategories();renderThemeSettings();});

    // 类型切换
    document.querySelectorAll('.toggle-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.currentType=btn.dataset.type;state.selectedCategory=null;renderCategoryGrid('category-grid',null,null,onHomeCatClick);});});

    // 添加记录
    document.getElementById('btn-add').addEventListener('click',async()=>{
        const amount=parseFloat(document.getElementById('amount').value),date=document.getElementById('record-date').value,time=document.getElementById('record-time').value,note=document.getElementById('note').value.trim();
        if(!amount||amount<=0){toast('请输入金额');return;}if(!state.selectedCategory){toast('请选择分类');return;}
        await saveRecord({id:generateId(),type:state.currentType,amount,category:state.selectedCategory,date,time,note,created_at:new Date().toISOString()});
        toast('记录成功');document.getElementById('amount').value='';document.getElementById('note').value='';document.getElementById('record-time').value=getNowTime();state.selectedCategory=null;
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
        const teaRecordId=generateId();
        await saveRecord({id:teaRecordId,type:'expense',amount:price,category:'奶茶',date,time,note:`${brand} - ${name}`,created_at:new Date().toISOString()});
        await saveTea({id:generateId(),date,time,brand,name,price,rating:state.teaRating,ice:state.selectedIce,sugar:state.selectedSugar,recordId:teaRecordId,created_at:new Date().toISOString()});
        toast('记录成功');document.getElementById('tea-brand').value='';document.getElementById('tea-name').value='';document.getElementById('tea-price').value='';document.getElementById('tea-time').value=getNowTime();
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
        const url=document.getElementById('supabase-url').value.trim(),key=document.getElementById('supabase-key').value.trim(),st=document.getElementById('connection-status');
        if(!url||!key){toast('请填写完整');return;}localStorage.setItem('supabase_url',url);localStorage.setItem('supabase_key',key);
        try{state.supabase=supabase.createClient(url,key);const{error}=await state.supabase.from('records').select('id').limit(1);if(error)throw error;st.textContent='连接成功！';st.className='connection-status success';await syncToCloud();toast('连接成功');}catch(e){st.textContent='连接失败: '+e.message;st.className='connection-status error';}
    });
    document.getElementById('btn-sync-from-cloud').addEventListener('click',syncFromCloud);

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
        if(!name){toast('请输入名称');return;}const custom=JSON.parse(localStorage.getItem('custom_categories')||'{"expense":[],"income":[]}');
        if(custom[type].includes(name)||DEFAULT_CATEGORIES[type].includes(name)){toast('已存在');return;}
        custom[type].push(name);localStorage.setItem('custom_categories',JSON.stringify(custom));document.getElementById('custom-cat-name').value='';renderCustomCategories();renderFilterOptions();toast('添加成功');
    });

    // 导出/清空
    document.getElementById('btn-export').addEventListener('click',()=>{const d={records:getLocalRecords(),teas:getLocalTeas(),categories:JSON.parse(localStorage.getItem('custom_categories')||'{}'),exported_at:new Date().toISOString()};const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`记账数据_${getTodayStr()}.json`;a.click();URL.revokeObjectURL(u);toast('导出成功');});
    document.getElementById('btn-clear').addEventListener('click',()=>{if(confirm('确定清空所有数据？')){if(confirm('真的确定？')){localStorage.removeItem('records');localStorage.removeItem('teas');renderRecordList();renderMonthSummary();toast('已清空');}}});

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
        const notes = JSON.parse(localStorage.getItem('love_notes') || '[]');
        notes.unshift(note);
        localStorage.setItem('love_notes', JSON.stringify(notes));
        if (state.supabase) { try { await state.supabase.from('love_notes').insert(note); } catch(e) {} }
        input.value = '';
        renderNotes();
        toast('留言成功 💌');
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
    const all = JSON.parse(localStorage.getItem('love_notes') || '[]');
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
        btn.addEventListener('click', () => {
            let notes = JSON.parse(localStorage.getItem('love_notes') || '[]');
            notes = notes.filter(n => n.id !== btn.dataset.nid);
            localStorage.setItem('love_notes', JSON.stringify(notes));
            renderNotes();
        });
    });
}

// ==================== 待办清单 ====================
function getTodos() { return JSON.parse(localStorage.getItem('todos') || '[]'); }
function saveTodos(todos) { localStorage.setItem('todos', JSON.stringify(todos)); }

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
