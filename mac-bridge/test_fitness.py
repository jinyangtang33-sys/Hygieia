import json
import sqlite3
import unittest
import uuid
from test_bridge import USER, START, batch
import bridge
from projection import project_fitness
from vendor import puls_receiver as puls

def workout(**changes):
    return {'uuid':str(uuid.uuid4()),'type':'HKWorkoutTypeIdentifier','kind':'workout','start':START-3600000,'end':START+3600000,'sourceName':'合成测试','workout':{'activityType':'running','duration':3600,'totalDistanceMeters':8000,'totalEnergyKcal':450,'statisticsDetail':{'HKQuantityTypeIdentifierHeartRate':{'avg':130,'min':80,'max':160}}},**changes}

def rings(**changes):
    return {'date':START,'localDate':'2026-10-14','moveKcal':650,'moveGoalKcal':500,'exerciseMin':30,'exerciseGoalMin':30,'standHours':10,'standGoalHours':12,'moveMode':0,**changes}

class FitnessTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.b=bridge.Bridge(self.db,{'phoneToken':'synthetic','userID':USER,'cloud':{'synthetic':True}})
    def tearDown(self):
        self.db.close()
    def ingest_rings(self,r):
        wire=json.dumps({'schemaVersion':1,'type':'mixed','batchID':str(uuid.uuid4()),'sampleCount':0,'activitySummaryCount':1})+'\n'+json.dumps({'activitySummary':r})
        puls.apply_batch(self.db,puls.parse_batch(wire),USER)
    def test_workout_preserves_active_seconds_and_start_day_without_private_streams(self):
        w=workout(metadata={'private':'never sent'},route=[{'lat':1,'lon':2}]);wire=batch([w]);puls.apply_batch(self.db,puls.parse_batch(wire),USER)
        f=project_fitness(self.db,USER);self.assertEqual(set(f),{'2026-10-13'})
        item=f['2026-10-13']['workouts'][0];self.assertEqual(item['durationSec'],3600);self.assertEqual(item['distanceMeters'],8000);self.assertEqual(item['heartRateAvg'],130);self.assertNotIn('route',item);self.assertNotIn('metadata',item)
        puls.apply_batch(self.db,puls.parse_batch(wire),USER);self.assertEqual(len(project_fitness(self.db,USER)['2026-10-13']['workouts']),1)
    def test_null_replacements_move_minutes_and_goals(self):
        self.ingest_rings(rings());self.assertEqual(project_fitness(self.db,USER)['2026-10-14']['rings']['standHours'],10)
        self.ingest_rings({'date':START,'localDate':'2026-10-14','moveMode':1,'moveTimeMin':0,'moveTimeGoalMin':60})
        r=project_fitness(self.db,USER)['2026-10-14']['rings'];self.assertEqual(r,{'moveTimeMin':0,'moveTimeGoalMin':60,'moveMode':1})
        self.assertEqual(project_fitness(self.db,str(uuid.uuid4())),{})
    def test_offline_retry_ack_and_workout_deletion_clear(self):
        w=workout();puls.apply_batch(self.db,puls.parse_batch(batch([w])),USER)
        with self.assertRaises(ValueError):self.b.forward_once(lambda *_: (_ for _ in ()).throw(ValueError('offline')))
        calls=[];self.b.forward_once(lambda c,days:calls.extend(days));self.b.forward_once(lambda c,days:calls.extend(days));self.assertEqual(len(calls),1);self.assertEqual(len(calls[0]['fitness']['workouts']),1)
        puls.apply_batch(self.db,puls.parse_batch(batch(deletions=[{'uuid':w['uuid'],'type':w['type']}])),USER)
        self.b.forward_once(lambda c,days:calls.extend(days));self.assertEqual(calls[-1]['fitness'],{'rings':None,'workouts':[]})
    def test_upgrade_replays_existing_health_checkpoint_and_limits_batch_size(self):
        self.db.execute('insert into bridge_forwarded values (?,?)',('2026-10-13','legacy-health-only-digest'))
        w=workout();puls.apply_batch(self.db,puls.parse_batch(batch([w])),USER)
        calls=[];self.b.forward_once(lambda c,days:calls.append(days));self.assertEqual(len(calls[0][0]['fitness']['workouts']),1);self.assertLessEqual(len(calls[0]),2)

if __name__=='__main__':unittest.main(verbosity=2)
