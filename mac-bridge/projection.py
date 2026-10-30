"""Daily dashboard views. Raw records remain in SQLite; only summaries go online.

Use HealthKit's on-device, all-device daily statistics, never sum raw step/energy
samples across iPhone and Watch. Sleep uses the union of asleep intervals (not
in-bed); a continuous overnight episode belongs to its waking day, Shanghai time.
"""
import json
from datetime import datetime, timedelta, timezone

ZONE = timezone(timedelta(hours=8))
PREFIX = 'HKQuantityTypeIdentifier'
QUANTITIES = {
    'StepCount': ('steps', 'sum', 'count', 100000),
    'AppleExerciseTime': ('exercise', 'sum', 'min', 1440),
    'ActiveEnergyBurned': ('activeEnergy', 'sum', 'kcal', 20000),
    'RestingHeartRate': ('restingHeartRate', 'average', 'count/min', 300),
    'HeartRate': ('heartRate', 'average', 'count/min', 300),
    'HeartRateVariabilitySDNN': ('hrv', 'average', 'ms', 2000),
    'RespiratoryRate': ('respiratoryRate', 'average', 'count/min', 100),
    'BodyMass': ('weight', 'mostRecent', 'kg', 500),
    'DietaryWater': ('water', 'sum', 'mL', 10000),
}


def day(ms):
    return datetime.fromtimestamp(ms / 1000, ZONE).strftime('%Y-%m-%d')


def union(intervals):
    merged = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def hours(intervals):
    return round(sum(b-a for a,b in union(intervals)) / 3600000, 2)


def project(db, user):
    today = datetime.now(ZONE).strftime('%Y-%m-%d')
    days = {}
    def put(date, key, value):
        if '2000-01-01' <= date <= today:
            days.setdefault(date, {})[key] = value
    for row in db.execute('SELECT type,func,interval_value,interval_unit,device_filter,bucket_start_ms,value,unit FROM aggregates WHERE user_id=? ORDER BY updated_at,bucket_start_ms', (user,)):
        typ, func, n, interval, device, start, value, unit = row
        config = QUANTITIES.get(typ.removeprefix(PREFIX)) if typ.startswith(PREFIX) else None
        if not config or (n, interval, device) != (1, 'day', 'all'):
            continue
        key, wanted, canonical, maximum = config
        if func != wanted or unit != canonical or value is None:
            continue
        if isinstance(value, (int, float)) and 0 <= value <= maximum:
            put(day(start), key, int(round(value)) if key == 'steps' else round(value, 2))
    # Ring summaries are already whole-day HealthKit values, safe as fallback.
    for date, energy, exercise in db.execute('SELECT date,move_kcal,exercise_min FROM activity_summaries WHERE user_id=?', (user,)):
        for key, value, maximum in [('activeEnergy', energy, 20000), ('exercise', exercise, 1440)]:
            if value is not None and 0 <= value <= maximum and key not in days.get(date, {}):
                put(date, key, round(value, 2))
    sleep = []
    for start, end, category in db.execute("SELECT start_ms,end_ms,category FROM samples WHERE user_id=? AND type='HKCategoryTypeIdentifierSleepAnalysis' AND category IN (1,3,4,5) ORDER BY start_ms", (user,)):
        if end > start and end-start <= 86400000:
            sleep.append((start, end, category))
    # Form episodes using at most a three-hour gap. Joining intervals before
    # assigning their day prevents splitting a night at midnight.
    episodes = []
    for item in sleep:
        if episodes and item[0] <= episodes[-1]['end'] + 3*3600000:
            episodes[-1]['items'].append(item)
            episodes[-1]['end'] = max(item[1], episodes[-1]['end'])
        else:
            episodes.append({'items': [item], 'end': item[1]})
    by_day = {}
    for episode in episodes:
        date = day(episode['end'])
        by_day.setdefault(date, []).extend(episode['items'])
    for date, items in by_day.items():
        duration = hours([(a,b) for a,b,_ in items])
        if duration > 24:
            continue
        put(date, 'sleep', duration)
        for category, key in [(3, 'coreSleep'), (4, 'deepSleep'), (5, 'remSleep')]:
            intervals = [(a,b) for a,b,c in items if c == category]
            if intervals:
                put(date, key, hours(intervals))
        for key, ts in [('sleepStart', min(a for a,_,_ in items)), ('sleepEnd', max(b for _,b,_ in items))]:
            put(date, key, datetime.fromtimestamp(ts/1000, ZONE).isoformat(timespec='seconds'))
    return days


def project_fitness(db, user):
    """Small, explicit fitness summaries only; routes, events and raw samples stay local."""
    import math
    today = datetime.now(ZONE).strftime('%Y-%m-%d')
    result = {}
    def valid_date(date):
        try:
            return '2000-01-01' <= date <= today and datetime.strptime(date, '%Y-%m-%d').strftime('%Y-%m-%d') == date
        except (ValueError, TypeError):
            return False
    def number(value, maximum):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= maximum
    def view(date):
        return result.setdefault(date, {'rings': None, 'workouts': []})
    ring_fields = [('moveKcal','move_kcal',20000),('moveGoalKcal','move_goal_kcal',20000),('exerciseMin','exercise_min',1440),('exerciseGoalMin','exercise_goal_min',1440),('standHours','stand_hours',24),('standGoalHours','stand_goal_hours',24),('moveTimeMin','move_time_min',1440),('moveTimeGoalMin','move_time_goal_min',1440)]
    columns = ','.join(column for _,column,_ in ring_fields)
    for row in db.execute('SELECT date,move_mode,'+columns+' FROM activity_summaries WHERE user_id=?', (user,)):
        date, mode, *values = row
        if not valid_date(date):
            continue
        rings = {key:round(value,2) for (key,_,maximum),value in zip(ring_fields,values) if number(value,maximum)}
        if mode in (0,1):
            rings['moveMode'] = mode
        # An all-null replacement must clear earlier ring values, not keep them.
        view(date)['rings'] = rings or None
    for (line,) in db.execute("SELECT line FROM samples WHERE user_id=? AND kind='workout' ORDER BY start_ms,uuid", (user,)):
        try:
            raw = json.loads(line)
            w = raw['workout']
            start, end = raw['start'], raw['end']
            date = day(start)
            typ = w['activityType']
            if not valid_date(date) or not isinstance(typ,str) or not 1 <= len(typ) <= 80 or not all(c.isascii() and (c.isalnum() or c=='_') for c in typ):
                continue
            if not number(w.get('duration'),604800) or not 0 <= end-start <= 604800000:
                continue
            iso = lambda ms: datetime.fromtimestamp(ms/1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
            item = {'id':raw['uuid'].lower(), 'type':typ, 'start':iso(start), 'end':iso(end), 'durationSec':round(w['duration'],2), 'source':str(raw.get('sourceName') or '')[:120]}
            for key, source, maximum in [('distanceMeters','totalDistanceMeters',10000000),('energyKcal','totalEnergyKcal',200000)]:
                if number(w.get(source),maximum):
                    item[key] = round(w[source],2)
            detail = w.get('statisticsDetail',{}).get('HKQuantityTypeIdentifierHeartRate',{})
            for key, source in [('heartRateAvg','avg'),('heartRateMin','min'),('heartRateMax','max')]:
                if number(detail.get(source),500):
                    item[key] = round(detail[source],2)
            view(date)['workouts'].append(item)
            if len(view(date)['workouts']) > 500:
                raise ValueError('同日训练记录超过 500 条，未上传；请联系维护者分批处理。')
        except (KeyError, TypeError, OverflowError, json.JSONDecodeError):
            continue
    return result
