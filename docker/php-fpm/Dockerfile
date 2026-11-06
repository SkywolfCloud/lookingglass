FROM php:8.4-fpm-bookworm

ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libcap2-bin iputils-ping mtr-tiny traceroute iproute2 libfcgi-bin && \
    rm -rf /var/lib/apt/lists/*

# Pin the official executable and verify it; do not depend on a local server binary.
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) sha=7d7fa3bdd967494d1c051766696dea753bc6f4a1d95c2016fdfa078cf1894ff6 ;; \
      arm64) sha=820a736c60aca52683b5a4c7fa256d7a4248db37f28f2c16ff6daf76a8b0ee87 ;; \
      *) echo "NextTrace build supports amd64 and arm64" >&2; exit 1 ;; \
    esac; \
    curl -fL --retry 3 "https://github.com/nxtrace/NTrace-core/releases/download/v1.7.5/nexttrace_linux_${TARGETARCH}" -o /usr/local/bin/nexttrace; \
    echo "$sha  /usr/local/bin/nexttrace" | sha256sum -c -; \
    chmod 755 /usr/local/bin/nexttrace; \
    setcap cap_net_raw+ep /usr/local/bin/nexttrace

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
COPY docker/php-fpm/zz-lg.conf /usr/local/etc/php-fpm.d/zz-lg.conf
WORKDIR /var/www/html
COPY --chown=www-data:www-data . .
COPY docker/php-fpm/src/config.php config.php
