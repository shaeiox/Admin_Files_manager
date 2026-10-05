# CloudAvid on nginx — install, verify, operate

Complete instructions for [`cloudavid.conf`](cloudavid.conf): two hostnames on one
nginx host — a static portal and a proxied application.

| Domain | Served by | Gate | Security headers from |
|---|---|---|---|
| `files.cloudavid.com` | static: `/var/www/html/files-server-web` (+ content dirs `/var/www/html/download`, `/var/www/html/files`) | none (public) | nginx |
| `admin.files.cloudavid.com` | reverse proxy → `127.0.0.1:3000`, the Dimension app running from `/var/www/html/Admin-Files` | **HTTP Basic Auth** | the app (helmet), through the proxy |

> ⚠ **The admin API is unauthenticated** (ADR-003): no login in the application
> itself. `auth_basic` in the config is the only thing between the internet and
> list/download/upload/delete of `STORAGE_ROOT`. Do not remove it until real
> authentication lands in the app. `scripts/nginx/dimension.conf` is the generic
> template with the same warning; this file is the concrete deployment.

Everything below runs **on the server, as root** (shown via `sudo`).

---

## 0. What must already exist

```bash
# 1. DNS: both names point at this host
#      files.cloudavid.com      -> A/AAAA <server IP>
#      admin.files.cloudavid.com-> A/AAAA <server IP>
# 2. Firewall: 80 and 443 open
# 3. Content, where the config expects it:
ls -d /var/www/html/files-server-web /var/www/html/download /var/www/html/files
# 4. The application running and answering LOCALLY (bypasses nginx and auth):
curl -s http://127.0.0.1:3000/api/v1/health     # -> "success":true ... "apiVersion":1
```

If the app is **not** running, start it first (the config proxies to a process,
it does not serve `/var/www/html/Admin-Files` as files — the SPA needs `/api`,
uploads and the fallback, all of which live in the Node process). Minimal unit,
adapted from [`scripts/systemd/dimension.service`](../systemd/dimension.service):

```ini
# /etc/systemd/system/dimension.service
[Service]
WorkingDirectory=/var/www/html/Admin-Files
Environment=NODE_ENV=production
Environment=PORT=3000
# STORAGE_ROOT and AFM_DATA_DIR are REQUIRED in production; put them in
# /etc/dimension/dimension.env (EnvironmentFile=/etc/dimension/dimension.env)
# or set them here. The app refuses to boot without them.
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=www-data            # or a dedicated user owning the app + storage dirs
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dimension
```

If it runs on **another port**, edit `proxy_pass` in `cloudavid.conf` — that line
is the only place the port appears.

---

## 1. Certificate — it must cover BOTH names

`files.cloudavid.com` alone is **not** enough: the admin vhost fails the
handshake with a name mismatch. Check what you have:

```bash
sudo openssl x509 -in /etc/ssl/certs-web/fullchain-new.pem -noout -ext subjectAltName
```

You need `DNS:files.cloudavid.com, DNS:admin.files.cloudavid.com` (a wildcard
`*.cloudavid.com` does **not** cover `admin.files.cloudavid.com` — wildcards
match one label only). If it doesn't, issue one cert for both names and repoint
the two `ssl_certificate` lines:

```bash
sudo certbot certonly --nginx -d files.cloudavid.com -d admin.files.cloudavid.com
# cert -> /etc/letsencrypt/live/files.cloudavid.com/{fullchain.pem,privkey.pem}
```

Renewal: `certbot renew` (systemd timer handles it). `certbot certonly --nginx`
does not rewrite this config. If you prefer `certbot --nginx`, it *does* edit the
file in place — diff it afterwards so the comments and header sets survive.

---

## 2. Basic-auth file (before the first reload!)

A **missing** `auth_basic_user_file` makes nginx answer **500 to every admin
request**. Create it first:

```bash
# with apache2-utils:
sudo htpasswd -cB /etc/nginx/cloudavid-admin.htpasswd <user>
# or with openssl only (append more users with >>):
printf '%s:%s\n' '<user>' "$(openssl passwd -apr1)" | sudo tee /etc/nginx/cloudavid-admin.htpasswd
sudo chmod 640 /etc/nginx/cloudavid-admin.htpasswd
```

---

## 3. Install the config

```bash
sudo install -m 0644 scripts/nginx/cloudavid.conf /etc/nginx/sites-available/cloudavid.conf
sudo ln -sf ../sites-available/cloudavid.conf /etc/nginx/sites-enabled/cloudavid.conf

# If you already pasted an earlier version anywhere else, remove it first —
# a second block with the same server_name fails `nginx -t` with
# "conflicting server name":
grep -rl 'files.cloudavid.com' /etc/nginx/ | grep -v sites-available/cloudavid.conf

sudo nginx -t && sudo systemctl reload nginx
```

**Always `nginx -t` before `reload`.** Expected output on nginx ≥ 1.25.1:

