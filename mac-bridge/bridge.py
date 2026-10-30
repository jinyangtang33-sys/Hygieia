#!/usr/bin/env python3
"""Selfspace's local PulsHealth receiver. No third-party Python dependencies.
Raw HealthKit records: local SQLite. Cloud projections: explicitly configured private Site only.
Secrets: process memory, optionally encrypted in the macOS login Keychain.
"""
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import sys
import threading
import tempfile
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import ThreadingHTTPServer

from projection import project, project_fitness
from vendor import puls_receiver as puls
from vendor.qrcodegen import QrCode

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT.parent / '.bridge-runtime'
SITE = os.environ.get('SELFSPACE_SITE_URL', 'https://your-site.example').rstrip('/')
_site = urllib.parse.urlsplit(SITE)
if _site.scheme != 'https' or not _site.hostname or _site.username or _site.password or _site.path or _site.query or _site.fragment:
    raise ValueError('SELFSPACE_SITE_URL 必须是你自己的 HTTPS 站点源地址，不含路径或凭据。')
CLOUD_URL = SITE + '/api/health/bridge'
PORT = int(os.environ.get('SELFSPACE_PORT', '8765'))
META = '''CREATE TABLE IF NOT EXISTS bridge_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_forwarded (date TEXT PRIMARY KEY, digest TEXT NOT NULL);'''


