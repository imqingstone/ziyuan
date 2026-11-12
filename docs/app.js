'use strict';
const $ = s => document.querySelector(s);
const E = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const {STAR_INFO, HUA_INFO, PALACE_INFO, TERMS} = window.ZiyuanTexts;
// 地支在 4×4 盤面上的位置 [列, 欄]
const GRID = {5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4], 4: [2, 1], 9: [2, 4], 3: [3, 1], 10: [3, 4], 2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4]};
const KIND_ORDER = {major: 0, lucky: 1, other: 2, tough: 3};
const KIND_NAME = {major: '主星', lucky: '吉星', other: '', tough: '煞星'};
let current = null, selected = null;

// ---------- 本機儲存（隱私：只存在這個瀏覽器） ----------
const store = {
  get(k, fallback){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
let saved = store.get('ziyuan.saved', []);
if (!Array.isArray(saved)) saved = [];

function toast(msg){ const t = $('#status'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------- 台灣歷史時區（夏令時間、日治時期）換算為 UTC+8 標準時間 ----------
function taiwanExtraMinutes(y, m, d, hh, mm){
  try {
    const f = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Taipei', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'});
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let extra = 0;
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(f.formatToParts(new Date(wall - (480 + extra) * 60000)).map(x => [x.type, x.value]));
      const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      extra = Math.round((shown - (wall - (480 + extra) * 60000)) / 60000) - 480;
    }
    return extra;
  } catch (e) { return 0; }
}

function readForm(){
  const date = $('#date').value, time = $('#time').value;
  const gender = (document.querySelector('input[name=gender]:checked') || {}).value;
  if (!date) throw Error('請選擇國曆生日');
  if (!time) throw Error('請填寫出生時間');
  if (!gender) throw Error('請選擇性別');
  const [y, m, d] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  return {name: $('#name').value.trim(), y, m, d, hour, minute, gender, taiwan: $('#taiwan').checked,
    lateZi: document.querySelector('input[name=lateZi]:checked').value,
    leapMode: document.querySelector('input[name=leapMode]:checked').value};
}
function fillForm(v){
  const p = n => String(n).padStart(2, '0');
  $('#name').value = v.name || '';
  $('#date').value = v.y + '-' + p(v.m) + '-' + p(v.d);
  $('#time').value = p(v.hour) + ':' + p(v.minute);
  for (const [n, val] of [['gender', v.gender], ['lateZi', v.lateZi || 'next'], ['leapMode', v.leapMode || 'split']]) {
    const el = document.querySelector('input[name=' + n + '][value=' + val + ']'); if (el) el.checked = true;
  }
  $('#taiwan').checked = v.taiwan !== false;
}

// 依設定換算標準時間後排盤
function compute(v){
  let {y, m, d, hour, minute} = v, note = '';
  if (v.taiwan) {
    const extra = taiwanExtraMinutes(y, m, d, hour, minute), jst = Date.UTC(y, m - 1, d) < Date.UTC(1945, 8, 21);
    if (extra) {
      const t = new Date(Date.UTC(y, m - 1, d, hour, minute) - extra * 60000);
      y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); hour = t.getUTCHours(); minute = t.getUTCMinutes();
      const p = n => String(n).padStart(2, '0');
      note = '這個日期台灣使用' + (jst ? '日治時期的時間（比現在快 1 小時）' : '夏令時間') + '，已換算為標準時間 ' + y + '/' + m + '/' + d + ' ' + p(hour) + ':' + p(minute) + ' 排盤。';
    }
  }
  const c = Ziyuan.chart({y, m, d, hour, minute, gender: v.gender, lateZi: v.lateZi, leapMode: v.leapMode});
  return {c, note, v};
}

// ---------- 畫面 ----------
function starHTML(s){
  return '<span class="s ' + s.kind + '">' + s.name + (s.hua ? '<span class="hua ' + s.hua + '">' + s.hua.slice(1) + '</span>' : '') + '</span>';
}
function sortStars(list){ return [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]); }

function render(){
  const {c, note, v} = current;
  $('#result').hidden = false;
  $('#result-title').textContent = v.name ? v.name + '的命盤' : '命盤';
  $('#adjust-note').hidden = !note && !c.shifted;
  $('#adjust-note').textContent = [note, c.shifted ? '23:00 以後出生，依設定算作隔天的子時。' : ''].filter(Boolean).join(' ');
  const cells = c.palaces.map(p => {
    const [r, col] = GRID[p.index];
    const stars = sortStars(p.stars);
    const label = p.name + '，' + p.stem + p.branch + '宮' + (p.isShen ? '，身宮' : '') + '。' + (stars.length ? stars.map(s => s.name + (s.hua || '')).join('、') : '沒有主星') + '。大限 ' + p.decade[0] + ' 到 ' + p.decade[1] + ' 歲';
    return '<button type="button" class="cell' + (p.index === c.ming ? ' ming' : '') + '" style="grid-row:' + r + ';grid-column:' + col + '" data-i="' + p.index + '" aria-pressed="' + (p.index === selected) + '" aria-label="' + E(label) + '">' +
      '<span class="stars">' + stars.map(starHTML).join('') + '</span>' +
      '<span class="foot"><span><span class="pname">' + p.name + '</span>' + (p.isShen ? '<span class="shen">身</span>' : '') + '</span><span class="gz">' + p.stem + p.branch + '</span></span>' +
      '<span class="age">' + p.decade[0] + '–' + p.decade[1] + '</span></button>';
  }).join('');
  const center = '<div class="center"><strong>' + E(v.name || '命盤') + '</strong>' +
    '<p>國曆 ' + v.y + '/' + v.m + '/' + v.d + ' ' + String(v.hour).padStart(2, '0') + ':' + String(v.minute).padStart(2, '0') + '</p>' +
    '<p>農曆 ' + c.yearGanzhi + '年' + c.lunar.text + ' ' + c.hourBranch + '</p>' +
    '<p>' + c.yinyang + '・' + c.juName + '</p>' +
    '<p>命主 ' + c.mingZhu + '・身主 ' + c.shenZhu + '</p>' +
    '<p>' + c.sihua.join(' ') + '</p></div>';
  $('#board').innerHTML = cells + center;
  showDetail(selected == null ? c.ming : selected, false);
}

