"""Test detached iPerf3 lifetime and stop/refresh ownership through the real API.

Use --full-lifetime to verify the complete sixty-second lease without page SSE.
The transfer itself is limited to 5 Mbps for one second.
"""
import argparse
import http.cookiejar
import json
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request

p = argparse.ArgumentParser()
p.add_argument('base')
p.add_argument('--backend-container', default='lg-speed-backend-stage')
p.add_argument('--full-lifetime', action='store_true')
args = p.parse_args()
base = args.base.rstrip('/') + '/'
cookies = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))

def page():
    html = client.open(base, timeout=10).read().decode()
    return re.search(r'data-iperf-csrf="([a-f0-9]+)"', html).group(1)

csrf = page()

def api(action=None, token=None):
    headers = {}
    body = None
    if action:
        headers = {'Content-Type': 'application/json', 'X-CSRF-Token': csrf if token is None else token}
        body = json.dumps({'action': action}).encode()
    return json.load(client.open(urllib.request.Request(base + 'iperf.php', data=body, headers=headers), timeout=10))

def until(predicate, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = api()
        if predicate(job): return job
        assert job['status'] != 'error', job
        time.sleep(.2)
    raise AssertionError(('iPerf state did not converge', api()))

ui_stream = urllib.request.urlopen(base + 'als/session', timeout=5)
for _ in range(5):
    if ui_stream.readline().startswith(b'data:'): break
started = time.monotonic()
api('start')
try:
    job = until(lambda value: value['status'] == 'running' and value['port'] > 0)
    port = job['port']
    ui_stream.close()
    time.sleep(4)
    assert api()['status'] == 'running', 'iPerf stopped after the page event stream disconnected'
    assert page() == csrf, 'iPerf CSRF token changed during refresh'
    assert api()['id'] == job['id'], 'Refresh did not recover the running job'
    try:
        api('stop', token='invalid')
        raise AssertionError('Invalid CSRF token accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 403
    # Wait for the listener log, not just the early port announcement.
    until(lambda value: 'Server listening' in value.get('log', ''))
    result = subprocess.run(['docker', 'exec', args.backend_container, 'iperf3', '-c', '127.0.0.1', '-p', str(port), '-t', '1', '-b', '5M', '-J'], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert json.loads(result.stdout)['end']['sum_received']['bytes'] > 0
    print('page disconnect, refresh recovery, CSRF and rate-limited transfer PASS', flush=True)
    if args.full_lifetime:
        while time.monotonic() - started < 55:
            assert api()['status'] == 'running', api()
            print('server still running at', round(time.monotonic() - started), 'seconds', flush=True)
            time.sleep(min(15, 55 - (time.monotonic() - started)))
        job = until(lambda value: value['status'] == 'stopped', timeout=15)
        elapsed = time.monotonic() - started
        assert 58 <= elapsed <= 70, (elapsed, job)
        print('full server-owned sixty-second expiry PASS', round(elapsed, 1), flush=True)
    else:
        api('stop')
        until(lambda value: value['status'] == 'stopped', timeout=5)
        print('explicit stop PASS', flush=True)
    with socket.socket() as probe:
        probe.settimeout(1)
        assert probe.connect_ex(('127.0.0.1', port)) != 0, 'iPerf port remains open'
    print('port cleanup PASS', flush=True)
finally:
    ui_stream.close()
    if api()['status'] in ['starting', 'running']: api('stop')
