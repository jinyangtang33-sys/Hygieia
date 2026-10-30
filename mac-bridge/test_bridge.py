import gzip
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
from http.server import ThreadingHTTPServer

import bridge
from projection import project
from vendor import puls_receiver as puls

USER='5ea4d000-0000-4000-8000-000000000001'
SLEEP='HKCategoryTypeIdentifierSleepAnalysis'
START=1791907200000  # 2026-10-14 00:00 Shanghai

def batch(samples=(),aggregates=(),deletions=(),bid=None):
    header={'schemaVersion':1,'batchID':bid or str(uuid.uuid4()),'type':'mixed','reason':'manual','deviceID':'test','sampleCount':len(samples),'deletionCount':len(deletions),'aggregateCount':len(aggregates)}
    return '\n'.join(json.dumps(x) for x in [header,*samples,*[{'deleted':x} for x in deletions],*[{'aggregate':x} for x in aggregates]])

def sleep(start,end,cat=3,id=None):
    return {'uuid':id or str(uuid.uuid4()),'type':SLEEP,'kind':'category','category':cat,'start':start,'end':end}

def aggregate(value=4321,**kw):
    return {'type':'HKQuantityTypeIdentifierStepCount','func':'sum','intervalValue':1,'intervalUnit':'day','deviceFilter':'all','bucketStart':START,'bucketEnd':START+86400000,'unit':'count','value':value,**kw}

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:',check_same_thread=False)
        self.b=bridge.Bridge(self.db,{'phoneToken':'test-phone-token','userID':USER,'cloud':{'synthetic':True}})
    def tearDown(self):
        self.db.close()
    def apply(self,wire):
        return puls.apply_batch(self.db,puls.parse_batch(wire),USER)
    def test_daily_stats_no_raw_multi_device_double_count(self):
        raw={'uuid':str(uuid.uuid4()),'type':'HKQuantityTypeIdentifierStepCount','kind':'quantity','value':9000,'unit':'count','start':START}
        self.apply(batch([raw], [aggregate(),aggregate(9000,deviceFilter='watch'),aggregate(12,intervalUnit='hour')]))
        self.assertEqual(project(self.db,USER)['2026-10-14']['steps'],4321)
    def test_overnight_sleep_union_and_exclude_inbed_awake(self):
        self.apply(batch([sleep(START-2*3600000,START+6*3600000,0),sleep(START-3600000,START+2*3600000),sleep(START-3600000,START+2*3600000,1),sleep(START+2*3600000,START+3*3600000,4),sleep(START+3*3600000,START+4*3600000,5),sleep(START+4*3600000,START+5*3600000,2)]))
        view=project(self.db,USER)
        self.assertEqual(set(view),{'2026-10-14'})
        h=view['2026-10-14'];self.assertEqual(h['sleep'],5);self.assertEqual(h['deepSleep'],1);self.assertEqual(h['remSleep'],1)
    def test_idempotence_batch_and_uuid(self):
        s=sleep(START,START+3600000)
        wire=batch([s],[aggregate()]);self.apply(wire);self.apply(wire);self.apply(batch([s]))
        self.assertEqual(self.db.execute('SELECT count(*) FROM samples').fetchone()[0],1)
        self.assertEqual(project(self.db,USER)['2026-10-14']['sleep'],1)
    def test_cloud_retry_checkpoint_then_no_duplicate_send(self):
        self.apply(batch(aggregates=[aggregate()]))
        calls=[]
        def fail(c,d): raise ValueError('synthetic offline')
        with self.assertRaises(ValueError): self.b.forward_once(fail)
        self.assertEqual(self.db.execute('SELECT count(*) FROM bridge_forwarded').fetchone()[0],0)
        self.b.forward_once(lambda c,d:calls.extend(d));self.b.forward_once(lambda c,d:calls.extend(d))
        self.assertEqual(len(calls),1);self.assertEqual(calls[0]['health']['steps'],4321)
    def test_deletion_and_null_bucket_clear_old_cloud_values(self):
        s=sleep(START,START+3600000);self.apply(batch([s],[aggregate()]))
        calls=[];self.b.forward_once(lambda c,d:calls.extend(d))
        self.apply(batch(aggregates=[aggregate(None)],deletions=[{'uuid':s['uuid'].upper(),'type':SLEEP}]))
        self.b.forward_once(lambda c,d:calls.extend(d))
        self.assertEqual(calls[-1],{'date':'2026-10-14','health':{},'fitness':{'rings':None,'workouts':[]}})
    def test_malformed_batch_never_partially_written(self):
        text=batch([sleep(START,START+1)])+'\n{"unexpected":1}'
        with self.assertRaises(puls.BadRequest): self.apply(text)
        self.assertEqual(self.db.execute('SELECT count(*) FROM samples').fetchone()[0],0)
    def test_restart_replays_pending_durable_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'health.sqlite';db=sqlite3.connect(path)
            b=bridge.Bridge(db,{'phoneToken':'synthetic','userID':USER,'cloud':{'synthetic':True}})
            puls.apply_batch(db,puls.parse_batch(batch(aggregates=[aggregate()])),USER);db.close()
            db=sqlite3.connect(path);b=bridge.Bridge(db,b.config);calls=[]
            b.forward_once(lambda c,d:calls.extend(d));self.assertEqual(calls[0]['health']['steps'],4321);db.close()
    def test_heartbeat_tracks_pending_and_checkpoint_without_secrets(self):
        self.apply(batch(aggregates=[aggregate()]))
        reports=[]
        self.b.report(lambda c,s:reports.append(s))
        self.assertEqual(reports[-1]['pendingDays'],1)
        self.b.cloud_error='a private response must never be uploaded'
        self.b.report(lambda c,s:reports.append(s))
        self.assertEqual(reports[-1]['errorCode'],'upload_failed')
        self.assertNotIn('private',json.dumps(reports[-1]))
        self.b.forward_once(lambda c,d:None)
        self.b.report(lambda c,s:reports.append(s))
        self.assertEqual(reports[-1]['pendingDays'],0)
        self.assertIsNotNone(reports[-1]['lastAttempt'])
        self.assertIsNone(reports[-1]['errorCode'])
        self.assertNotIn('phoneToken',json.dumps(reports))
        self.apply(batch(aggregates=[aggregate(None)]))
        self.b.report(lambda c,s:reports.append(s))
        self.assertEqual(reports[-1]['pendingDays'],1)

    def test_reject_foreign_cloud_destination(self):
        with self.assertRaises(ValueError): bridge.validate_cloud({'bridgeUrl':'https://attacker.test','headers':[]})

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db=sqlite3.connect(':memory:',check_same_thread=False)
        cls.b=bridge.Bridge(cls.db,{'phoneToken':'synthetic-phone-token','userID':USER})
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),bridge.Handler)
        cls.server.bridge,cls.server.db,cls.server.lock=cls.b,cls.db,cls.b.lock
        cls.old_port=bridge.PORT;bridge.PORT=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.thread.join();cls.server.server_close();cls.db.close();bridge.PORT=cls.old_port
    def req(self,path,method='GET',body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',bridge.PORT,timeout=5)
        conn.request(method,path,body,headers or {});r=conn.getresponse();data=r.read();code=r.status;conn.close();return code,data
    def test_authentication_and_user_binding(self):
        self.assertEqual(self.req('/v1/capabilities')[0],401)
        self.assertEqual(self.req('/v1/batches','POST',batch(),{'Authorization':'Bearer synthetic-phone-token','X-User-ID':str(uuid.uuid4())})[0],403)
    def test_real_gzip_batch_and_retry(self):
        headers={'Authorization':'Bearer synthetic-phone-token','X-User-ID':USER,'Content-Encoding':'gzip','X-Puls-Protocol':'1'}
        wire=gzip.compress(batch(aggregates=[aggregate()]).encode())
        self.assertEqual(self.req('/v1/batches','POST',wire,headers)[0],200)
        self.assertEqual(self.req('/v1/batches','POST',wire,headers)[0],200)
        self.assertIsNotNone(self.b.get('last_received'))
        self.assertEqual(project(self.db,USER)['2026-10-14']['steps'],4321)
    def test_admin_host_csrf_and_content_type(self):
        self.assertEqual(self.req('/',headers={'Host':'evil.test'})[0],403)
        self.assertEqual(self.req('/admin/config','POST','{}',{'Origin':'https://evil.test','Content-Type':'application/json'})[0],403)
        self.assertEqual(self.req('/admin/config','POST','{}',{'Origin':'http://127.0.0.1:'+str(bridge.PORT),'X-Selfspace-Admin':self.b.admin,'Content-Type':'text/plain'})[0],403)
    def test_consistent_raw_backup_requires_admin_nonce(self):
        self.assertEqual(self.req('/admin/backup','POST','{}',{'Content-Type':'application/json'})[0],403)
        status,data=self.req('/admin/backup','POST','{}',{'Origin':'http://127.0.0.1:'+str(bridge.PORT),'Content-Type':'application/json','X-Selfspace-Admin':self.b.admin})
        self.assertEqual(status,200);self.assertTrue(data.startswith(b'SQLite format 3'))
        with tempfile.NamedTemporaryFile(suffix='.sqlite') as saved:
            saved.write(data);saved.flush();copy=sqlite3.connect(saved.name)
            self.assertEqual(copy.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            tables={r[0] for r in copy.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertIn('samples',tables);self.assertNotIn(b'synthetic-phone-token',data);copy.close()

    def test_offline_qr_and_pairing_page(self):
        status,data=self.req('/');self.assertEqual(status,200);self.assertIn(b'nonce=',data);self.assertNotIn(b'__ADMIN_NONCE__',data)
        status,data=self.req('/admin/qr');self.assertEqual(status,200);self.assertIn(b'<svg',data)
        status,data=self.req('/admin/pair');self.assertTrue(json.loads(data)['pairing'].startswith('puls://pair?'))
        self.assertNotIn(b'hax_',data)

if __name__=='__main__':unittest.main(verbosity=2)