function showDetail(i, focus){
  selected = i;
  const {c} = current, p = c.palaces[i];
  document.querySelectorAll('.cell').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  const stars = sortStars(p.stars);
  const borrow = !stars.some(s => s.kind === 'major');
  const opposite = c.palaces[(i + 6) % 12];
  const items = stars.map(s => {
    const [title, text] = STAR_INFO[s.name];
    return '<li><b class="' + s.kind + '">' + s.name + '</b><small>' + [KIND_NAME[s.kind], title].filter(Boolean).join('・') + '</small>' +
      (s.hua ? '<span class="hua ' + s.hua + '">' + s.hua + '</span>' : '') + '<p>' + text + '</p>' +
      (s.hua ? '<p class="muted">' + s.hua + '：' + HUA_INFO[s.hua] + '</p>' : '') + '</li>';
  }).join('');
  $('#detail').innerHTML = '<h3>' + p.name + '・' + p.stem + p.branch + (p.isShen ? '（身宮）' : '') + '</h3>' +
    '<p class="pinfo">' + PALACE_INFO[p.name] + '大限：' + p.decade[0] + '–' + p.decade[1] + ' 歲。</p>' +
    (borrow ? '<p class="empty">這一宮沒有主星，傳統上會參考對面的' + opposite.name + '（' + (opposite.stars.filter(s => s.kind === 'major').map(s => s.name).join('、') || '同樣沒有主星') + '）一起看。</p>' : '') +
    (items ? '<ul>' + items + '</ul>' : '');
  if (focus) $('#detail').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest'});
}

function renderSaved(){
  $('#saved-box').hidden = !saved.length;
  $('#saved').innerHTML = saved.map((v, k) => '<li><span>' + E(v.name || '未命名') + '　' + v.y + '/' + v.m + '/' + v.d + '</span><button type="button" data-open="' + k + '">開啟</button><button type="button" data-del="' + k + '" aria-label="刪除' + E(v.name || '未命名') + '的命盤">刪除</button></li>').join('');
}

$('#terms').innerHTML = Object.entries(TERMS).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  $('#form-error').textContent = '';
  try {
    const v = readForm();
    current = compute(v); selected = null;
    store.set('ziyuan.last', v);
    render(); useCount();
    $('#result-title').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    $('#result-title').setAttribute('tabindex', '-1'); $('#result-title').focus({preventScroll: true});
  } catch (err) { $('#form-error').textContent = err.message; }
});
$('#board').addEventListener('click', e => { const b = e.target.closest('.cell'); if (b) showDetail(+b.dataset.i, true); });
$('#save').addEventListener('click', () => {
  if (!current) return;
  const v = {...current.v};
  if (!v.name) { const n = prompt('幫這張命盤取個名字（選填）', ''); if (n === null) return; v.name = n.trim().slice(0, 20); current.v.name = v.name; render(); }
  saved = [v, ...saved.filter(s => !(s.name === v.name && s.y === v.y && s.m === v.m && s.d === v.d && s.hour === v.hour && s.minute === v.minute && s.gender === v.gender))].slice(0, 30);
  toast(store.set('ziyuan.saved', saved) ? '已儲存' : '這個瀏覽器無法儲存');
  renderSaved();
});
$('#saved').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { const v = saved[+o.dataset.open]; fillForm(v); current = compute(v); selected = null; render(); useCount(); $('#result-title').scrollIntoView({block: 'start'}); }
  if (d) { const v = saved[+d.dataset.del]; if (confirm('確定要刪除「' + (v.name || '未命名') + '」的命盤嗎？')) { saved.splice(+d.dataset.del, 1); store.set('ziyuan.saved', saved); renderSaved(); toast('已刪除'); } }
});

const last = store.get('ziyuan.last', null);
if (last && last.y) fillForm(last);
renderSaved();

// 使用次數：每次排盤記一筆到 GoatCounter，並在頁尾顯示累計次數（只記次數，不送出任何生日資料）。
const usagePath = 'ziyuan-chart';
function useCount(){ try { const gc = window.goatcounter; if (gc && gc.count) gc.count({path: usagePath, title: '紫垣排盤', event: true, no_session: true}); } catch (e) {} }
fetch('https://imqingstone.goatcounter.com/counter/' + usagePath + '.json').then(r => r.ok ? r.json() : null)
  .then(d => { const el = document.getElementById('usage'); if (el && d && d.count) { el.textContent = '已排過 ' + d.count + ' 張命盤'; el.hidden = false; } }).catch(() => {});
