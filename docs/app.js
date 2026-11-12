'use strict';
const $ = s => document.querySelector(s);
const E = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const READINGS = window.ZiyuanReadings || {};
const {LIU_INFO, LIU_STAR_INFO, STAR_INFO, HUA_INFO, ZIHUA_INFO, BRIGHT_INFO, PALACE_INFO, TERMS} = window.ZiyuanTexts;
// 地支在 4×4 盤面上的位置 [列, 欄]
const GRID = {5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4], 4: [2, 1], 9: [2, 4], 3: [3, 1], 10: [3, 4], 2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4]};
const KIND_ORDER = {major: 0, lucky: 1, other: 2, tough: 3};
const KIND_NAME = {major: '主星', lucky: '吉星', other: '', tough: '煞星'};
let current = null, selected = null, liuYear = null;
const SHORT = {命宮:'命',兄弟:'兄',夫妻:'夫',子女:'子',財帛:'財',疾厄:'疾',遷移:'遷',交友:'友',官祿:'官',田宅:'田',福德:'福',父母:'父'};

// 出生地經度（縣市政府所在地附近）
const PLACES = [['基隆',121.74],['臺北',121.56],['新北',121.46],['桃園',121.30],['新竹',120.97],['苗栗',120.82],['臺中',120.68],['彰化',120.54],['南投',120.68],['雲林',120.54],['嘉義',120.45],['臺南',120.21],['高雄',120.31],['屏東',120.49],['宜蘭',121.75],['花蓮',121.60],['臺東',121.14],['澎湖',119.57],['金門',118.32],['馬祖',119.94]];

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
  let solar = null;
  if ($('#solar').checked) {
    const place = $('#place').value;
    const lon = place === 'custom' ? parseFloat($('#lon').value) : PLACES.find(p => p[0] === place)[1];
    if (!(lon >= -180 && lon <= 180)) throw Error('請填寫出生地的東經度數');
    solar = {place, lon};
  }
  return {name: $('#name').value.trim(), y, m, d, hour, minute, gender, taiwan: $('#taiwan').checked, solar,
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
  $('#solar').checked = !!v.solar;
  if (v.solar) { $('#place').value = v.solar.place; if (v.solar.place === 'custom') $('#lon').value = v.solar.lon; document.querySelector('.adv').open = true; }
  syncSolar();
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
  if (v.solar) {
    const p = n => String(n).padStart(2, '0'), sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);
    const t = Ziyuan.trueSolar({y, m, d, hour, minute}, v.solar.lon);
    const before = Ziyuan.hourBranch(hour), after = Ziyuan.hourBranch(t.hour);
    note += (note ? ' ' : '') + '真太陽時：出生地' + (v.solar.place === 'custom' ? '' : v.solar.place) + '東經 ' + v.solar.lon + ' 度，經度差 ' + sgn(t.lonMin) + ' 分、均時差 ' + sgn(t.eot) + ' 分，以 ' +
      t.y + '/' + t.m + '/' + t.d + ' ' + p(t.hour) + ':' + p(t.minute) + ' 排盤' +
      (before !== after ? '，時辰從' + Ziyuan.BRANCHES[before] + '時變成' + Ziyuan.BRANCHES[after] + '時' : '') + '。';
    ({y, m, d, hour, minute} = t);
  }
  const c = Ziyuan.chart({y, m, d, hour, minute, gender: v.gender, lateZi: v.lateZi, leapMode: v.leapMode});
  return {c, note, v};
}

// ---------- 畫面 ----------
const thisYear = new Date().getFullYear();
function getYearly(){
  if (!$('#show-year').checked || !current) return null;
  const min = current.c.lunar.year;
  if (liuYear == null || liuYear < min) liuYear = Math.max(thisYear, min);
  return Ziyuan.yearly(current.c, liuYear);
}
function liuHua(name, Y){ const h = Y && Y.sihua.find(x => x.name === name); return h ? h.hua : ''; }
function starHTML(s, Y){
  const lh = liuHua(s.name, Y);
  return '<span class="s ' + s.kind + '"><span class="nm">' + s.name + (s.bright ? '<span class="lv lv-' + s.bright + '">' + s.bright + '</span>' : '') + '</span>' + (s.hua ? '<span class="hua ' + s.hua + '">' + s.hua.slice(1) + '</span>' : '') + (s.zihua ? '<span class="hua zi ' + s.zihua + '">自' + s.zihua.slice(1) + '</span>' : '') + (lh ? '<span class="hua liu ' + lh + '">年' + lh.slice(1) + '</span>' : '') + '</span>';
}
function sortStars(list){ return [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]); }

