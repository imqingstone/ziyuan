// 執行：node tests/verify.js
const assert = require('assert');
const Z = require('../docs/engine.js');
const ref = require('./reference-months.json');

// ---------- 1. 農曆換算 ----------
// 與另一份通行農曆表（lunardate 套件）逐月比對。以下三天兩份資料不同：
// 朔的時刻落在午夜前後幾分鐘或明顯在當天（1954），本站依天文計算（UTC+8）。
const KNOWN_DIFFS = {
  '1933-07-22': '朔在 7/23 00:03，本站以 7/23 為六月初一（對照表為 7/22）',
  '1954-11-26': '朔在 11/25 20:30，本站以 11/25 為十一月初一（對照表為 11/26）',
  '1978-09-02': '朔在 9/3 00:09，本站以 9/3 為八月初一（對照表為 9/2）',
};
let monthChecks = 0, skipped = 0;
for (const [iso, year, month, leap] of ref) {
  if (KNOWN_DIFFS[iso]) { skipped++; continue; }
  const [y, m, d] = iso.split('-').map(Number);
  const l = Z.solarToLunar(y, m, d);
  assert.deepStrictEqual([l.year, l.month, l.day, l.leap], [year, month, 1, !!leap], iso);
  monthChecks++;
}
// 每一天都能來回換算，且日子連續
let days = 0, prev = null;
for (let n = Z.FIRST_DAY; n <= Z.LAST_DAY; n++) {
  const {y, m, d} = Z.toSolar(n);
  const l = Z.solarToLunar(y, m, d);
  assert.deepStrictEqual(Z.lunarToSolar(l.year, l.month, l.day, l.leap), {y, m, d});
  if (prev && l.day !== 1) assert.strictEqual(l.day, prev.day + 1);
  if (prev && l.day === 1) assert.ok(prev.day === 29 || prev.day === 30);
  prev = l; days++;
}
assert.throws(() => Z.solarToLunar(1900, 1, 30));
// 常見年份抽查
assert.deepStrictEqual(Z.solarToLunar(2024, 2, 10), {year: 2024, month: 1, day: 1, leap: false});
assert.deepStrictEqual(Z.solarToLunar(2023, 3, 22), {year: 2023, month: 2, day: 1, leap: true});
assert.deepStrictEqual(Z.solarToLunar(2020, 5, 23), {year: 2020, month: 4, day: 1, leap: true});

// ---------- 2. 紫微星定位（對照傳統口訣表） ----------
// 各局初一：水二局丑、木三局辰、金四局亥、土五局午、火六局酉；水二局初二寅
const B = s => Z.BRANCHES.indexOf(s);
assert.strictEqual(Z.ziweiPosition(2, 1), B('丑'));
assert.strictEqual(Z.ziweiPosition(2, 2), B('寅'));
assert.strictEqual(Z.ziweiPosition(3, 1), B('辰'));
assert.strictEqual(Z.ziweiPosition(3, 2), B('丑'));
assert.strictEqual(Z.ziweiPosition(3, 3), B('寅'));
assert.strictEqual(Z.ziweiPosition(4, 1), B('亥'));
assert.strictEqual(Z.ziweiPosition(5, 1), B('午'));
assert.strictEqual(Z.ziweiPosition(6, 1), B('酉'));
assert.strictEqual(Z.ziweiPosition(2, 30), B('辰'));
assert.strictEqual(Z.ziweiPosition(6, 2), B('午'));
assert.strictEqual(Z.ziweiPosition(6, 6), B('寅'));

// ---------- 3. 時辰 ----------
assert.strictEqual(Z.hourBranch(0), 0); assert.strictEqual(Z.hourBranch(1), 1);
assert.strictEqual(Z.hourBranch(12), 6); assert.strictEqual(Z.hourBranch(23), 0);

