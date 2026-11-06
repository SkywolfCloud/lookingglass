"""Generate loopback-only nginx and PHP config for tests/compose.stage.yaml."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
runtime = root / 'tests/.runtime'
runtime.mkdir(exist_ok=True)
nginx = (root / 'docker/nginx/nginx.conf').read_text()
nginx = nginx.replace('listen 80 default_server;', 'listen 127.0.0.1:18080 default_server;')
nginx = nginx.replace('listen [::]:80 default_server;', '')
nginx = nginx.replace('localhost:9000', '127.0.0.1:9001').replace('127.0.0.1:19080', '127.0.0.1:19081')
(runtime / 'nginx.conf').write_text(nginx)
(runtime / 'php.conf').write_text('[www]\nlisten = 127.0.0.1:9001\n')
print('Stage config ready: HTTP 18080, PHP 9001, ALS 19081, iPerf3 5221–5230.')
