// 紫垣排盤引擎：國曆轉農曆，並依常見通行排法（以《紫微斗數全書》為主）安星。
// 不依賴瀏覽器，可在 Node 中測試（tests/verify.js）。
(function(g){
'use strict';
const LUNAR = typeof module !== 'undefined' ? require('./calendar.js') : g.ZIYUAN_LUNAR;
const STEMS = '甲乙丙丁戊己庚辛壬癸'.split('');
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥'.split('');
const PALACES = ['命宮','兄弟','夫妻','子女','財帛','疾厄','遷移','交友','官祿','田宅','福德','父母'];
const MONTHS = ['正','二','三','四','五','六','七','八','九','十','十一','十二'];
const DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
// 納音五行（六十甲子每兩個一組）與五行局數
const NAYIN = '金火木土金火水土金木水土火木水金火木土金火水土金木水土火木水';
const JU = {水: 2, 木: 3, 金: 4, 土: 5, 火: 6};
const JU_NAMES = {2: '水二局', 3: '木三局', 4: '金四局', 5: '土五局', 6: '火六局'};
const mod = (n, m) => ((n % m) + m) % m;
const DAY = 86400000;

// ---------- 曆法 ----------
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);
const FIRST_DAY = LUNAR[0][1];
function lastDay(){
  const [, start, mask, leap] = LUNAR[LUNAR.length - 1];
  let n = start;
  for (let i = 0; i < 12 + (leap ? 1 : 0); i++) n += (mask >> i & 1) ? 30 : 29;
  return n - 1;
}
const LAST_DAY = lastDay();
function inRange(y, m, d){ const n = dayNumber(y, m, d); return n >= FIRST_DAY && n <= LAST_DAY; }
function toSolar(n){ const t = new Date(n * DAY); return {y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate()}; }

// 國曆 → 農曆：{year, month, day, leap}
function solarToLunar(y, m, d){
  const n = dayNumber(y, m, d);
  if (n < FIRST_DAY || n > LAST_DAY) throw RangeError('日期需介於 1900 年 1 月 31 日至 2100 年底');
  let k = LUNAR.length - 1;
  while (LUNAR[k][1] > n) k--;
  const [year, start, mask, leap] = LUNAR[k];
  let off = n - start;
  for (let i = 0; i < 12 + (leap ? 1 : 0); i++) {
    const len = (mask >> i & 1) ? 30 : 29;
    if (off < len) {
      const isLeap = leap > 0 && i === leap;
      const month = leap > 0 && i > leap ? i : i + 1;
      return {year, month: isLeap ? leap : month, day: off + 1, leap: isLeap};
    }
    off -= len;
  }
  throw Error('calendar table is inconsistent');
}

// 農曆 → 國曆（測試與日後功能使用）
function lunarToSolar(year, month, day, isLeap){
  const row = LUNAR.find(r => r[0] === year);
  if (!row) throw RangeError('year out of range');
  const [, start, mask, leap] = row;
  if (isLeap && leap !== month) throw RangeError('這一年沒有閏' + MONTHS[month - 1] + '月');
  const idx = isLeap ? month : (leap && month > leap ? month : month - 1);
  let n = start;
  for (let i = 0; i < idx; i++) n += (mask >> i & 1) ? 30 : 29;
  const len = (mask >> idx & 1) ? 30 : 29;
  if (day < 1 || day > len) throw RangeError('這個月只有 ' + len + ' 天');
  return toSolar(n + day - 1);
}

const ganzhiIndex = (s, b) => mod(6 * s - 5 * b, 60);
const hourBranch = hour => Math.floor((hour + 1) / 2) % 12;

// ---------- 安星 ----------
// 四化：依年干，順序為 化祿、化權、化科、化忌
const SIHUA = {
  甲: ['廉貞','破軍','武曲','太陽'], 乙: ['天機','天梁','紫微','太陰'],
  丙: ['天同','天機','文昌','廉貞'], 丁: ['太陰','天同','天機','巨門'],
  戊: ['貪狼','太陰','右弼','天機'], 己: ['武曲','貪狼','天梁','文曲'],
  庚: ['太陽','武曲','太陰','天同'], 辛: ['巨門','太陽','文曲','文昌'],
  壬: ['天梁','紫微','左輔','武曲'], 癸: ['破軍','巨門','太陰','貪狼'],
};
const SIHUA_NAMES = ['化祿','化權','化科','化忌'];
const KUI_YUE = {甲:[1,7],戊:[1,7],庚:[1,7],乙:[0,8],己:[0,8],丙:[11,9],丁:[11,9],辛:[6,2],壬:[3,5],癸:[3,5]};
const LUCUN = {甲:2,乙:3,丙:5,丁:6,戊:5,己:6,庚:8,辛:9,壬:11,癸:0};
// 火星、鈴星起點（依年支三合）
function huoLingStart(b){
  if ([2,6,10].includes(b)) return [1,3];   // 寅午戌：火丑、鈴卯
  if ([8,0,4].includes(b)) return [2,10];   // 申子辰：火寅、鈴戌
  if ([5,9,1].includes(b)) return [3,10];   // 巳酉丑：火卯、鈴戌
  return [9,10];                            // 亥卯未：火酉、鈴戌
}
// 天馬依生月（全書：寅午戌月在申…），即以生月所在地支套用三合
function tianMa(b){
  if ([2,6,10].includes(b)) return 8;
  if ([8,0,4].includes(b)) return 2;
  if ([5,9,1].includes(b)) return 11;
  return 5;
}
// 十四主星與六顆輔星的亮度，依《紫微斗數全書》通行表，順序為子丑寅卯辰巳午未申酉戌亥。
const BRIGHTNESS = {
  紫微: '平廟旺旺得旺廟廟旺旺得旺',
  天機: '廟陷得旺利平廟陷得旺利平',
  太陽: '陷不旺廟旺旺旺得得平不陷',
  武曲: '旺廟得利廟平旺廟得利廟平',
  天同: '旺不利平平廟陷不旺平平廟',
  廉貞: '平利廟平利陷平利廟平利陷',
  天府: '廟廟廟得廟得旺廟得旺廟得',
  太陰: '廟廟旺陷陷陷不不利旺旺廟',
  貪狼: '旺廟平利廟陷旺廟平利廟陷',
  巨門: '旺不廟廟陷旺旺不廟廟陷旺',
  天相: '廟廟廟陷得得廟得廟陷得得',
  天梁: '廟旺廟廟廟陷廟旺陷得廟陷',
  七殺: '旺廟廟旺廟平旺廟廟旺廟平',
  破軍: '廟旺得陷旺平廟旺得陷旺平',
  // 輔星：文昌、文曲、火星、鈴星、擎羊、陀羅。全形空白表示這顆星不會落在該宮。
  文昌: '得廟陷利得廟陷利得廟陷利',
  文曲: '得廟平旺得廟陷旺得廟陷旺',
  火星: '陷得廟利陷得廟利陷得廟利',
  鈴星: '陷得廟利陷得廟利陷得廟利',
  擎羊: '陷廟　陷廟　陷廟　陷廟　',
  陀羅: '　廟陷　廟陷　廟陷　廟陷',
};
const MING_ZHU = ['貪狼','巨門','祿存','文曲','廉貞','武曲','破軍','武曲','廉貞','文曲','祿存','巨門'];
const SHEN_ZHU = ['火星','天相','天梁','天同','文昌','天機','火星','天相','天梁','天同','文昌','天機'];

function ziweiPosition(ju, day){
  let k = 0;
  while ((day + k) % ju) k++;
  const q = (day + k) / ju;
  return mod(2 + q - 1 + (k % 2 ? -k : k), 12);
}

/**
 * 排盤
 * input: {y, m, d, hour, minute, gender:'M'|'F', lateZi:'next'|'same', leapMode:'split'|'this'|'next'}
 * 時間需為標準時間（夏令時間由畫面先換算）。
 */
function chart(input){
  const {gender} = input;
  if (gender !== 'M' && gender !== 'F') throw Error('請選擇性別');
  const hour = Number(input.hour), minute = Number(input.minute || 0);
  if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)) throw Error('請填寫正確的出生時間');
  let y = Number(input.y), m = Number(input.m), d = Number(input.d);
  if (!inRange(y, m, d)) throw RangeError('日期需介於 1900 年 1 月 31 日至 2100 年底');
  // 晚子時（23:00 後）預設算作隔天
  const lateZi = input.lateZi === 'same' ? 'same' : 'next';
  let shifted = false;
  if (hour === 23 && lateZi === 'next') {
    const n = dayNumber(y, m, d) + 1;
    if (n > LAST_DAY) throw RangeError('日期超出可排範圍');
    ({y, m, d} = toSolar(n)); shifted = true;
  }
  const lunar = solarToLunar(y, m, d);
  const h = hourBranch(hour);
  // 閏月：預設十五日以前算本月，十六日起算下個月
  const leapMode = ['this','next'].includes(input.leapMode) ? input.leapMode : 'split';
  let month = lunar.month;
  if (lunar.leap && (leapMode === 'next' || (leapMode === 'split' && lunar.day > 15))) month = month % 12 + 1;

  const ys = mod(lunar.year - 4, 10), yb = mod(lunar.year - 4, 12);
  const yearStem = STEMS[ys];
  const yang = ys % 2 === 0;
  const forward = (yang && gender === 'M') || (!yang && gender === 'F');

  const monthPos = mod(2 + month - 1, 12);
  const ming = mod(monthPos - h, 12);
  const shen = mod(monthPos + h, 12);
  // 五虎遁：寅宮天干
  const yinStem = [2, 4, 6, 8, 0][ys % 5];
  const stemOf = b => mod(yinStem + mod(b - 2, 12), 10);
  const mingStem = stemOf(ming);
  const element = NAYIN[Math.floor(ganzhiIndex(mingStem, ming) / 2)];
  const ju = JU[element];

  const stars = Array.from({length: 12}, () => []);
  const put = (pos, name, kind) => stars[mod(pos, 12)].push({name, kind});
  const z = ziweiPosition(ju, lunar.day);
  put(z, '紫微', 'major'); put(z - 1, '天機', 'major'); put(z - 3, '太陽', 'major');
  put(z - 4, '武曲', 'major'); put(z - 5, '天同', 'major'); put(z - 8, '廉貞', 'major');
  const t = mod(4 - z, 12);
  put(t, '天府', 'major'); put(t + 1, '太陰', 'major'); put(t + 2, '貪狼', 'major');
  put(t + 3, '巨門', 'major'); put(t + 4, '天相', 'major'); put(t + 5, '天梁', 'major');
  put(t + 6, '七殺', 'major'); put(t + 10, '破軍', 'major');

  put(4 + month - 1, '左輔', 'lucky'); put(10 - (month - 1), '右弼', 'lucky');
  put(10 - h, '文昌', 'lucky'); put(4 + h, '文曲', 'lucky');
  const [kui, yue] = KUI_YUE[yearStem];
  put(kui, '天魁', 'lucky'); put(yue, '天鉞', 'lucky');

  const lc = LUCUN[yearStem];
  put(lc, '祿存', 'other'); put(lc + 1, '擎羊', 'tough'); put(lc - 1, '陀羅', 'tough');
  const [huo, ling] = huoLingStart(yb);
  put(huo + h, '火星', 'tough'); put(ling + h, '鈴星', 'tough');
  put(11 - h, '地空', 'tough'); put(11 + h, '地劫', 'tough');
  put(tianMa(monthPos), '天馬', 'other');
  // 桃花與刑星：紅鸞（卯起子年逆行）、天喜（紅鸞對宮）、天刑（酉起正月）、天姚（丑起正月）
  const hong = mod(3 - yb, 12);
  put(hong, '紅鸞', 'other'); put(hong + 6, '天喜', 'other');
  put(9 + month - 1, '天刑', 'tough'); put(1 + month - 1, '天姚', 'other');

  stars.forEach((list, b) => list.forEach(s => { const lv = BRIGHTNESS[s.name] && BRIGHTNESS[s.name][b].trim(); if (lv) s.bright = lv; }));

  SIHUA[yearStem].forEach((name, i) => {
    for (const list of stars) for (const s of list) if (s.name === name) s.hua = SIHUA_NAMES[i];
  });

  const palaces = BRANCHES.map((br, b) => {
    const idx = mod(ming - b, 12);
    const step = forward ? mod(b - ming, 12) : mod(ming - b, 12);
    return {
      branch: br, index: b, stem: STEMS[stemOf(b)], name: PALACES[idx],
      isShen: b === shen, stars: stars[b],
      decade: [ju + step * 10, ju + step * 10 + 9],
    };
  });

  return {
    input: {...input, lateZi, leapMode},
    solar: {y, m, d}, shifted,
    lunar: {...lunar, text: (lunar.leap ? '閏' : '') + MONTHS[lunar.month - 1] + '月' + DAY_NAMES[lunar.day - 1], usedMonth: month},
    yearGanzhi: yearStem + BRANCHES[yb],
    hourBranch: BRANCHES[h] + '時',
    yinyang: (yang ? '陽' : '陰') + (gender === 'M' ? '男' : '女'),
    forward, ju, juName: JU_NAMES[ju], element,
    ming, shen,
    mingZhu: MING_ZHU[ming], shenZhu: SHEN_ZHU[yb],
    sihua: SIHUA[yearStem].map((n, i) => n + SIHUA_NAMES[i]),
    palaces,
  };
}

const api = {BRIGHTNESS, STEMS, BRANCHES, PALACES, solarToLunar, lunarToSolar, chart, ziweiPosition, hourBranch, dayNumber, inRange, FIRST_DAY, LAST_DAY, toSolar};
if (typeof module !== 'undefined') module.exports = api; else g.Ziyuan = api;
})(this);