function render(){
  const {c, note, v} = current;
  $('#result').hidden = false;
  $('#result-title').textContent = v.name ? v.name + '的命盤' : '命盤';
  $('#adjust-note').hidden = !note && !c.shifted;
  $('#adjust-note').textContent = [note, c.shifted ? '23:00 以後出生，依設定算作隔天的子時。' : ''].filter(Boolean).join(' ');
  const Y = getYearly();
  $('#year-pick').hidden = !Y;
  if (Y) { $('#year').value = Y.year; $('#year').min = c.lunar.year; $('#year-info').textContent = Y.ganzhi + '年・虛歲 ' + Y.age; }
  const cells = c.palaces.map(p => {
    const [r, col] = GRID[p.index];
    const stars = sortStars(p.stars);
    let label = p.name + '，' + p.stem + p.branch + '宮' + (p.isShen ? '，身宮' : '') + '。' + (stars.length ? stars.map(s => s.name + (s.bright ? s.bright : '') + (s.hua || '') + (s.zihua ? '、自' + s.zihua : '') + (liuHua(s.name, Y) ? '、流年' + liuHua(s.name, Y) : '')).join('、') : '沒有主星') + '。大限 ' + p.decade[0] + ' 到 ' + p.decade[1] + ' 歲' +
      (Y ? '。流年' + Y.names[p.index] + (Y.daxian === p.index ? '，目前大限' : '') + (Y.xiaoxian === p.index ? '，小限' : '') : '');
    const ls = Y ? Y.stars[p.index] : [];
    if (ls.length) label += '。流曜 ' + ls.map(x => x.name).join('、');
    const tags = Y ? (ls.length ? '<span class="lstars">' + ls.map(x => '<span class="ls ' + x.kind + '">' + x.name + '</span>').join('') + '</span>' : '') + '<span class="ytags"><span class="yt yt-liu' + (Y.ming === p.index ? ' on' : '') + '">年' + SHORT[Y.names[p.index]] + '</span>' +
      (Y.daxian === p.index ? '<span class="yt yt-da">大限</span>' : '') + (Y.xiaoxian === p.index ? '<span class="yt yt-xiao">小限</span>' : '') + '</span>' : '';
    return '<button type="button" class="cell' + (p.index === c.ming ? ' ming' : '') + '" style="grid-row:' + r + ';grid-column:' + col + '" data-i="' + p.index + '" aria-pressed="' + (p.index === selected) + '" aria-label="' + E(label) + '">' +
      '<span class="stars">' + stars.map(s => starHTML(s, Y)).join('') + '</span>' + tags +
      '<span class="foot"><span><span class="pname">' + p.name + '</span>' + (p.isShen ? '<span class="shen">身</span>' : '') + '</span><span class="gz">' + p.stem + p.branch + '</span></span>' +
      '<span class="age">' + p.decade[0] + '–' + p.decade[1] + '</span></button>';
  }).join('');
  const center = '<div class="center"><strong>' + E(v.name || '命盤') + '</strong>' +
    '<p>國曆 ' + v.y + '/' + v.m + '/' + v.d + ' ' + String(v.hour).padStart(2, '0') + ':' + String(v.minute).padStart(2, '0') + '</p>' +
    '<p>農曆 ' + c.yearGanzhi + '年' + c.lunar.text + ' ' + c.hourBranch + '</p>' +
    '<p>' + c.yinyang + '・' + c.juName + '</p>' +
    '<p>命主 ' + c.mingZhu + '・身主 ' + c.shenZhu + '</p>' +
    '<p>' + c.sihua.join(' ') + '</p>' +
    (Y ? '<p class="cy">' + Y.year + ' ' + Y.ganzhi + '年・虛歲 ' + Y.age + '<br>流年 ' + Y.sihua.map(x => x.name + x.hua).join(' ') + '</p>' : '') + '</div>';
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
  const Y = getYearly();
  const items = stars.map(s => {
    const lh = liuHua(s.name, Y);
    const [title, text] = STAR_INFO[s.name];
    return '<li><b class="' + s.kind + '">' + s.name + '</b><small>' + [KIND_NAME[s.kind], title, s.bright ? '亮度' + s.bright : ''].filter(Boolean).join('・') + '</small>' +
      (s.hua ? '<span class="hua ' + s.hua + '">' + s.hua + '</span>' : '') + (s.zihua ? '<span class="hua zi ' + s.zihua + '">自' + s.zihua + '</span>' : '') + (lh ? '<span class="hua liu ' + lh + '">流年' + lh + '</span>' : '') + '<p>' + text + '</p>' +
      (READINGS[p.name] && READINGS[p.name][s.name] ? '<p class="inpal"><b>' + s.name + '在' + p.name.replace(/宮$/, '') + '宮</b>' + READINGS[p.name][s.name] + '</p>' : '') +
      (s.bright ? '<p class="muted">亮度「' + s.bright + '」：' + BRIGHT_INFO[s.bright] + '</p>' : '') +
      (s.hua ? '<p class="muted">' + s.hua + '：' + HUA_INFO[s.hua] + '</p>' : '') +
      (s.zihua ? '<p class="muted">自' + s.zihua + '：本宮宮干「' + p.stem + '」讓' + s.name + s.zihua + '。' + ZIHUA_INFO[s.zihua] + '</p>' : '') +
      (lh ? '<p class="muted">流年' + lh + '：' + Y.year + ' 年的年干「' + Y.stem + '」讓' + s.name + lh + '，這一年' + HUA_INFO[lh] + '</p>' : '') + '</li>';
  }).join('');
  $('#detail').innerHTML = '<h3>' + p.name + '・' + p.stem + p.branch + (p.isShen ? '（身宮）' : '') + '</h3>' +
    '<p class="pinfo">' + PALACE_INFO[p.name] + '大限：' + p.decade[0] + '–' + p.decade[1] + ' 歲。</p>' +
    (Y ? '<p class="yline">' + Y.year + ' ' + Y.ganzhi + '年（虛歲 ' + Y.age + '），這一宮是流年的' + Y.names[i] + '。' +
      (Y.daxian === i ? '目前正走這一宮的大限。' : '') + (Y.xiaoxian === i ? '今年的小限也在這一宮。' : '') + LIU_INFO[Y.names[i]] + '</p>' +
      (Y.stars[i].length ? '<ul class="liulist">' + Y.stars[i].map(x => '<li><b class="' + x.kind + '">' + x.name + '</b><small>流曜</small><p>' + LIU_STAR_INFO[x.name] + '</p></li>').join('') + '</ul>' : '') : '') +
    (borrow ? '<p class="empty">這一宮沒有主星，傳統上會參考對面的' + opposite.name + '（' + (opposite.stars.filter(s => s.kind === 'major').map(s => s.name).join('、') || '同樣沒有主星') + '）一起看。</p>' : '') +
    (items ? '<ul>' + items + '</ul>' : '');
  if (focus) $('#detail').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest'});
}

