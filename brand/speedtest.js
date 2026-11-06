(() => {
    const root = document.getElementById('speed-suite');
    if (!root) return;
    const el = id => document.getElementById(id);
    const base = new URL('./', location.href);
    const url = path => new URL(path, base).href;
    const text = (id, value) => { el(id).textContent = String(value); };
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const metric = (id, value) => text(id, number(value).toFixed(2));
    const progress = (id, value) => {
        const percent = Math.max(0, Math.min(100, number(value)));
        el(id).setAttribute('aria-valuenow', Math.round(percent));
        el(id).firstElementChild.style.width = percent + '%';
    };
    const svgNode = (tag, attrs) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    };
    const graph = (id, pairs) => {
        const svg = el(id);
        const max = Math.max(0.01, ...pairs.flat());
        const lines = [0, 1].map(index => svgNode('polyline', {
            class: index === 0 ? 'speed-rx-line' : 'speed-tx-line',
            points: pairs.map((pair, i) => `${40 + i / Math.max(1, pairs.length - 1) * 550},${98 - pair[index] / max * 76}`).join(' ')
        }));
        const label = svgNode('text', {x: 8, y: 15});
        label.textContent = max.toFixed(max < 1 ? 3 : 1) + ' Mbps';
        svg.replaceChildren(label, ...lines);
    };

    let sessionId = '';
    let config = null;
    let active = null;
    let worker = null;
    let workerTimer;
    let browserDeadline;
    let browserPoints = [];
    let serverController;
    let serverBuffer = '';
    let serverDone = false;
    let serverError = '';
    let iperfController;
    let iperfTimer;
    let iperfPort = 0;
    let iperfTerminal;
    let iperfFit;
    let iperfResize;
    const interfaces = new Map();
    const source = new EventSource(url('als/session'));

    function refreshButtons() {
        const ready = Boolean(sessionId && config);
        el('browser-start').disabled = !ready || active !== null || !config.feature_librespeed;
        el('server-start').disabled = !ready || active !== null || !config.feature_speedtest_dot_net;
        el('iperf-start').disabled = !ready || active !== null || !config.feature_iperf3;
        el('speed-server-id').disabled = active === 'server';
        ['browser', 'server', 'iperf'].forEach(name => { el(name + '-stop').hidden = active !== name; });
        root.querySelectorAll('#speed-file-links a').forEach(link => {
            link.classList.toggle('disabled', !ready || active !== null);
            link.setAttribute('aria-disabled', String(!ready || active !== null));
        });
    }

    function makeFiles() {
        const parent = el('speed-file-links');
        parent.replaceChildren();
        const address = el('speed-file-address').value;
        const origin = address === 'current' ? location.origin : address;
        for (const size of config?.speedtest_files ?? []) {
            if (!/^\d+(KB|MB|GB|TB)$/.test(size)) continue;
            const link = document.createElement('a');
            link.className = 'btn btn-outline-primary';
            link.textContent = size;
            link.href = new URL(`als/session/${sessionId}/speedtest/file/${size}.test`, origin + base.pathname).href;
            link.download = size + '.test';
            parent.append(link);
        }
        text('files-status', config?.feature_filespeedtest ? 'Keep this page open while downloading.' : 'File tests are disabled.');
        refreshButtons();
    }

    source.addEventListener('SessionId', event => {
        sessionId = /^[a-f0-9-]{36}$/i.test(event.data) ? event.data : '';
        config = null;
        refreshButtons();
    });
    source.addEventListener('Config', event => {
        try { config = JSON.parse(event.data); } catch { return; }
        el('speed-connection').className = 'badge text-bg-success';
        text('speed-connection', 'Connected');
        const select = el('speed-file-address');
        select.replaceChildren(new Option('Current address', 'current'));
        const port = location.port ? ':' + location.port : '';
        if (location.protocol === 'http:') {
            if (/^(\d{1,3}\.){3}\d{1,3}$/.test(config.public_ipv4)) select.add(new Option('IPv4 · ' + config.public_ipv4, 'http://' + config.public_ipv4 + port));
            if (/^[0-9a-f:]+$/i.test(config.public_ipv6) && config.public_ipv6.includes(':')) select.add(new Option('IPv6 · ' + config.public_ipv6, 'http://[' + config.public_ipv6 + ']' + port));
        }
        el('traffic-panel').hidden = !config.feature_iface_traffic;
        makeFiles();
        text('browser-status', config.feature_librespeed ? 'Ready.' : 'Browser tests are disabled.');
    });
    el('speed-file-address').addEventListener('change', makeFiles);
    source.onerror = () => {
        sessionId = '';
        config = null;
        stopBrowser('Connection lost. Please retry when reconnected.');
        serverController?.abort();
        iperfController?.abort();
        el('speed-connection').className = 'badge text-bg-secondary';
        text('speed-connection', 'Reconnecting…');
        refreshButtons();
    };

    function traffic(name, timestamp, rx, tx) {
        timestamp = number(timestamp); rx = number(rx); tx = number(tx);
        let entry = interfaces.get(name);
        if (!entry) {
            entry = {timestamp, rx, tx, pairs: [], rate: [0, 0]};
            interfaces.set(name, entry);
            el('traffic-interface').add(new Option(name, name));
        } else if (timestamp > entry.timestamp) {
            const seconds = timestamp - entry.timestamp;
            entry.rate = [Math.max(0, rx - entry.rx) * 8 / seconds / 1e6, Math.max(0, tx - entry.tx) * 8 / seconds / 1e6];
            entry.pairs.push(entry.rate);
            entry.pairs = entry.pairs.slice(-30);
            Object.assign(entry, {timestamp, rx, tx});
        }
        showTraffic();
    }
    function showTraffic() {
        const entry = interfaces.get(el('traffic-interface').value);
        if (!entry) return;
        text('traffic-rx', entry.rate[0].toFixed(2) + ' Mbps');
        text('traffic-tx', entry.rate[1].toFixed(2) + ' Mbps');
        graph('traffic-chart', entry.pairs);
    }
    source.addEventListener('InterfaceCache', event => {
        try {
            for (const entry of Object.values(JSON.parse(event.data))) {
                for (const point of entry.Caches ?? []) traffic(entry.InterfaceName, ...point);
            }
        } catch { /* A reconnect supplies a fresh snapshot. */ }
    });
    source.addEventListener('InterfaceTraffic', event => {
        const parts = event.data.split(',');
        if (parts.length === 4) traffic(...parts);
    });
    el('traffic-interface').addEventListener('change', showTraffic);

    function stopBrowser(message = 'Stopped.') {
        if (!worker) return;
        worker.postMessage('abort');
        worker.terminate();
        worker = null;
        clearInterval(workerTimer);
        clearTimeout(browserDeadline);
        active = null;
        text('browser-status', message);
        refreshButtons();
    }
    el('browser-stop').addEventListener('click', () => stopBrowser());
    el('browser-start').addEventListener('click', () => {
        if (active || !sessionId || !config) return;
        active = 'browser';
        browserPoints = [];
        ['download', 'upload', 'ping', 'jitter'].forEach(key => text('browser-' + key, '—'));
        progress('browser-progress', 0);
        refreshButtons();
        try {
            worker = new Worker(url('als/speedtest_worker.js'));
            browserDeadline = setTimeout(() => stopBrowser('Test timed out. Please retry.'), 60000);
            worker.onerror = () => stopBrowser('Unable to run the browser test. Please retry.');
            worker.onmessage = event => {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                const state = number(data.testState);
                if (data.dlStatus) metric('browser-download', data.dlStatus);
                if (data.ulStatus) metric('browser-upload', data.ulStatus);
                if (data.pingStatus) metric('browser-ping', data.pingStatus);
                if (data.jitterStatus) metric('browser-jitter', data.jitterStatus);
                browserPoints.push([state === 1 ? number(data.dlStatus) : 0, state === 3 ? number(data.ulStatus) : 0]);
                graph('browser-chart', browserPoints.slice(-120));
                if (state === 2) { text('browser-status', 'Measuring latency and jitter…'); progress('browser-progress', number(data.pingProgress) * 10); }
                if (state === 1) { text('browser-status', 'Measuring download…'); progress('browser-progress', 10 + number(data.dlProgress) * 45); }
                if (state === 3) { text('browser-status', 'Measuring upload…'); progress('browser-progress', 55 + number(data.ulProgress) * 45); }
                if (state >= 4) {
                    progress('browser-progress', state === 4 ? 100 : 0);
                    stopBrowser(state === 4 && number(data.dlStatus) > 0 && number(data.ulStatus) > 0 ? 'Completed.' : 'Test ended without complete transfer results.');
                }
            };
            const endpoint = `als/session/${sessionId}/speedtest/`;
            worker.postMessage('start ' + JSON.stringify({
                test_order: 'P_D_U', url_dl: url(endpoint + 'download'), url_ul: url(endpoint + 'upload'), url_ping: url('als/ping'),
                time_dl_max: 10, time_ul_max: 10, count_ping: 10,
                xhr_dlMultistream: 4, xhr_ulMultistream: 3, xhr_ul_blob_megabytes: 4, garbagePhp_chunkSize: 16,
                telemetry_level: 0, getIp_ispInfo: false
            }));
            workerTimer = setInterval(() => worker?.postMessage('status'), 200);
        } catch { worker?.terminate(); worker = null; clearTimeout(browserDeadline); active = null; text('browser-status', 'Unable to start the browser test.'); refreshButtons(); }
    });

    function serverEvent(data) {
        switch (data.type) {
            case 'queue': text('server-status', `Queued: ${number(data.pos)} of ${number(data.totalPos)}.`); break;
            case 'testStart': text('server-node', `${data.server?.name ?? ''} · ${data.server?.location ?? ''}, ${data.server?.country ?? ''} · ID ${data.server?.id ?? ''}`); text('server-status', 'Measuring server latency…'); break;
            case 'ping': metric('server-ping', data.ping?.latency); break;
            case 'download': metric('server-download', number(data.download?.bandwidth) * 8 / 1e6); progress('server-progress', number(data.download?.progress) * 50); text('server-status', 'Measuring server download…'); break;
            case 'upload': metric('server-upload', number(data.upload?.bandwidth) * 8 / 1e6); progress('server-progress', 50 + number(data.upload?.progress) * 50); text('server-status', 'Measuring server upload…'); break;
            case 'result': {
                serverDone = true;
                metric('server-download', number(data.download?.bandwidth) * 8 / 1e6);
                metric('server-upload', number(data.upload?.bandwidth) * 8 / 1e6);
                metric('server-ping', data.ping?.latency);
                progress('server-progress', 100);
                text('server-status', 'Completed.');
                try {
                    const result = new URL(data.result?.url);
                    if (result.protocol === 'https:' && (result.hostname === 'speedtest.net' || result.hostname.endsWith('.speedtest.net'))) {
                        el('server-result').href = result.href;
                        el('server-result').hidden = false;
                    }
                } catch { /* A valid result need not have a share URL. */ }
                break;
            }
            case 'error': serverError = String(data.message ?? data.error ?? 'The external test server could not be reached.'); text('server-status', serverError); break;
        }
    }
    function serverChunk(chunk) {
        if (!serverBuffer) {
            try { serverEvent(JSON.parse(chunk)); return; } catch { /* JSONL can cross SSE messages. */ }
        }
        serverBuffer += chunk;
        const lines = serverBuffer.split(/\r?\n/);
        serverBuffer = lines.pop();
        for (const line of lines) {
            if (!line.trim()) continue;
            try { serverEvent(JSON.parse(line)); }
            catch {
                if (/error|fatal|failed|unable|unavailable/i.test(line)) {
                    serverError = line.slice(0, 240); text('server-status', serverError);
                }
            }
        }
    }
    source.addEventListener('SpeedtestStream', event => { if (active === 'server') serverChunk(event.data); });
    el('server-stop').addEventListener('click', () => serverController?.abort());
    el('server-test-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (active || !sessionId || !config) return;
        const id = el('speed-server-id').value.trim();
        if (id && !/^\d{1,8}$/.test(id)) { text('server-status', 'Enter a numeric server ID, or leave it blank.'); return; }
        active = 'server'; serverDone = false; serverError = ''; serverBuffer = '';
        serverController = new AbortController();
        const timer = setTimeout(() => serverController.abort(), 90000);
        el('server-result').hidden = true;
        ['download', 'upload', 'ping'].forEach(key => text('server-' + key, '—'));
        text('server-node', ''); text('server-status', 'Selecting a test server…'); progress('server-progress', 0); refreshButtons();
        try {
            const endpoint = new URL(url('als/method/speedtest_dot_net'));
            if (id) endpoint.searchParams.set('node_id', id);
            const response = await fetch(endpoint, {headers: {session: sessionId}, signal: serverController.signal});
            if (!response.ok || !(await response.json()).success) throw new Error('request');
            if (serverBuffer.trim()) serverChunk('\n');
            if (!serverDone) text('server-status', serverError || 'The external test did not return a complete result. Please retry.');
        } catch (error) { text('server-status', error.name === 'AbortError' ? 'Stopped.' : 'Unable to run the server test. Please retry.'); }
        finally { clearTimeout(timer); active = null; serverController = null; refreshButtons(); }
    });

    async function copyCommand(value, button) {
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
            else {
                const input = document.createElement('textarea'); input.value = value;
                input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
                const copied = document.execCommand('copy'); input.remove();
                if (!copied) throw new Error('copy');
            }
            button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy'; }, 1500);
        } catch { button.textContent = 'Select text to copy'; }
    }
    function iperfCommands(port) {
        const parent = el('iperf-commands'); parent.replaceChildren();
        for (const [family, host] of [[4, config?.public_ipv4], [6, config?.public_ipv6]]) {
            if (!host || !/^[0-9a-f:.]+$/i.test(host)) continue;
            for (const reverse of [false, true]) {
                const value = `iperf3 -${family} -c ${host} -p ${port} -t 10${reverse ? ' -R' : ''}`;
                const label = document.createElement('div'); label.className = 'small text-muted mt-2'; label.textContent = `IPv${family} · ${reverse ? 'download to your device' : 'upload from your device'}`;
                const row = document.createElement('div'); row.className = 'speed-command';
                const code = document.createElement('code'); code.textContent = value;
                const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm btn-outline-secondary'; button.textContent = 'Copy'; button.addEventListener('click', () => copyCommand(value, button));
                row.append(code, button); parent.append(label, row);
            }
        }
    }
    source.addEventListener('Iperf3', event => {
        if (active !== 'iperf') return;
        iperfPort = Number(event.data);
        if (!Number.isInteger(iperfPort) || iperfPort < 1024 || iperfPort > 65535) return;
        iperfCommands(iperfPort);
        let seconds = 60;
        text('iperf-status', `Port ${iperfPort} · ${seconds}s remaining`);
        clearInterval(iperfTimer);
        iperfTimer = setInterval(() => text('iperf-status', `Port ${iperfPort} · ${Math.max(0, --seconds)}s remaining`), 1000);
    });
    source.addEventListener('Iperf3Stream', event => {
        if (active !== 'iperf') return;
        if (iperfTerminal) iperfTerminal.write(event.data);
        else el('iperf-output').textContent += event.data;
    });
    el('iperf-stop').addEventListener('click', () => iperfController?.abort());
    el('speed-tab-iperf').addEventListener('shown.bs.tab', () => iperfFit?.fit());
    el('iperf-start').addEventListener('click', async () => {
        if (active || !sessionId || !config) return;
        active = 'iperf'; iperfPort = 0; iperfController = new AbortController(); refreshButtons();
        el('iperf-commands').replaceChildren(); text('iperf-status', 'Starting server…');
        const host = el('iperf-output'); host.hidden = false;
        if (typeof Terminal !== 'undefined' && typeof FitAddon !== 'undefined') {
            if (!iperfTerminal) {
                iperfTerminal = new Terminal({disableStdin: true, convertEol: true, cursorInactiveStyle: 'none', fontSize: 14, theme: {background: '#0d1117', foreground: '#d0d0d0', cursor: '#0d1117'}});
                iperfFit = new FitAddon.FitAddon(); iperfTerminal.loadAddon(iperfFit); iperfTerminal.open(host);
                iperfResize = new ResizeObserver(() => { if (host.clientWidth > 0) iperfFit.fit(); }); iperfResize.observe(host);
            }
            iperfTerminal.reset(); iperfFit.fit();
        } else host.textContent = '';
        const timeout = setTimeout(() => iperfController?.abort(), 70000);
        try {
            const response = await fetch(url('als/method/iperf3/server'), {headers: {session: sessionId}, signal: iperfController.signal});
            if (!response.ok || !(await response.json()).success) throw new Error('request');
            text('iperf-status', 'Server stopped.');
        } catch (error) { text('iperf-status', error.name === 'AbortError' ? 'Server stopped.' : 'Unable to start iPerf3. Please retry.'); }
        finally { clearTimeout(timeout); clearInterval(iperfTimer); active = null; iperfController = null; refreshButtons(); }
    });
    window.addEventListener('beforeunload', () => {
        source.close(); worker?.terminate(); serverController?.abort(); iperfController?.abort();
        clearInterval(workerTimer); clearTimeout(browserDeadline); clearInterval(iperfTimer); iperfResize?.disconnect(); iperfTerminal?.dispose();
    }, {once: true});
    refreshButtons();
    graph('browser-chart', []); graph('traffic-chart', []);
})();