// ---------- 4. 全盤規則檢查（隨機 3000 張） ----------
const MAJOR = ['紫微','天機','太陽','武曲','天同','廉貞','天府','太陰','貪狼','巨門','天相','天梁','七殺','破軍'];
const OTHERS = ['左輔','右弼','文昌','文曲','天魁','天鉞','祿存','擎羊','陀羅','火星','鈴星','地空','地劫','天馬','紅鸞','天喜','天刑','天姚'];
const where = (c, name) => c.palaces.findIndex(p => p.stars.some(s => s.name === name));
let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
let charts = 0;
for (let i = 0; i < 3000; i++) {
  const n = Z.FIRST_DAY + rnd(Z.LAST_DAY - Z.FIRST_DAY - 1);
  const {y, m, d} = Z.toSolar(n);
  const c = Z.chart({y, m, d, hour: rnd(24), minute: rnd(60), gender: rnd(2) ? 'M' : 'F', leapMode: ['split','this','next'][rnd(3)], lateZi: rnd(2) ? 'next' : 'same'});
  for (const s of [...MAJOR, ...OTHERS]) assert.strictEqual(c.palaces.filter(p => p.stars.some(t => t.name === s)).length, 1, s);
  const mod = (a, b) => ((a % b) + b) % b;
  const zi = where(c, '紫微'), fu = where(c, '天府');
  assert.strictEqual(mod(zi + fu, 12), 4);                       // 紫微、天府以寅申為軸對稱
  assert.strictEqual(mod(where(c, '左輔') + where(c, '右弼'), 12), 2);  // 輔弼以丑未為軸對稱
  assert.strictEqual(mod(where(c, '文昌') + where(c, '文曲'), 12), 2);  // 昌曲亦同
  assert.strictEqual(mod(where(c, '地空') + where(c, '地劫'), 12), 10); // 空劫以巳亥為軸對稱
  assert.strictEqual(mod(where(c, '擎羊') - where(c, '祿存'), 12), 1);
  assert.strictEqual(mod(where(c, '祿存') - where(c, '陀羅'), 12), 1);
  // 十二宮各一、命宮在 ming、身宮恰一個
  assert.deepStrictEqual([...new Set(c.palaces.map(p => p.name))].length, 12);
  assert.strictEqual(c.palaces[c.ming].name, '命宮');
  assert.strictEqual(c.palaces.filter(p => p.isShen).length, 1);
  // 四化各一顆
  assert.strictEqual(c.palaces.flatMap(p => p.stars).filter(s => s.hua).length, 4);
  // 大限：命宮從局數起，十二宮連續不重疊
  assert.strictEqual(c.palaces[c.ming].decade[0], c.ju);
  assert.deepStrictEqual(c.palaces.map(p => p.decade[0]).sort((a, b) => a - b), Array.from({length: 12}, (_, k) => c.ju + 10 * k));
  charts++;
}

// ---------- 5. 範例命盤（逐步手算核對） ----------
// 1990-06-15 12:00 女：農曆庚午年五月廿三、午時。
// 寅起正月順數到五月為午；午時（第 7 個時辰）從午逆數 6 位→命宮子；身宮順數→子。
// 庚年五虎遁起戊寅，順排到子宮為戊子，納音霹靂火 → 火六局。廿三日：23+1=24=6×4，
// 借 1 為奇數，自寅數 4 位到巳再逆 1 位→辰，紫微在辰、天府在子。陽年女命逆行。
const ex = Z.chart({y: 1990, m: 6, d: 15, hour: 12, minute: 0, gender: 'F'});
assert.strictEqual(ex.yearGanzhi, '庚午');
assert.strictEqual(ex.lunar.text, '五月廿三');
assert.strictEqual(ex.palaces[ex.ming].branch, '子');
assert.strictEqual(ex.palaces[ex.ming].stem + ex.palaces[ex.ming].branch, '戊子');
assert.strictEqual(ex.juName, '火六局');
assert.strictEqual(ex.palaces[where(ex, '紫微')].branch, '辰');
assert.strictEqual(ex.palaces[where(ex, '天府')].branch, '子');
assert.strictEqual(ex.forward, false);
assert.deepStrictEqual(ex.sihua, ['太陽化祿','武曲化權','太陰化科','天同化忌']);
assert.strictEqual(ex.palaces[where(ex, '祿存')].branch, '申'); // 庚祿在申
assert.strictEqual(ex.palaces[where(ex, '天馬')].branch, '申'); // 五月：正五九月馬在申