```
nginx: [warn] the "listen ... http2" directive is deprecated, use the "http2" directive instead ...
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

The warning is **expected and harmless** — `listen ... ssl http2` still works
everywhere, while the newer `http2 on;` directive *fails to parse* before
1.25.1 (e.g. Ubuntu 24.04 ships 1.24). If you are on ≥ 1.25.1 and want the
warning gone, replace in **both** 443 blocks:

```nginx
listen 443 ssl;
listen [::]:443 ssl;
http2 on;
```

Do **not** delete `server_names_hash_bucket_size 128;`. Both names share ports
80/443, so nginx builds **one** virtual-name hash for them; this pair collides
and overflows the default 32-byte bucket, and nginx refuses to start with
`could not build server_names_hash, you should increase
server_names_hash_bucket_size: 32`. The hash is plain byte arithmetic — the
failure is deterministic, not a platform quirk. (Verified: the config fails
`nginx -t` without this line and passes with it.)

---

## 4. Verify (every behaviour is asserted this way)

```bash
# HTTP -> HTTPS, both names
curl -sI http://files.cloudavid.com/       | head -1     # HTTP/1.1 301
curl -sI http://admin.files.cloudavid.com/ | head -1     # HTTP/1.1 301

# Portal: HTML is never cached, and the full security set is present
curl -sI https://files.cloudavid.com/ | grep -iE 'cache-control|strict-transport|x-frame'
#   cache-control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
#   strict-transport-security: max-age=31536000; includeSubDomains
#   x-frame-options: SAMEORIGIN
# EXACTLY ONE cache-control line — two means expires and add_header are both firing.

# Portal: JS/CSS revalidate (304 on repeat), images cache 7d
curl -sI https://files.cloudavid.com/<any>.js  | grep -i cache-control   # no-cache, must-revalidate
curl -sI https://files.cloudavid.com/<any>.png | grep -i cache-control   # public, max-age=604800, no-transform

# Content dirs (note: /download/notes.html must be YOUR file, not the SPA)
curl -sI https://files.cloudavid.com/download/<some-real-file>           # 200

# JSON listing: application/json EXACTLY once
curl -sI https://files.cloudavid.com/__list/download/ | grep -ci '^content-type'   # 1
curl -s  https://files.cloudavid.com/__list/download/ | head -c 200                # JSON array

# Deny rules
curl -sI https://files.cloudavid.com/.env | head -1                      # 404

