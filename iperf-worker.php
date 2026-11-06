<?php declare(strict_types=1);
// This CLI worker owns the ALS control connections independently of browser requests.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/iperf-manager.php';
$id = $argv[1] ?? '';
$job = iperfReadJob($id);
if (!$job) { exit(1); }
$stopFile = iperfJobPath($id).'.stop';
$sessionStream = null;
$control = null;
$deadline = microtime(true) + 70;
$reason = 'Server stopped.';

try {
    if (is_file($stopFile)) { $reason = 'Server stopped.'; }
    else {
        $port = filter_var(getenv('SPEED_BACKEND_PORT') ?: '19080', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
        if (!$port) { throw new RuntimeException('Invalid speed backend port.'); }
        $sessionStream = stream_socket_client('tcp://127.0.0.1:'.$port, $errno, $error, 5);
        if (!$sessionStream) { throw new RuntimeException('Speed backend unavailable.'); }
        // HTTP/1.0 streams until close without chunk framing; raw sockets remain selectable.
        fwrite($sessionStream, "GET /session HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
        stream_set_blocking($sessionStream, false);
        $headers = '';
        $headersComplete = false;
        $buffer = '';
        $sessionId = '';
        $response = '';
        while (microtime(true) < $deadline && !is_file($stopFile)) {
            $read = array_filter([$sessionStream, $control], 'is_resource');
            $write = $except = null;
            if (stream_select($read, $write, $except, 0, 200000) === false) { throw new RuntimeException('Control stream failed.'); }
            foreach ($read as $stream) {
                $data = fread($stream, 8192);
                if ($stream === $control) {
                    $response .= $data ?: '';
                    if ($data !== '' || feof($control)) {
                        if (preg_match('/^HTTP\/\d\.\d 4\d\d/', $response)) { throw new RuntimeException('The iPerf3 server could not start.'); }
                        $reason = $job['expiresAt'] && time() >= $job['expiresAt'] - 1 ? 'Server stopped after 60 seconds.' : 'Server exited. See the log for details.';
                        break 2;
                    }
                    continue;
                }
                if (feof($sessionStream)) { throw new RuntimeException('iPerf3 control connection lost.'); }
                if (!$headersComplete) {
                    $headers .= $data ?: '';
                    $headerEnd = strpos($headers, "\r\n\r\n");
                    if ($headerEnd === false) { continue; }
                    if (!preg_match('/^HTTP\/\d\.\d 200/', $headers)) { throw new RuntimeException('Speed backend unavailable.'); }
                    $data = substr($headers, $headerEnd + 4);
                    $headersComplete = true;
                }
                $buffer .= $data ?: '';
                while (preg_match('/\r?\n\r?\n/', $buffer, $match, PREG_OFFSET_CAPTURE)) {
                    $position = $match[0][1];
                    $event = substr($buffer, 0, $position);
                    $buffer = substr($buffer, $position + strlen($match[0][0]));
                    $name = ''; $lines = [];
                    foreach (preg_split('/\r?\n/', $event) as $line) {
                        if (str_starts_with($line, 'event:')) { $name = ltrim(substr($line, 6)); }
                        elseif (str_starts_with($line, 'data:')) {
                            $value = substr($line, 5); $lines[] = str_starts_with($value, ' ') ? substr($value, 1) : $value;
                        }
                    }
                    $content = implode("\n", $lines);
                    if ($name === 'SessionId' && !$control) {
                        if (!preg_match('/^[a-f0-9-]{36}$/D', $content)) { throw new RuntimeException('Invalid control session.'); }
                        $sessionId = $content;
                        $control = stream_socket_client('tcp://127.0.0.1:'.$port, $errno, $error, 5);
                        if (!$control) { throw new RuntimeException('Unable to start control request.'); }
                        fwrite($control, "GET /method/iperf3/server HTTP/1.1\r\nHost: 127.0.0.1\r\nsession: ".$sessionId."\r\nConnection: close\r\n\r\n");
                        stream_set_blocking($control, false);
                    } elseif ($name === 'Iperf3') {
                        $job['port'] = (int)$content;
                        if ($job['port'] < 1024 || $job['port'] > 65535) { throw new RuntimeException('Invalid server port.'); }
                        $job['status'] = 'running';
                        $job['expiresAt'] = time() + 60;
                        $job['message'] = 'Server running.';
                        iperfWriteJob($job);
                    } elseif ($name === 'Iperf3Stream') {
                        $job['log'] = substr($job['log'].$content, -65536);
                        iperfWriteJob($job);
                    }
                }
            }
            if (!$job['port'] && microtime(true) > $job['createdAt'] + 10) { throw new RuntimeException('Server startup timed out.'); }
        }
        if (is_file($stopFile)) { $reason = 'Server stopped.'; }
        elseif (microtime(true) >= $deadline) { $reason = 'Server stopped after its time limit.'; }
    }
    $job['status'] = 'stopped';
} catch (Throwable $error) {
    $job['status'] = 'error';
    $reason = $error->getMessage();
} finally {
    // Closing these worker-owned connections cancels ALS and releases the iPerf port.
    if (is_resource($control)) { fclose($control); }
    if (is_resource($sessionStream)) { fclose($sessionStream); }
    $job['message'] = $reason;
    $job['expiresAt'] = 0;
    iperfWriteJob($job);
}