def keychain(action, config=None):
    helper = RUNTIME / 'keychain'
    if not helper.is_file():
        if action == 'read':
            return None
        raise ValueError('本机钥匙串组件尚未就绪，请使用「启动健康中转.command」。')
    try:
        result = subprocess.run([str(helper), action], input=json.dumps(config).encode() if config else None,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('无法访问本机钥匙串，请解锁登录钥匙串后重试。') from None
    if action == 'read' and result.returncode == 3:
        return None
    if result.returncode:
        raise ValueError('钥匙串未授权；配置仍在本次运行的内存中，可稍后再次保存。')
    return json.loads(result.stdout) if action == 'read' else None


def validate_cloud(data):
    if not isinstance(data, dict) or data.get('bridgeUrl') != CLOUD_URL:
        raise ValueError('请复制观己「健康同步」页面的完整 Mac 配置。')
    headers = data.get('headers')
    if not isinstance(headers, list) or len(headers) != 2:
        raise ValueError('连接配置不完整，请重新复制。')
    auth = {h.get('key'): h.get('value') for h in headers if isinstance(h, dict)}
    if set(auth) != {'Authorization', 'OAI-Sites-Authorization'} or any(not isinstance(v,str) or not v.startswith('Bearer ') or len(v)>4096 or '\r' in v or '\n' in v for v in auth.values()):
        raise ValueError('连接密钥格式不正确，请重新复制。')
    return {'bridgeUrl': CLOUD_URL, 'headers': [{'key':k,'value':v} for k,v in auth.items()]}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # Never forward either credential to another host/login page.


def post_cloud(config, days):
    return post_payload(config, CLOUD_URL, {'source':'puls','days':days}, len(days))


def post_status(config, status):
    return post_payload(config, SITE + '/api/health/status', status)


def post_payload(config, url, body, expected_days=None):
    payload = json.dumps(body, allow_nan=False).encode()
    headers = {h['key']:h['value'] for h in config['headers']}
    headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as response:
            content = response.read(65536)
            if 'application/json' not in response.headers.get('Content-Type',''):
                raise ValueError('网站未确认接收，请重新复制连接配置。')
            result = json.loads(content)
            if result.get('ok') is not True or (expected_days is not None and result.get('days') != expected_days):
                raise ValueError('网站尚未确认保存，将保留本机数据并重试。')
    except urllib.error.HTTPError as e:
        if e.code in (401,403):
            raise ValueError('网站连接已失效或暂停，请在观己重新生成配置并粘贴到此处。') from None
        raise ValueError('网站暂未接收（HTTP %s），数据已在 Mac 保存，稍后自动重试。' % e.code) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ValueError('网站暂时无法连接，数据已在 Mac 保存，稍后自动重试。') from None


class Bridge:
    def __init__(self, db, config=None):
        self.db, self.lock = db, threading.RLock()
        db.executescript(puls.SCHEMA + META)
        self.config = config or {'phoneToken':secrets.token_hex(32), 'userID':str(uuid.uuid4())}
        self.admin = secrets.token_urlsafe(32)
        self.wake, self.stop = threading.Event(), threading.Event()
        self.cloud_error, self.saved = None, bool(config)
        self.cloud_generation = 0
        self.wake.set()  # Recompute after every restart, even if the last process crashed.

    def get(self, key):
        row = self.db.execute('SELECT value FROM bridge_state WHERE key=?',(key,)).fetchone()
        return row[0] if row else None

    def set(self, key, value):
        self.db.execute('INSERT INTO bridge_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,str(value)))

    def configure(self, data, remember):
        cloud = validate_cloud(data)
        with self.lock:
            config = {**self.config, 'cloud':cloud}
            self.config = config
            self.cloud_generation += 1
            # Retain dates so an empty day can still clear an older cloud view.
            with self.db:
                self.db.execute("UPDATE bridge_forwarded SET digest=''")
            self.cloud_error = None
            self.wake.set()
        if remember:
            keychain('write', config)
            self.saved = True
        else:
            self.saved = False

    def status(self):
        with self.lock:
            return {'configured':bool(self.config.get('cloud')), 'remembered':self.saved,
                    'lastReceived':self.get('last_received'), 'lastForwarded':self.get('last_forwarded'),
                    'version':2, 'pendingDays':len(self.pending()),
                    'lastAttempt':self.get('last_attempt'),
                    'error':self.cloud_error, 'samples':self.db.execute('SELECT count(*) FROM samples').fetchone()[0],
                    'aggregates':self.db.execute('SELECT count(*) FROM aggregates').fetchone()[0],
                    'days':self.db.execute('SELECT count(*) FROM bridge_forwarded WHERE digest<>\'\'').fetchone()[0],
                    'localURL':local_url(), 'userID':self.config['userID']}

    def pending(self):
        # Caller holds the receiver lock so a phone commit cannot split the view.
        view = project(self.db, self.config['userID'])
        fitness = project_fitness(self.db, self.config['userID'])
        old = dict(self.db.execute('SELECT date,digest FROM bridge_forwarded'))
        changed = []
        for date in sorted(set(view) | set(old) | set(fitness)):
            health = view.get(date,{})
            payload = {'health':health,'fitness':fitness.get(date,{'rings':None,'workouts':[]})}
            digest = hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            if old.get(date) != digest:
                changed.append((date,payload,digest))
        return changed

    def report(self, sender=post_status):
        with self.lock:
            config = self.config.get('cloud')
            if not config:
                return
            status = {'version':2, 'pendingDays':len(self.pending()),
                      'lastReceived':self.get('last_received'), 'lastForwarded':self.get('last_forwarded'),
                      'lastAttempt':self.get('last_attempt'),
                      'errorCode':'upload_failed' if self.cloud_error else None}
        sender(config, status)

    def forward_once(self, sender=post_cloud):
        with self.lock:
            config, generation = self.config.get('cloud'), self.cloud_generation
            if not config:
                return
            changed = self.pending()
            if changed:
                with self.db:
                    self.set('last_attempt',puls.now())
        # Keep the private Site transaction below 50 database operations.
        for start in range(0,len(changed),2):
            chunk = changed[start:start+2]
            sender(config,[{'date':d,**payload} for d,payload,_ in chunk])
            with self.lock, self.db:
                # A re-pair while an older request is in flight must not mark
                # the new receiver's view as delivered.
                if generation != self.cloud_generation:
                    return
                self.db.executemany('INSERT INTO bridge_forwarded VALUES (?,?) ON CONFLICT(date) DO UPDATE SET digest=excluded.digest',[(d,sha) for d,_,sha in chunk])
                self.set('last_forwarded',puls.now())
        with self.lock:
            if generation == self.cloud_generation:
                self.cloud_error = None

    def worker(self):
        while not self.stop.is_set():
            self.wake.wait(30)
            self.wake.clear()
            if self.stop.wait(2):
                break  # Short debounce for the phone's parallel uploads.
            try:
                self.forward_once()
            except Exception as e:
                # No wire response, payload, URL query or credential is logged.
                self.cloud_error = str(e) if isinstance(e,ValueError) else '转发暂时未完成；本机数据已保存，30 秒后重试。'
            try:
                self.report()
            except Exception:
                pass  # A missing heartbeat is shown as unconfirmed, never as online.


def local_url():
    for interface in ('en0','en1','en2'):
        try:
            ip = subprocess.check_output(['/usr/sbin/ipconfig','getifaddr',interface],stderr=subprocess.DEVNULL,timeout=2).decode().strip()
            if ipaddress.ip_address(ip).is_private:
                return 'http://%s:%s' % (ip,PORT)
        except (OSError,subprocess.SubprocessError,ValueError):
            pass
    return 'http://%s.local:%s' % (socket.gethostname().split('.')[0],PORT)


class Handler(puls.Handler):
    protocol_version = 'HTTP/1.0'
    server_version = 'Selfspace-Mac/1'

    @property
    def bridge(self):
        return self.server.bridge

    def log_message(self,*args):
        pass  # Never write request paths, headers or health data to terminal logs.

    def send_json(self,status,obj):
        if self.path=='/v1/batches' and status==200 and any(obj.get(k,0) for k in ('accepted','deleted','aggregateSamples','activitySummaries','routePoints','seriesPoints')):
            with self.bridge.lock, self.bridge.db:
                self.bridge.set('last_received',puls.now())
            self.bridge.wake.set()
        body=json.dumps(obj,allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        self.wfile.write(body)

    def admin_request(self, post=False):
        host=self.headers.get('Host','')
        allowed={'127.0.0.1:%s'%PORT,'localhost:%s'%PORT}
        if not ipaddress.ip_address(self.client_address[0]).is_loopback or host not in allowed:
            return False
        if post:
            return (self.headers.get('Origin')=='http://'+host and
                    hmac.compare_digest(self.headers.get('X-Selfspace-Admin',''),self.bridge.admin) and
                    self.headers.get('Content-Type','').split(';')[0]=='application/json')
        return True

    def authorized(self):
        token = self.headers.get('Authorization','')
        return hmac.compare_digest(token, 'Bearer '+self.bridge.config['phoneToken'])

    def do_GET(self):
        if self.path=='/healthz':
            return self.send_json(200,{'ok':True,'receiver':'selfspace-mac-v1','version':2})
        if self.path.startswith('/v1/') and self.authorized() and self.headers.get('X-User-ID','').lower()!=self.bridge.config['userID']:
            return self.send_json(403,{'error':'user mismatch'})
        if self.path in ('/','/admin/status','/admin/pair','/admin/qr'):
            if not self.admin_request():
                return self.send_json(403,{'error':'请在 Mac 本机打开管理页面。'})
            if self.path=='/admin/status':
                return self.send_json(200,self.bridge.status())
            if self.path in ('/admin/pair','/admin/qr'):
                # Sensitive phone credentials are returned only to the local UI.
                query=urllib.parse.urlencode({'url':local_url(),'token':self.bridge.config['phoneToken'],'user':self.bridge.config['userID']})
                payload='puls://pair?'+query
                if self.path=='/admin/pair':
                    return self.send_json(200,{'pairing':payload})
                qr=QrCode.encode_text(payload,QrCode.Ecc.MEDIUM)
                n=qr.get_size()
                points=' '.join('M%d,%dh1v1h-1z'%(x+4,y+4) for y in range(n) for x in range(n) if qr.get_module(x,y))
                svg=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d"><rect width="100%%" height="100%%" fill="white"/><path d="%s" fill="#17261b"/></svg>'%(n+8,n+8,points)).encode()
                self.send_response(200);self.send_header('Content-Type','image/svg+xml');self.send_header('Content-Length',str(len(svg)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(svg);return
            html=(ROOT/'setup.html').read_text().replace('__ADMIN_NONCE__',self.bridge.admin).replace('__SITE_URL__',SITE).encode()
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(html)))
            self.send_header('Cache-Control','no-store')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-%s'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"%self.bridge.admin)
            self.end_headers();self.wfile.write(html);return
        return super().do_GET()

    def do_POST(self):
        if self.path=='/admin/backup':
            if not self.admin_request(post=True):
                return self.send_json(403,{'error':'请从 Mac 本机管理页面下载备份。'})
            # SQLite online backup includes a consistent WAL snapshot; copying
            # the live main file alone can omit already acknowledged samples.
            with tempfile.NamedTemporaryFile(suffix='.sqlite3') as saved:
                target = sqlite3.connect(saved.name)
                try:
                    with self.bridge.lock:
                        self.bridge.db.backup(target)
                finally:
                    target.close()
                self.send_response(200)
                self.send_header('Content-Type','application/vnd.sqlite3')
                self.send_header('Content-Disposition','attachment; filename="selfspace-mac-health.sqlite3"')
                self.send_header('Content-Length',str(os.path.getsize(saved.name)))
                self.send_header('Cache-Control','no-store')
                self.send_header('X-Content-Type-Options','nosniff')
                self.end_headers()
                with open(saved.name,'rb') as source:
                    shutil.copyfileobj(source,self.wfile,65536)
            return
        if self.path=='/admin/config':
            if not self.admin_request(post=True):
                return self.send_json(403,{'error':'请从本机管理页面操作。'})
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=65536:
                    raise ValueError('配置内容过大或为空。')
                body=json.loads(self.rfile.read(n))
                self.bridge.configure(body.get('config'),body.get('remember') is True)
                return self.send_json(200,{'ok':True})
            except (ValueError,TypeError,AttributeError):
                return self.send_json(400,{'error':'配置未能完整保存。请检查复制内容，并确认已允许本机钥匙串访问；当前有效配置仍可运行。'})
        if self.path!='/v1/batches':
            return self.send_json(404,{'error':'not found'})
        if not self.authorized():
            return self.send_json(401,{'error':'unauthorized'})
        if self.headers.get('X-User-ID','').lower()!=self.bridge.config['userID']:
            return self.send_json(403,{'error':'user mismatch'})
        try:
            if self.headers.get('Transfer-Encoding'):
                return self.send_json(411,{'error':'Content-Length required'})
            n=int(self.headers.get('Content-Length','-1'))
            if n<0:
                return self.send_json(411,{'error':'Content-Length required'})
        except ValueError:
            return self.send_json(400,{'error':'invalid Content-Length'})
        # Upstream validates and commits the entire batch before acknowledging it.
        # Its lock is an RLock here so the forwarded-day state is serialized too.
        return super().do_POST()


def main():
    os.umask(0o077)
    RUNTIME.mkdir(mode=0o700,exist_ok=True)
    os.chmod(RUNTIME,0o700)
    try:
        config=keychain('read')
        if config:
            if not isinstance(config.get('phoneToken'),str) or not puls.is_uuid(config.get('userID')):
                raise ValueError('invalid saved config')
            if config.get('cloud'):
                validate_cloud(config['cloud'])
    except ValueError:
        config=None
        print('钥匙串暂未解锁，本次请在本机页面重新连接。',flush=True)
    db=sqlite3.connect(RUNTIME/'health.sqlite',check_same_thread=False)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA synchronous=FULL')
    bridge=Bridge(db,config)
    class Server(ThreadingHTTPServer):
        daemon_threads=True
        def get_request(self):
            sock,addr=super().get_request();sock.settimeout(60);return sock,addr
    server=Server(('0.0.0.0',PORT),Handler)
    server.bridge,server.db,server.lock=bridge,db,bridge.lock
    thread=threading.Thread(target=bridge.worker,daemon=True);thread.start()
    print('健康中转已启动。管理页：http://127.0.0.1:%s'%PORT,flush=True)
    print('请保持 Mac 唤醒，并让 iPhone 与 Mac 连接同一可信 Wi-Fi。关闭此窗口会停止接收。',flush=True)
    if '--no-open' not in sys.argv:
        webbrowser.open('http://127.0.0.1:%s'%PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        bridge.stop.set();bridge.wake.set();server.server_close();thread.join(timeout=3)


if __name__=='__main__':
    main()