// 與文墨天機逐宮核對過的命盤：1979-02-23 00:05 女（農曆己未年正月廿七子時，陰女火六局）
const wm = Z.chart({y: 1979, m: 2, d: 23, hour: 0, minute: 5, gender: 'F'});
const layout = Object.fromEntries(wm.palaces.map(p => [p.branch, p.stars.map(s => s.name + (s.hua ? s.hua[1] : '')).sort().join(' ')]));
const expected = {
  巳: '天相 陀羅', 午: '天梁科 祿存', 未: '七殺 廉貞 擎羊', 申: '天馬 天鉞 紅鸞',
  辰: '巨門 左輔 文曲忌', 酉: '火星 天刑', 卯: '紫微 貪狼權', 戌: '天同 右弼 文昌 鈴星',
  寅: '天機 太陰 天喜', 丑: '天府 天姚', 子: '太陽 天魁', 亥: '武曲祿 破軍 地空 地劫',
};
for (const [b, s] of Object.entries(expected)) assert.strictEqual(layout[b], s.split(' ').sort().join(' '), b);
assert.strictEqual(wm.palaces[wm.ming].branch, '寅'); assert.ok(wm.palaces[wm.ming].isShen);
assert.strictEqual(wm.juName, '火六局'); assert.strictEqual(wm.yinyang, '陰女');
assert.deepStrictEqual(wm.palaces.map(p => p.branch + p.decade[0]).join(), '子106,丑116,寅6,卯16,辰26,巳36,午46,未56,申66,酉76,戌86,亥96');
// 另外兩張與文墨天機逐宮核對過的命盤
function sameAs(input, exp, ming, shen, ju, decadeAtMing){
  const c = Z.chart(input);
  const got = Object.fromEntries(c.palaces.map(p => [p.branch, p.stars.map(s => s.name + (s.hua ? s.hua[1] : '')).sort().join(' ')]));
  for (const b of Z.BRANCHES) assert.strictEqual(got[b], (exp[b] || '').split(' ').filter(Boolean).sort().join(' '), JSON.stringify(input) + ' ' + b);
  assert.strictEqual(c.palaces[c.ming].branch, ming); assert.ok(c.palaces[Z.BRANCHES.indexOf(shen)].isShen);
  assert.strictEqual(c.juName, ju); assert.strictEqual(c.palaces[c.ming].decade[0], decadeAtMing);
}
sameAs({y: 1982, m: 8, d: 30, hour: 18, minute: 0, gender: 'M'}, {
  巳: '天梁祿 天鉞 紅鸞', 午: '七殺', 未: '天姚', 申: '廉貞 地劫', 辰: '紫微權 天相 右弼', 酉: '',
  卯: '天機 巨門 天魁 天刑', 戌: '破軍 左輔科 陀羅 火星', 寅: '貪狼 天馬 地空', 丑: '太陽 太陰 文昌 文曲',
  子: '武曲忌 天府 擎羊 鈴星', 亥: '天同 祿存 天喜'}, '亥', '巳', '金四局', 4);
sameAs({y: 2015, m: 4, d: 15, hour: 6, minute: 50, gender: 'M'}, {
  巳: '天相 左輔 天馬', 午: '天梁權', 未: '廉貞 七殺 文昌 文曲', 申: '天鉞 紅鸞 地空', 辰: '巨門 擎羊', 酉: '右弼',
  卯: '紫微科 貪狼 祿存', 戌: '天同 天刑', 寅: '天機祿 太陰忌 天喜 天姚 陀羅 地劫', 丑: '天府 鈴星',
  子: '太陽 天魁 火星', 亥: '武曲 破軍'}, '子', '午', '火六局', 6);

// 晚子時：23:30 預設算隔天
const late = Z.chart({y: 2000, m: 1, d: 1, hour: 23, minute: 30, gender: 'M'});
assert.ok(late.shifted); assert.deepStrictEqual(late.solar, {y: 2000, m: 1, d: 2});
const same = Z.chart({y: 2000, m: 1, d: 1, hour: 23, minute: 30, gender: 'M', lateZi: 'same'});
assert.ok(!same.shifted);
// 閏月：2023 閏二月十六日 → 預設算三月
const lp = Z.chart({y: 2023, m: 4, d: 6, hour: 8, gender: 'M'});
assert.strictEqual(lp.lunar.text, '閏二月十六'); assert.strictEqual(lp.lunar.usedMonth, 3);
assert.strictEqual(Z.chart({y: 2023, m: 4, d: 6, hour: 8, gender: 'M', leapMode: 'this'}).lunar.usedMonth, 2);
assert.throws(() => Z.chart({y: 2000, m: 1, d: 1, hour: 8}));

