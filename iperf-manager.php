<?php declare(strict_types=1);

function iperfJobDirectory(): string
{
    $directory = sys_get_temp_dir().'/lookingglass-iperf';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to prepare iPerf3 state.');
    }
    return $directory;
}

function iperfJobPath(string $id): string
{
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { throw new RuntimeException('Invalid job.'); }
    return iperfJobDirectory().'/'.$id.'.json';
}

function iperfReadJob(string $id): ?array
{
    $path = iperfJobPath($id);
    return is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
}

function iperfWriteJob(array $job): void
{
    $path = iperfJobPath($job['id']);
    $temporary = $path.'.'.getmypid().'.tmp';
    $job['updatedAt'] = time();
    $json = json_encode($job, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (file_put_contents($temporary, $json, LOCK_EX) === false || !rename($temporary, $path)) {
        throw new RuntimeException('Unable to save iPerf3 state.');
    }
}

function iperfPublicJob(?array $job): array
{
    $job ??= ['status' => 'idle', 'port' => 0, 'log' => '', 'message' => 'Not running.'];
    $job['remaining'] = max(0, (int)($job['expiresAt'] ?? 0) - time());
    $job['public_ipv4'] = defined('LG_IPV4') ? LG_IPV4 : '';
    $job['public_ipv6'] = defined('LG_IPV6') ? LG_IPV6 : '';
    return $job;
}
