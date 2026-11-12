"""Build the Chinese lunisolar calendar for 1900-2100 from astronomy (PyEphem).

Rules: a month starts on the civil date of the new moon; the month containing
the winter solstice is month 11; in a sui with 13 months, the first month with
no principal term (中氣) is the leap month. Civil dates use UTC+8 from 1929 and
Beijing local mean time (116°25′E, UTC+7:45:40) before that.

Output: JSON list, one entry per lunar year Y (1900..2100):
  [Y, jd_of_new_year (days since 1970-01-01), [month lengths...], leap_index]
leap_index = 0 if none, else the leap month follows month `leap_index`.
"""
import ephem, json, math, sys, datetime

# Before 1929 the calendar was reckoned in Beijing local mean time. The 1906
# and 1922 almanacs as published (e.g. 1922 閏五月) match UTC+8 reckoning instead,
# so those two years follow it to agree with the calendars people actually used.
def tz_hours(dt_utc):
    if dt_utc.year >= 1929 or dt_utc.year in (1906, 1922):
        return 8.0
    return (116 + 25/60) / 15

def civil_day(ed):
    """ephem.Date (UTC) -> days since 1970-01-01 in the civil zone."""
    dt = ed.datetime()
    off = tz_hours(dt)
    local = dt + datetime.timedelta(hours=off)
    return (local.date() - datetime.date(1970, 1, 1)).days

def sun_lon(d):
    s = ephem.Sun(d)
    return math.degrees(ephem.Ecliptic(s, epoch=d).lon)

def term_time(target, start):
    """First moment after `start` when the sun's apparent longitude reaches target (deg)."""
    d = ephem.Date(start)
    lon = sun_lon(d)
    diff = (target - lon) % 360
    d = ephem.Date(d + diff / 360 * 365.2422)
    for _ in range(50):
        lon = sun_lon(d)
        delta = ((target - lon + 180) % 360) - 180
        if abs(delta) < 1e-7:
            break
        d = ephem.Date(d + delta / 360 * 365.2422)
    return d

# principal terms: longitudes 0,30,...,330 (冬至 = 270)
def principal_terms(start, end):
    out = []
    d = ephem.Date(start)
    lon = sun_lon(d)
    k = math.floor(lon / 30) + 1
    while True:
        t = term_time((k * 30) % 360, d)
        if t > end:
            break
        out.append(t)
        d = ephem.Date(t + 1)
        k += 1
    return out

def new_moons(start, end):
    out = []
    d = ephem.previous_new_moon(start)
    while d <= end:
        out.append(d)
        d = ephem.next_new_moon(ephem.Date(d + 1))
    return out

def winter_solstice(year):
    return term_time(270, ephem.Date(f'{year}/12/1'))

def sui_months(year):
    """Months from the month containing 冬至 of `year` up to (not incl.) that of year+1.
    Returns list of (start_civil_day, is_leap, month_number)."""
    ws0, ws1 = winter_solstice(year), winter_solstice(year + 1)
    nms = new_moons(ephem.Date(ws0 - 40), ephem.Date(ws1 + 40))
    days = [civil_day(n) for n in nms]
    ws0d, ws1d = civil_day(ws0), civil_day(ws1)
    i0 = max(i for i, d in enumerate(days) if d <= ws0d)
    i1 = max(i for i, d in enumerate(days) if d <= ws1d)
    starts = days[i0:i1 + 1]  # includes month 11 of next sui as last element
    count = i1 - i0
    terms = [civil_day(t) for t in principal_terms(ephem.Date(ws0 - 1), ephem.Date(ws1 + 1))]
    out, num, leap_used = [], 11, False
    for j in range(count):
        a, b = starts[j], starts[j + 1]
        has_zq = any(a <= t < b for t in terms)
        if count == 13 and not leap_used and not has_zq and j > 0:
            out.append((a, True, num))
            leap_used = True
        else:
            if j > 0:
                num = num % 12 + 1
            out.append((a, False, num))
    assert count in (12, 13) and (count == 12 or leap_used), (year, count)
    return out, starts[count]

def build():
    months = []  # (start_day, is_leap, month_number)
    for y in range(1898, 2101):
        ms, _ = sui_months(y)
        months.extend(ms)
    years = []
    for Y in range(1900, 2101):
        idx = next(i for i, m in enumerate(months) if m[2] == 1 and not m[1] and
                   datetime.date(1970, 1, 1) + datetime.timedelta(days=m[0]) >= datetime.date(Y, 1, 15) and
                   (datetime.date(1970, 1, 1) + datetime.timedelta(days=m[0])).year == Y)
        lengths, leap = [], 0
        j = idx
        while True:
            lengths.append(months[j + 1][0] - months[j][0])
            if months[j][1]:
                leap = months[j][2]
            j += 1
            if months[j][2] == 1 and not months[j][1]:
                break
        years.append([Y, months[idx][0], lengths, leap])
    return years

if __name__ == '__main__':
    # usage: python3 tools/gen_lunar.py docs/calendar.js   (needs: pip install ephem)
    rows = []
    for Y, start, lengths, leap in build():
        mask = sum(1 << i for i, L in enumerate(lengths) if L == 30)
        rows.append([Y, start, mask, leap])
    js = ('// 1900-2100 農曆資料，由 tools/gen_lunar.py 依天文計算產生，請勿手動修改。\n'
          '// 每列：[農曆年, 正月初一（1970-01-01 起算的日數）, 大月位元（1=30 天）, 閏月（0=無）]\n'
          '(function(g){const d=' + json.dumps(rows, separators=(',', ':')) +
          ';if(typeof module!=="undefined")module.exports=d;else g.ZIYUAN_LUNAR=d})(this);\n')
    open(sys.argv[1], 'w', encoding='utf-8').write(js)
    print(len(rows), rows[0], rows[-1])
