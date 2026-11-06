"""Exercise the real ALS integration, with small transfer requests by default.

python3 tests/speed_smoke.py http://127.0.0.1:18080/
Add --iperf --backend-container lg-speed-backend-stage for a rate-limited local
iPerf connection. --server-test runs one complete external Speedtest.net test.
"""
import argparse
import json
import queue
import socket
import subprocess
import sys
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('base')
parser.add_argument('--iperf', action='store_true')
parser.add_argument('--backend-container', default='lg-speed-backend-stage')
parser.add_argument('--server-test', action='store_true')
args = parser.parse_args()
base = args.base.rstrip('/') + '/'


def request(path, data=None, session=None, timeout=15):
    headers = {'session': session} if session else {}
    return urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers), timeout=timeout)


class Session:
    def __init__(self):
        self.response = request('als/session')
        assert self.response.headers.get_content_type() == 'text/event-stream'
        assert self.response.headers.get('Access-Control-Allow-Origin') is None
        self.events = queue.Queue()
        self.thread = threading.Thread(target=self.listen, daemon=True)
        self.thread.start()
        self.id = self.wait('SessionId')
        self.config = json.loads(self.wait('Config'))

    def listen(self):
        event, data = '', []
        try:
            while True:
                line = self.response.readline()
                if not line:
                    return
                line = line.decode('utf-8', 'replace').rstrip('\r\n')
                if not line:
                    if event:
                        self.events.put((event, '\n'.join(data)))
                    event, data = '', []
                elif line.startswith('event:'):
                    event = line[6:].lstrip()
                elif line.startswith('data:'):
                    data.append(line[5:].lstrip())
        except (OSError, ValueError, AttributeError):
            return

    def wait(self, name, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            event, data = self.events.get(timeout=max(.1, deadline - time.monotonic()))
            if event == name:
                return data
        raise AssertionError('Missing SSE event: ' + name)

    def close(self):
        try:
            self.response.fp.raw._sock.shutdown(socket.SHUT_RDWR)
        except (OSError, AttributeError):
            pass
        self.response.close()
        self.thread.join(timeout=3)


def background(path, session):
    result = []
    def run():
        try:
            with request(path, session=session, timeout=90) as response:
                result.append(json.load(response))
        except Exception as error:
            result.append(error)
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread, result


session = Session()
try:
    assert all(session.config.get(key) for key in ['feature_librespeed', 'feature_filespeedtest', 'feature_speedtest_dot_net', 'feature_iperf3', 'feature_iface_traffic'])
    assert not session.config['feature_shell'] and not session.config['feature_ping']
    print('session, capabilities and restricted tool configuration PASS', flush=True)
    prefix = 'als/session/' + session.id + '/speedtest/'
    with request('als/ping') as response:
        assert response.status == 200 and response.read() == b''
        assert 'no-store' in response.headers['Cache-Control']
    with request('als/speedtest_worker.js') as response:
        assert 'javascript' in response.headers.get_content_type()
        assert b'LibreSpeed' in response.read(1000)
    with request(prefix + 'download?ckSize=1') as response:
        assert not response.headers.get('Content-Encoding')
        assert 'no-store' in response.headers['Cache-Control']
        data = response.read()
        assert len(data) == 1048576 and len(set(data[:1024])) > 64
    with request(prefix + 'upload', data=b'x' * 65536) as response:
        assert response.status == 200
        response.read()
    with request(prefix + 'file/1MB.test') as response:
        assert int(response.headers['Content-Length']) == 1048576
        assert len(response.read()) == 1048576
    for path in [prefix + 'file/2MB.test', 'als/method/ping', 'als/session/' + session.id + '/shell', 'als/assets/anything']:
        try:
            request(path)
            raise AssertionError('Unexpected public route: ' + path)
        except urllib.error.HTTPError as error:
            assert error.code == 404, (path, error.code)
    try:
        request('als/method/iperf3/server')
        raise AssertionError('Unauthenticated utility request accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 400
    print('worker, ping, download, upload, generated files and route boundaries PASS', flush=True)
    first = session.wait('InterfaceTraffic').split(',')
    second = session.wait('InterfaceTraffic').split(',')
    while second[0] != first[0] or int(second[1]) <= int(first[1]):
        second = session.wait('InterfaceTraffic').split(',')
    assert int(second[2]) >= int(first[2]) and int(second[3]) >= int(first[3])
    print('timestamped live interface counters PASS', flush=True)

    if args.server_test:
        thread, result = background('als/method/speedtest_dot_net', session.id)
        messages, pending = [], ''
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline and thread.is_alive():
            try:
                name, chunk = session.events.get(timeout=.5)
            except queue.Empty:
                continue
            if name != 'SpeedtestStream':
                continue
            if not pending:
                try:
                    messages.append(json.loads(chunk))
                    continue
                except json.JSONDecodeError:
                    pass
            pending += chunk
            lines = pending.split('\n')
            pending = lines.pop()
            for line in lines:
                if line.strip():
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        print('CLI:', line[:180], flush=True)
        thread.join(timeout=3)
        # The command HTTP response and final SSE event can arrive in either order.
        while True:
            try:
                name, chunk = session.events.get(timeout=.5)
            except queue.Empty:
                break
            if name == 'SpeedtestStream':
                pending += chunk
        for line in pending.split('\n'):
            try:
                messages.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        finals = [message for message in messages if message.get('type') == 'result']
        assert finals, ('No Ookla result', messages[-8:], result)
        final = finals[-1]
        assert final['download']['bandwidth'] > 0 and final['upload']['bandwidth'] > 0
        print('external Speedtest.net download/upload/result PASS', flush=True)

    if args.iperf:
        subprocess.run([sys.executable, str(Path(__file__).with_name('iperf_lifecycle.py')), base, '--backend-container', args.backend_container], check=True)

finally:
    session.close()

with request('') as response:
    assert response.status == 200 and b'id="speed-suite"' in response.read()
print('LG page remains available PASS', flush=True)
