# Deployment

This fork starts from hybula/lookingglass commit `417381108bfb8e2a56343ccaaa3ad5b6742b2df5` and adds NextTrace plus a shared, read-only xterm.js terminal for every method.

## Docker

```sh
git clone https://github.com/SkywolfCloud/lookingglass.git
cd lookingglass
cp compose.skywolf.yaml compose.override.yaml
# Adjust the node details in compose.override.yaml for your deployment.
docker compose build
docker compose up -d --wait
```

`compose.skywolf.yaml` contains the public Skywolf Hong Kong node configuration. The local `compose.override.yaml` is ignored by Git. The base Compose file has generic defaults and can run without an override. Images are built locally; no prebuilt `skywolfcloud` images are required or published.

Nginx listens on port 80 for IPv4 and IPv6. PHP-FPM listens only on `127.0.0.1:9000`; both containers use the host network so probes follow the host's routes. The Docker build supports Linux amd64 and arm64 and pins NextTrace v1.7.5 with a separate SHA256 for each architecture. The PHP image gives only the NextTrace executable `cap_net_raw`; the containers do not need privileged mode or NET_ADMIN.

All eight methods use the same fixed dark terminal even when the page is light. MTR refreshes the table using cursor control sequences. Ping, Traceroute and NextTrace stream text directly. The frontend consumes bytes with xterm.js, supports resizing and text selection, and sends no terminal keyboard input to the server. It exposes no interactive shell, PTY or websocket.

NextTrace uses its default realtime formatter with TERM=xterm-256color and COLORTERM=truecolor. Native ANSI styles are rendered with the standard xterm.js palette, without palette overrides or contrast-based color substitution. It is bounded to 45 seconds, 30 hops and two probes per hop; its geolocation/ASN data uses the default NextTrace API. Other commands have a 60-second overall limit. The NextTrace generic capability notice is suppressed after a trace starts; failures before tracing remain visible. Session cookies use Secure when PHP sees HTTPS and work with the existing HTTP endpoint. If terminating TLS at a reverse proxy, configure trusted HTTPS forwarding on the web server.

The logo and favicon are served locally; the logo links to https://hk.skywolf.cloud/. xterm.js 6.0.0 and addon-fit 0.11.0 are vendored with their MIT licenses, with npm SHA512 integrity checked when downloaded. See [third-party notices](brand/THIRD_PARTY.md).

## Operations

```sh
docker compose ps
docker compose logs --tail=100
docker compose build && docker compose up -d --wait
```

Before updating a live installation, back up the source and local override and retain the current image tags for rollback. Do not overwrite a local override with the example during upgrades. IPv6 methods require IPv6 connectivity from the host.

## Validation

Run PHP syntax checks and `node --check brand/terminal.js` for local edits. Against a running deployment, `python3 tests/http_smoke.py http://127.0.0.1/` exercises all eight methods, verifies the plain-text stream and MTR refreshes, checks single-use backend requests, and rejects invalid targets and CSRF tokens. It probes public Cloudflare IPv4 and IPv6 endpoints.

The existing `LICENSE.md` and upstream attribution remain in place.
