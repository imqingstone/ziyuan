// 紫微白話總結：把命盤的重點整理成幾段話。語氣是認識自己的參考，不做吉凶斷語。
(function(g){
const TOPIC = {命宮: '自己', 兄弟: '手足與夥伴', 夫妻: '感情與伴侶', 子女: '子女、晚輩與創作', 財帛: '金錢', 疾厄: '身心狀態', 遷移: '外出與在外的表現',
  交友: '朋友與人際', 官祿: '工作與學業', 田宅: '家庭與居住', 福德: '內心與興趣', 父母: '父母、長輩與上司'};
const HUA_LINE = {
  化祿: t => t + '方面容易有資源與順利',
  化權: t => '在' + t + '方面，你有主導力與行動力',
  化科: t => t + '方面容易有好表現與貴人',
  化忌: t => t + '是你最在意、也最需要用心經營的課題',
};
const HUA_SELF = {
  化祿: '你本身就容易有好人緣與機會',
  化權: '你本身很有主見與行動力，習慣掌握方向',
  化科: '你本身做事有條理，容易被看見、得到好名聲',
  化忌: '你對自己要求比較多，容易想太多，學著對自己寬容一點',
};
const palName = n => n === '命宮' ? '命宮' : n + '宮';

function summarize(c, T, R, Z, thisYear){
  const out = [], P = c.palaces, majors = p => p.stars.filter(s => s.kind === 'major');
  const label = s => s.name + (s.bright ? '（' + s.bright + '）' : '');

  // 命宮
  const ming = P[c.ming], mm = majors(ming);
  let who;
  if (mm.length) {
    who = '你的命宮是' + mm.map(label).join('、') + '。' + (R['命宮'] && R['命宮'][mm[0].name] || T.STAR_INFO[mm[0].name][1]);
    if (mm[1] && R['命宮'] && R['命宮'][mm[1].name]) who += mm[1].name + '的部分，' + R['命宮'][mm[1].name].split('。')[0] + '。';
  } else {
    const opp = majors(P[(c.ming + 6) % 12]);
    who = '你的命宮沒有主星，傳統上借對宮的' + opp.map(label).join('、') + '來看。' + (opp[0] && R['命宮'] && R['命宮'][opp[0].name] ? R['命宮'][opp[0].name] : '') +
      '空宮的人通常比較有彈性，容易受環境影響，也很能適應不同的場合。';
  }
  out.push(['你是什麼樣的人', who]);

  // 身宮
  const shen = P[c.shen];
  out.push(['後天的重心', c.shen === c.ming
    ? '你的身宮和命宮在同一宮，表裡一致，先天的個性會一路陪著你，越活越像自己。'
    : '你的身宮在' + palName(shen.name) + '，人生中後段會越來越重視' + TOPIC[shen.name] + '。' + T.PALACE_INFO[shen.name]]);

  // 生年四化
  const where = name => P.find(p => p.stars.some(s => s.name === name));
  const lines = c.sihua.map(x => {
    const star = x.slice(0, 2), hua = x.slice(2), p = where(star);
    return p ? hua + '在' + palName(p.name) + '（' + star + '）：' + (p.name === '命宮' ? HUA_SELF[hua] : HUA_LINE[hua](TOPIC[p.name])) + '。' : '';
  }).filter(Boolean);
  out.push(['人生的亮點與課題', lines.join('\n')]);

  // 現在這個階段
  if (Z && thisYear >= c.lunar.year) {
    const Y = Z.yearly(c, thisYear);
    let now = '';
    if (Y.daxian != null) {
      const d = P[Y.daxian], dm = majors(d);
      now += '你目前（虛歲 ' + Y.age + '）走' + palName(d.name) + '的大限（' + d.decade[0] + '–' + d.decade[1] + ' 歲），這十年的重心在' + TOPIC[d.name] + (dm.length ? '，大限宮有' + dm.map(s => s.name).join('、') : '') + '。';
    } else now += '你還沒進入第一個大限，目前以命宮的特質為主。';
    const lm = P[Y.ming];
    now += thisYear + ' ' + Y.ganzhi + '年，流年命宮落在本命的' + palName(lm.name) + '，今年的重心偏向' + TOPIC[lm.name] + '。';
    const lu = Y.sihua[0], ji = Y.sihua[3], pl = where(lu.name), pj = where(ji.name);
    if (pl && pj) now += '流年化祿的' + lu.name + '在' + palName(pl.name) + '，' + TOPIC[pl.name] + '方面比較順；流年化忌的' + ji.name + '在' + palName(pj.name) + '，' + TOPIC[pj.name] + '方面多用一點心。';
    out.push(['現在這個階段', now]);
  }
  return out;
}
const api = {summarize, TOPIC};
if (typeof module !== 'undefined') module.exports = api; else g.ZiyuanSummary = api;
})(this);
