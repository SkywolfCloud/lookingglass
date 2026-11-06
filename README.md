# Skywolf Looking Glass

A fork of [hybula/lookingglass](https://github.com/hybula/lookingglass) with NextTrace and a shared read-only xterm.js terminal.
Modern, super simple and fresh looking glass based on Bootstrap 5 and PHP 8. A looking glass is a network utility which is
made user-friendly for everyone to use. It allows you to execute network related commands within a remote network, usually that of an ISP.

## Demo
[Skywolf Hong Kong Looking Glass](http://lg.hk.skywolf.cloud/)

## Features
- Bootstrap 5 UI.
- Real time command output using JavaScript.
- Supports ping/ping6, traceroute/traceroute6, mtr/mtr6 and nexttrace/nexttrace6.
- A fixed dark xterm.js terminal for every method, with native ANSI colors, text selection and responsive sizing.
- MTR updates its table in place; all terminal assets are served locally.
- SHA256-verified NextTrace v1.7.5 Docker builds for Linux amd64 and arm64.
- Easy to customize and to configure.
- DNS checking to prevent unnecessary executions.
- Latency feature from visitor to LG.
- Dark/light/auto page theme; terminal output always uses a dark background.

## Requirements
- Any Linux distribution, this has been tested on RHEL 8 + 9, for NetBSD users see [#47](https://github.com/hybula/lookingglass/issues/47).
- PHP 8.0 or higher.
- IPv6 connectivity if you want to use the v6 equivalents.
- Root access.

## Installation

The Docker build includes NextTrace and all terminal assets. See [deployment and validation](DEPLOYMENT.md) for the Skywolf configuration, runtime limits and tests.
#### Manual
For this installation we will assume that we are working on AlmaLinux 8 or 9. Warning: This guide does not cover any security hardening or rate limiting.
Note: These steps also work with AlmaLinux 9, but it will install PHP 8 instead of 7.

1. Install the required network tools: `dnf install mtr traceroute coreutils -y`. For NextTrace methods, install the [official NextTrace executable](https://github.com/nxtrace/NTrace-core/releases/tag/v1.7.5) at `/usr/local/bin/nexttrace`, make it executable and grant `cap_net_raw` with `setcap cap_net_raw+ep /usr/local/bin/nexttrace`. Disable `nexttrace` and `nexttrace6` in `LG_METHODS` if you do not install it.
2. Install the web server with PHP (by default it will install 7.2 on RHEL 8): `dnf install httpd mod_ssl php php-posix -y`.
3. Enable and start Apache/PHP-FPM: `systemctl enable --now httpd && systemctl enable --now php-fpm`.
4. Let's help MTR to work, execute the following command: `ln -s /usr/sbin/mtr /usr/bin/mtr` and also mtr helper called mtr-packet: `ln -s /usr/sbin/mtr-packet /usr/bin/mtr-packet`.
5. You *must* configure SELinux before this all works, or you can disable SELinux using `setenforce 0` and possibly make it permanent: `nano /etc/selinux/config` change to `SELINUX=disabled`.
6. Upload the contents of the ZIP to /var/www/html/.
7. Rename config.dist.php to config.php and adjust the settings.
8. (Optional) You can generate test files using the following command: `dd if=/dev/zero of=100MB.bin bs=1024 count=0 seek=$[1024*100]` (this is for 100MB).
9. (Optional) You might want to enable SSL using LetsEncrypt, take a look at [acme.sh](https://github.com/acmesh-official/acme.sh).

#### Docker
For installation using Docker, follow these steps and run the commands on the target machine where the application should be installed:

1. First, ensure Docker and Docker Compose are already installed.
2. Clone this GitHub repository: `git clone https://github.com/SkywolfCloud/lookingglass.git`.
3. Change your current working directory to the freshly cloned repository.
4. Currently, the Docker images are not hosted on an image repository, so you'll have to build them yourself with the following command: `docker compose build`.
5. For the Skywolf Hong Kong configuration, copy `compose.skywolf.yaml` to `compose.override.yaml` and adjust the node details. You can also use the generic defaults in `docker-compose.yml`. Local overrides are ignored by Git.
6. Create and start the containers: `docker compose up -d --wait`.
7. Afterward, the Looking Glass should be reachable from your web browser at `http://$your_server_ip/`!

### iPerf3 Installation (Optional)
> It is recommended to install iPerf3 on a different server from your looking glass to avoid network congestion.

#### Manual
Again, we will assume that we are working on AlmaLinux 8 or 9.
1. Install iPerf3: `dnf install iperf3 -y`
2. Launch iPerf3 as a daemon: `iperf3 -sD -p 5201`.
3. (Optional) You might want to add a systemd unit file for iPerf3, so it automatically starts when the system boots up.
4. Locate the two lines containing `LG_SPEEDTEST_CMD_INCOMING` and `LG_SPEEDTEST_CMD_OUTGOING` respectively in `config.php`.
5. Change `hostname` in these lines to the IPv4 address of your iPerf3 server.

#### Docker
1. Uncomment the section for `iperf3` in `docker-compose.yml` if you want iPerf3 and the looking glass to be on the same server.
Otherwise, please copy the `iperf3` section and save it as `docker-compose.yml` on another server with Docker and Docker Compose installed.
2. Start the iPerf3 container: `docker compose up -d --wait`.
3. Locate the two lines containing `LG_SPEEDTEST_CMD_INCOMING` and `LG_SPEEDTEST_CMD_OUTGOING` respectively in `docker/php-fpm/src/config.php`.
5. Change `hostname` in these lines to the IPv4 address of your iPerf3 server.

## Upgrading
Back up your source and local configuration, then pull this fork and rebuild with `docker compose build && docker compose up -d --wait`. Preserve `compose.override.yaml` (or `config.php` for a manual installation). The terminal stream differs from upstream: keep the frontend assets and PHP backend on the same version.

## Customization
If you open up config.dist.php you will see that there are some features that allows you to customize the looking glass, this includes a custom CSS override.
You may also extend the looking glass with a custom block.

## Contribute
Fork-specific changes can be proposed in this repository. General improvements can also be proposed to the original Hybula project.

## Credits
This fork is based on [hybula/lookingglass](https://github.com/hybula/lookingglass). The upstream license and footer attribution are retained. [NextTrace](https://github.com/nxtrace/NTrace-core) and [xterm.js](https://github.com/xtermjs/xterm.js) have separate licenses; see [third-party notices](brand/THIRD_PARTY.md).

This project is inspired by the [LookingGlass project](https://github.com/telephone/LookingGlass) of @telephone and uses his procExecute() function, although slightly modified.
It would be great to keep the "powered by" link the footer to help development of this project.

## License
```Apache License, Version 2.0 and the Commons Clause Restriction```