function renderSaved(){
  $('#saved-box').hidden = !saved.length;
  $('#saved').innerHTML = saved.map((v, k) => '<li><span>' + E(v.name || '未命名') + '　' + v.y + '/' + v.m + '/' + v.d + '</span><button type="button" data-open="' + k + '">開啟</button><button type="button" data-del="' + k + '" aria-label="刪除' + E(v.name || '未命名') + '的命盤">刪除</button></li>').join('');
}

$('#place').innerHTML = PLACES.map(([n, lon]) => '<option value="' + n + '">' + n + '（東經 ' + lon.toFixed(2) + '）</option>').join('') + '<option value="custom">其他地點，自己填經度</option>';
$('#place').value = '臺北';
function syncSolar(){ $('#solar-opts').hidden = !$('#solar').checked; $('#lon-box').hidden = $('#place').value !== 'custom'; }
$('#solar').addEventListener('change', syncSolar);
$('#place').addEventListener('change', syncSolar);
$('#terms').innerHTML = Object.entries(TERMS).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  $('#form-error').textContent = '';
  try {
    const v = readForm();
    current = compute(v); selected = null; liuYear = null;
    store.set('ziyuan.last', v);
    render(); useCount();
    $('#result-title').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    $('#result-title').setAttribute('tabindex', '-1'); $('#result-title').focus({preventScroll: true});
  } catch (err) { $('#form-error').textContent = err.message; }
});
function setYear(y){ if (!current) return; const min = current.c.lunar.year; liuYear = Math.min(Math.max(y, min), min + 119); render(); }
$('#show-year').checked = store.get('ziyuan.showYear', false) === true;
$('#show-year').addEventListener('change', () => { store.set('ziyuan.showYear', $('#show-year').checked); if (current) render(); });
$('#year-prev').addEventListener('click', () => setYear(liuYear - 1));
$('#year-next').addEventListener('click', () => setYear(liuYear + 1));
$('#year').addEventListener('change', () => { const y = parseInt($('#year').value, 10); if (y) setYear(y); else render(); });
$('#board').addEventListener('click', e => { const b = e.target.closest('.cell'); if (b) showDetail(+b.dataset.i, true); });
$('#save').addEventListener('click', () => {
  if (!current) return;
  const v = {...current.v};
  if (!v.name) { const n = prompt('幫這張命盤取個名字（選填）', ''); if (n === null) return; v.name = n.trim().slice(0, 20); current.v.name = v.name; render(); }
  saved = [v, ...saved.filter(s => !(s.name === v.name && s.y === v.y && s.m === v.m && s.d === v.d && s.hour === v.hour && s.minute === v.minute && s.gender === v.gender && JSON.stringify(s.solar || null) === JSON.stringify(v.solar || null)))].slice(0, 30);
  toast(store.set('ziyuan.saved', saved) ? '已儲存' : '這個瀏覽器無法儲存');
  renderSaved();
});
$('#saved').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { const v = saved[+o.dataset.open]; fillForm(v); current = compute(v); selected = null; liuYear = null; render(); useCount(); $('#result-title').scrollIntoView({block: 'start'}); }
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