// 主星亮度：每顆主星都有亮度，並抽查通行表的幾個位置。
for (const n of MAJOR) assert.strictEqual(Z.BRIGHTNESS[n].length, 12, n);
const lvAt = (n, br) => Z.BRIGHTNESS[n][B(br)];
assert.strictEqual(lvAt('紫微', '午'), '廟'); assert.strictEqual(lvAt('紫微', '子'), '平');
assert.strictEqual(lvAt('太陽', '卯'), '廟'); assert.strictEqual(lvAt('太陽', '子'), '陷');
assert.strictEqual(lvAt('太陰', '亥'), '廟'); assert.strictEqual(lvAt('太陰', '卯'), '陷');
assert.strictEqual(lvAt('天機', '巳'), '平'); assert.strictEqual(lvAt('巨門', '辰'), '陷');
const LV_MINOR = ['文昌','文曲','火星','鈴星','擎羊','陀羅'];
for (const n of LV_MINOR) assert.strictEqual(Z.BRIGHTNESS[n].length, 12, n);
assert.strictEqual(lvAt('文昌', '巳'), '廟'); assert.strictEqual(lvAt('文曲', '巳'), '廟');
assert.strictEqual(lvAt('火星', '寅'), '廟'); assert.strictEqual(lvAt('鈴星', '申'), '陷');
assert.strictEqual(lvAt('擎羊', '辰'), '廟'); assert.strictEqual(lvAt('陀羅', '亥'), '陷');
for (const c of [ex, ...Array.from({length: 500}, (_, k) => Z.chart({y: 1930 + k % 90, m: 1 + k % 12, d: 1 + k % 28, hour: k % 24, minute: 0, gender: k % 2 ? 'M' : 'F'}))])
  for (const p of c.palaces) for (const s of p.stars) {
    if (MAJOR.includes(s.name) || LV_MINOR.includes(s.name)) assert.ok('廟旺得利平不陷'.includes(s.bright) && s.bright, s.name + p.branch);
    else assert.strictEqual(s.bright, undefined, s.name);
  }

// 自化：宮干四化落在本宮的星才標示，且與宮干相符。
for (const c of [ex, wm, ...Array.from({length: 300}, (_, k) => Z.chart({y: 1940 + k % 80, m: 1 + k % 12, d: 1 + k % 28, hour: k % 24, minute: 30, gender: k % 2 ? 'M' : 'F'}))])
  for (const p of c.palaces) {
    const four = Z.SIHUA[p.stem];
    for (const s of p.stars) {
      const i = four.indexOf(s.name);
      assert.strictEqual(s.zihua, i < 0 ? undefined : Z.SIHUA_NAMES[i], s.name + p.stem + p.branch);
    }
  }
// 範例：1990/6/15 午時女命，命宮戊子有天府、武曲；戊干四化為貪狼、太陰、右弼、天機，命宮沒有自化。
assert.ok(ex.palaces[0].stars.every(s => !s.zihua));

// 流年與小限
const y26 = Z.yearly(ex, 2026);   // 庚午年生女命
assert.strictEqual(y26.ganzhi, '丙午'); assert.strictEqual(y26.age, 37);
assert.strictEqual(Z.BRANCHES[y26.ming], '午'); assert.strictEqual(y26.names[B('午')], '命宮'); assert.strictEqual(y26.names[B('巳')], '兄弟');
assert.deepStrictEqual(y26.sihua.map(x => x.name), ['天同','天機','文昌','廉貞']);
assert.strictEqual(Z.BRANCHES[Z.yearly(ex, 1990).xiaoxian], '辰');   // 午年生起辰，一歲
assert.strictEqual(Z.BRANCHES[Z.yearly(ex, 1991).xiaoxian], '卯');   // 女命逆行
assert.strictEqual(Z.BRANCHES[y26.daxian], '酉');                    // 陽女逆行，36–45 在酉
const male = Z.chart({y: 1982, m: 8, d: 30, hour: 18, minute: 0, gender: 'M'});   // 壬戌年生
assert.strictEqual(Z.BRANCHES[Z.yearly(male, 1982).xiaoxian], '辰'); assert.strictEqual(Z.BRANCHES[Z.yearly(male, 1983).xiaoxian], '巳');
assert.strictEqual(Z.yearly(ex, ex.palaces[ex.ming].decade[0] + 1989).daxian, ex.ming);
assert.strictEqual(Z.yearly(ex, 1991).daxian, null);   // 起運前
assert.throws(() => Z.yearly(ex, 1989));

// 流曜：2026 丙午年
const at = (Y, name) => Z.BRANCHES[Y.stars.findIndex(l => l.some(s => s.name === name))];
assert.deepStrictEqual(['流祿','流羊','流陀','流馬','流魁','流鉞','流昌','流曲','流鸞','流喜'].map(n => at(y26, n)),
  ['巳','午','辰','申','亥','酉','申','午','酉','卯']);
const y27 = Z.yearly(ex, 2027);   // 丁未年
assert.deepStrictEqual(['流祿','流馬','流昌','流曲','流鸞','流喜'].map(n => at(y27, n)), ['午','巳','酉','巳','申','寅']);
assert.strictEqual(y26.stars.flat().length, 10);

console.log('PASS: lunar months ' + monthChecks + ' (' + skipped + ' documented differences); ' + days + ' days round-trip; ziwei table; ' + charts + ' random charts; worked example; 3 charts matched with 文墨天機; late-zi and leap-month options; star brightness; 自化; 流年與小限; 流曜.');
