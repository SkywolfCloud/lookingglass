<?php declare(strict_types=1); ?>
<section id="speed-suite" aria-label="Speed tests">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <p class="text-muted mb-0">Measure your connection to this node, or test the node's own network.</p>
        <span class="badge text-bg-secondary" id="speed-connection" role="status">Connecting…</span>
    </div>
    <ul class="nav nav-tabs mb-4" id="speed-tabs" role="tablist">
        <?php foreach (['browser' => 'Browser test', 'files' => 'Test files', 'server' => 'Server test', 'iperf' => 'iPerf3'] as $id => $label): ?>
        <li class="nav-item" role="presentation">
            <button class="nav-link<?= $id === 'browser' ? ' active' : '' ?>" id="speed-tab-<?= $id ?>" data-bs-toggle="tab" data-bs-target="#speed-<?= $id ?>" type="button" role="tab" aria-controls="speed-<?= $id ?>" aria-selected="<?= $id === 'browser' ? 'true' : 'false' ?>"><?= $label ?></button>
        </li>
        <?php endforeach ?>
    </ul>
    <div class="tab-content">
        <div class="tab-pane fade show active" id="speed-browser" role="tabpanel" aria-labelledby="speed-tab-browser">
            <p class="text-muted">Your browser ↔ this Looking Glass node. Results depend on your current connection.</p>
            <div class="row g-3 mb-3">
                <?php foreach (['download' => ['Download', 'Mbps'], 'upload' => ['Upload', 'Mbps'], 'ping' => ['Latency', 'ms'], 'jitter' => ['Jitter', 'ms']] as $id => [$label, $unit]): ?>
                <div class="col-6 col-lg-3"><div class="speed-metric border rounded p-3">
                    <div class="text-muted small"><?= $label ?></div>
                    <div><strong class="fs-3" id="browser-<?= $id ?>">—</strong> <span class="text-muted small"><?= $unit ?></span></div>
                </div></div>
                <?php endforeach ?>
            </div>
            <div class="d-flex gap-4 small text-muted mb-2"><span><span class="speed-dot speed-rx"></span> Download</span><span><span class="speed-dot speed-tx"></span> Upload</span></div>
            <svg id="browser-chart" class="speed-chart border rounded mb-3" viewBox="0 0 600 110" role="img" aria-label="Browser download and upload speed history"></svg>
            <div class="d-flex flex-wrap align-items-center gap-3">
                <button class="btn btn-primary" id="browser-start" type="button" disabled>Start browser test</button>
                <button class="btn btn-outline-danger" id="browser-stop" type="button" hidden>Stop</button>
                <span id="browser-status" class="text-muted" role="status">Ready when connected.</span>
            </div>
            <div class="progress mt-3" role="progressbar" aria-label="Browser test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="browser-progress"><div class="progress-bar" style="width:0%"></div></div>
        </div>
        <div class="tab-pane fade" id="speed-files" role="tabpanel" aria-labelledby="speed-tab-files">
            <p class="text-muted">Download generated test data from this node. Choose a file size to test a longer transfer.</p>
            <div id="speed-file-links" class="d-flex flex-wrap gap-2 mb-3"></div>
            <label for="speed-file-address" class="form-label small text-muted">Connection</label>
            <select id="speed-file-address" class="form-select speed-address"><option value="current">Current address</option></select>
            <p id="files-status" class="small text-muted mt-2">Waiting for the test service.</p>
        </div>
        <div class="tab-pane fade" id="speed-server" role="tabpanel" aria-labelledby="speed-tab-server">
            <p class="text-muted">This Looking Glass node ↔ an external Speedtest.net server. This does not measure your browser's connection.</p>
            <form id="server-test-form" class="d-flex flex-wrap gap-2 mb-3">
                <input class="form-control speed-server-id" id="speed-server-id" aria-label="Speedtest.net server ID" inputmode="numeric" pattern="[0-9]{1,8}" placeholder="Server ID (optional)">
                <button class="btn btn-primary" id="server-start" type="submit" disabled>Start server test</button>
                <button class="btn btn-outline-danger" id="server-stop" type="button" hidden>Stop</button>
            </form>
            <div class="row g-3 mb-3">
                <?php foreach (['download' => ['Download', 'Mbps'], 'upload' => ['Upload', 'Mbps'], 'ping' => ['Latency', 'ms']] as $id => [$label, $unit]): ?>
                <div class="col-6 col-lg-4"><div class="speed-metric border rounded p-3"><div class="text-muted small"><?= $label ?></div><strong class="fs-3" id="server-<?= $id ?>">—</strong> <span class="text-muted small"><?= $unit ?></span></div></div>
                <?php endforeach ?>
            </div>
            <p id="server-node" class="small text-muted"></p>
            <p id="server-status" role="status" class="text-muted">A nearby test server will be selected automatically.</p>
            <div class="progress mb-3" role="progressbar" aria-label="Server test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="server-progress"><div class="progress-bar" style="width:0%"></div></div>
            <a id="server-result" class="btn btn-outline-success" target="_blank" rel="noopener noreferrer" hidden>View Speedtest.net result</a>
        </div>
        <div class="tab-pane fade" id="speed-iperf" role="tabpanel" aria-labelledby="speed-tab-iperf">
            <p class="text-muted">Start an iPerf3 server, then run one of the commands below on your own device. It stops automatically after 60 seconds.</p>
            <div class="d-flex flex-wrap gap-3 align-items-center mb-3">
                <button class="btn btn-primary" id="iperf-start" type="button" disabled>Start iPerf3 server</button>
                <button class="btn btn-outline-danger" id="iperf-stop" type="button" hidden>Stop server</button>
                <span id="iperf-status" role="status" class="text-muted">Not running.</span>
            </div>
            <div id="iperf-commands" class="mb-3"></div>
            <div id="iperf-output" class="lg-terminal" hidden aria-label="iPerf3 server output, read-only"></div>
        </div>
    </div>
    <div class="border-top pt-4 mt-4" id="traffic-panel">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 class="fs-6 mb-0">Live interface traffic</h2>
            <select class="form-select form-select-sm speed-interface" id="traffic-interface" aria-label="Network interface"></select>
        </div>
        <div class="d-flex flex-wrap gap-4 mb-2 small"><span><span class="speed-dot speed-rx"></span> Receive <strong id="traffic-rx">—</strong></span><span><span class="speed-dot speed-tx"></span> Transmit <strong id="traffic-tx">—</strong></span></div>
        <svg id="traffic-chart" class="speed-chart border rounded" viewBox="0 0 600 110" role="img" aria-label="Network interface receive and transmit traffic history"></svg>
        <p class="small text-muted mt-2 mb-0">Total node traffic, including other services. <a href="https://github.com/wikihost-opensource/als" target="_blank" rel="noopener noreferrer">ALS</a> · <a href="https://github.com/librespeed/speedtest" target="_blank" rel="noopener noreferrer">LibreSpeed</a></p>
    </div>
</section>
