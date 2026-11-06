"""Test a running LG deployment: python3 tests/http_smoke.py http://127.0.0.1/

Probes public Cloudflare IPv4/IPv6 addresses using the real form and sessions.
"""
import concurrent.futures
import http.cookiejar
import re
import sys
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip('/') + '/'


def session():
    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page = client.open(base, timeout=15).read().decode()
    token = re.search(r'name="csrfToken" value="([^"]+)"', page).group(1)
    return client, token


def run(method):
    client, token = session()
    target = '2606:4700:4700::1111' if method.endswith('6') else '1.1.1.1'
    data = urllib.parse.urlencode(dict(csrfToken=token, submitForm='1',
                                      backendMethod=method, targetHost=target)).encode()
    client.open(base, data, timeout=15).read()
    response = client.open(base + 'backend.php', timeout=90)
    assert response.headers.get_content_type() == 'text/plain', method
    assert response.headers['X-Content-Type-Options'] == 'nosniff', method
    out = response.read().decode()
    assert out.strip(), method
    assert not any(s in out for s in ['<br />', '&nbsp;', '@@@', 'Fatal error',
                                     'Operation not permitted', 'Command exited']), (method, out[-500:])
    if method.startswith('ping'):
        assert '0% packet loss' in out, (method, out)
    elif method.startswith('mtr'):
        assert '\x1b[2J\x1b[H' in out and 'Loss%' in out and target in out, (method, out[-1000:])
    elif method.startswith('nexttrace'):
        assert 'IP Geo Data Provider:' in out and '\x1b[' in out and target in out, (method, out)
        assert 'could not complete' not in out, out
        codes = {int(code) for seq in re.findall(r'\x1b\[([0-9;]+)m', out) for code in seq.split(';')}
        assert {92, 93, 96} <= codes, ('missing native ASN / hop / latency colors', codes)
    else:
        assert 'traceroute to' in out and target in out, (method, out)
    assert not client.open(base + 'backend.php', timeout=15).read().strip(), 'backend token replay'
    return method + ' PASS'


for target, valid_token in [('127.0.0.1', True), ('1.1.1.1;id', True), ('1.1.1.1', False)]:
    client, token = session()
    data = urllib.parse.urlencode(dict(csrfToken=token if valid_token else 'invalid',
        submitForm='1', backendMethod='nexttrace', targetHost=target)).encode()
    client.open(base, data).read()
    page = client.open(base).read().decode()
    assert ('No valid IPv4 provided.' if valid_token else 'Missing or incorrect CSRF token.') in page
    assert not client.open(base + 'backend.php').read().strip()
print('invalid target / command-like target / CSRF rejection PASS', flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for result in pool.map(run, ['ping', 'ping6', 'traceroute', 'traceroute6',
                                 'mtr', 'mtr6', 'nexttrace', 'nexttrace6']):
        print(result, flush=True)