# Admin: closed without credentials, open with them
curl -sI https://admin.files.cloudavid.com/ | head -1                    # 401
curl -s  https://admin.files.cloudavid.com/ | grep -i www-authenticate   # Basic realm="CloudAvid Admin"
curl -s -u '<user>:<pass>' https://admin.files.cloudavid.com/api/v1/health
#   {"success":true,...,"apiVersion":1}   (proxied from the app)
```

In a browser: portal loads, hard-reload picks up new HTML immediately, and the
admin site prompts once for user/password.

---

## 5. How the portal is cached (and how to ship an update)

| Class | Rule | Effect |
|---|---|---|
| `*.html` | `no-store, no-cache, ... max-age=0` | every navigation revalidates — a deploy is visible on the next reload |
| `*.css`, `*.js` | `no-cache, must-revalidate` + `etag on` | 304 while unchanged, 200 + new bytes when the file changes |
| images, fonts, media | `public, max-age=604800, no-transform` | 7 days in the browser/CDN |
| `/__list/...` | `no-store` | listings are never stale |
| `/download/`, `/files/` | no explicit cache header | heuristic + ETag/Last-Modified revalidation |

Deploying portal changes = replace files under
`/var/www/html/files-server-web`. Nothing to reload; HTML is never cached, and
JS/CSS revalidate by ETag. If you ever see stale HTML anyway, the response
itself will show the old headers — check you edited the vhost that is actually
loaded (`nginx -T | grep cloudavid`).

---

## 6. What changed vs. the original pasted config — and why

Each row was **measured** by running both configs locally (nginx 1.26.3, same
file tree, curl against both):

| Original | Now | Measured evidence |
|---|---|---|
| `location /download/`, `/files/` as plain prefixes | `location ^~ /download/`, `^~ /files/` | extension regexes outrank plain prefixes: a real file `/download/notes.html` returned **404** (looked up under `files-server-web`), now **200** from the content dir |
| security headers only at server level | repeated inside every location that declares `add_header` | nginx drops **all** inherited headers when a location adds any: HTML, JS and image responses shipped with **0** `Strict-Transport-Security` and **0** `X-Frame-Options`; now **1** each. (HSTS on the portal was effectively never sent on its pages.) |
| `expires -1`/`expires 0`/`expires 7d` **plus** `add_header Cache-Control …` | one `add_header Cache-Control` per location | original emitted **two** conflicting `Cache-Control` headers (`no-cache` + `no-store…` on HTML, `max-age=0` + `no-cache…` on JS); now exactly **one** |
| `add_header Content-Type application/json` in `__list` | removed | `autoindex_format json` already sends it: original sent the header **twice**, now **once** |
| `deny all;` next to `return 404;` | `return 404;` only | `return` runs in an earlier nginx phase — the `deny` was dead code |
| DHE ciphers in the list | ECDHE-GCM only | DHE without `ssl_dhparam` uses weak DH params; forward secrecy stays via ECDHE |
| media regex: `png jpg jpeg svg ico woff2?` | + `gif webp avif ttf otf mp4 webm` | the missing types fell through to default (uncached) handling |
| — | `server_names_hash_bucket_size 128;` | without it `nginx -t` **fails**: both names on the same ports collide in the default 32-byte bucket |
| — | admin vhost: proxy + `auth_basic` | the app cannot be served as static files; publishing it ungated would expose an unauthenticated destructive API |
| `listen 443 ssl http2` | unchanged (deliberately) | works on every nginx version; the ≥ 1.25.1 deprecation warning is documented above. `http2 on;` would *fail* on < 1.25.1 |

Unchanged on purpose: cert paths, `root /var/www/html/files-server-web`,
`/__list/` rewrite trick (including the bogus index name that prevents an
`index.html` from hijacking the JSON listing), `try_files … @spa`, 6 GB body
ceiling, 600 s timeouts.

---

## 7. Admin vhost — the parts that are load-bearing

- **One proxy hop.** `server.js` sets `trust proxy` to exactly `1`, so rate
  limiting keys on the address nginx reports. Putting another proxy in front
  silently mis-keys client IPs (ADR-008). The `X-Forwarded-*` headers below
  `proxy_pass` are what makes that one hop legible to the app.
- **No SPA fallback in nginx.** `server.js` serves `public/index.html` for
  unknown GETs and answers `/api` 404s as JSON. `try_files` here would shadow both.
- **Limits, ordered against the app** (keep them in step with
  [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md)):

| Layer | Value |
|---|---|
| app `UPLOAD_MAX_BYTES` | 5 GiB default |
| nginx `client_max_body_size` | 6 g — must stay **above** the app limit, else nginx 413s before the app decides |
| nginx timeouts (body/read/send) | 600 s — must outlast the app's 30 s shutdown grace |
| app `PORT` | 3000 — must match `proxy_pass` |

---

## 8. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `nginx -t`: `conflicting server name` | an older copy of this config is still loaded — `grep -rl files.cloudavid.com /etc/nginx/` and remove the duplicate |
| `nginx -t`: `could not build server_names_hash` | someone deleted `server_names_hash_bucket_size` — restore it (see §3) |
| `nginx -t`: `listen ... http2 is deprecated` | expected warning on nginx ≥ 1.25.1 — harmless, or switch to `http2 on;` (§3) |
| admin answers **500** | `auth_basic_user_file` missing/unreadable — recreate §2, check `ls -l`, reload |
| admin answers **401** with correct password | wrong htpasswd entry; regenerate. The browser cached old credentials — it re-prompts per protection space |
| admin answers **502/504** | app not running or wrong port — `curl http://127.0.0.1:3000/api/v1/health`, fix `proxy_pass` |
| **413** on upload | `client_max_body_size` < app `UPLOAD_MAX_BYTES` — raise both together |
| portal file 404 although it exists | `root` mismatch: the two content locations read `/var/www/html/download` and `/var/www/html/files` (siblings of `files-server-web`). If your files live *inside* `files-server-web`, change those two `root` lines to `/var/www/html/files-server-web` |
| bare `/download/` returns **403** | expected: listings are off in that location by design — use `/__list/download/` |
| portal JS/CSS 404 for a file you just added | location precedence is working as designed: files under `/download/` and `/files/` are content (served from the content dirs); portal assets live under `files-server-web` |
| `nginx: [crit] ... Permission denied` on cert/key | cert must be readable by the nginx worker — `chmod 644` the pem, or group-read the key |
| scripts show `\r: command not found` over SSH | the file arrived with CRLF — this repo pins `*.conf`/`*.sh` to LF via `.gitattributes`; re-copy from the repository, don't paste through editors that rewrap |

---

## 9. Customizing

| Want to change | Edit |
|---|---|
| portal document root | `root /var/www/html/files-server-web;` (portal server block) |
| content dirs | the two `location ^~` blocks (`root /var/www/html;`) |
| app port | the single `proxy_pass http://127.0.0.1:3000;` |
| htpasswd path | `auth_basic_user_file` (admin server block) |
| certificate | the two `ssl_certificate*` lines in **each** 443 block |
| image cache TTL | `max-age=604800` (7 days) in the media location |
| admin gate | `auth_basic` lines — replace with `allow`/`deny` for an IP allow-list, but never with nothing |
