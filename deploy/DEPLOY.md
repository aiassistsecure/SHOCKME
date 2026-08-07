# SHOCKME · deploy

Cloudflare Flexible → nginx :80 → BFF :3410 → nedbd :7075 (+ imagine :8085).

No systemd. Run the three processes however you like — `screen`, `tmux`, or
by hand. Only nginx is installed system-wide.

## Ports differ from local, on purpose

| | local | VPS |
|---|---|---|
| BFF | 3400 | **3410** |
| nedbd | 7070 | **7075** |
| imagine | 8081 | **8085** |

Vision and NEDB Studio already hold **7070** on this box. Two nedbd instances
on one port is a silent, confusing failure — separate ports, always.

## 1 · code

```bash
ssh root@box
git clone https://github.com/aiassistsecure/SHOCKME.git /opt/shockme
cd /opt/shockme
```

## 2 · prerequisites

```bash
pip install nedb-engine
node -v            # must be 22.6+; run/_node.sh will refuse below that
```

## 3 · env

```bash
cp .env.example .env
```

Then edit `.env` and uncomment the production block:

```
PORT=3410
NEDB_URL=http://127.0.0.1:7075
IMAGINE_URL=http://127.0.0.1:8085
SHOCKME_ORIGIN=https://thrilling.world
```

## 4 · start the three

```bash
NEDB_PORT=7075   ./run/nedbd.sh      # screen -S sm-engine
IMAGINE_PORT=8085 ./run/imagine.sh   # screen -S sm-voice   (532MB first run)
./run/bff.sh                          # screen -S sm-site
```

## 5 · verify BEFORE touching nginx

```bash
curl -s localhost:3410/health
```

Expect `{"ok":true,...,"voice":"on"}`. If `voice` is `unreachable`, imagine
isn't up — the site still works, it just uses the corpus.

## 6 · nginx

Mail-in-a-Box owns nginx here. **Do not use sites-enabled** — MiaB
regenerates it and your file vanishes on the next update.

```bash
cp deploy/nginx-shockme.conf /etc/nginx/conf.d/local/shockme.conf
nginx -t && systemctl reload nginx
```

The conf already has `thrilling.world` baked in, plus a `www` -> apex 301.

## 7 · Cloudflare

- **A record** `thrilling.world` → box IP, proxy **ON** (orange cloud)
- **A record** `www` → box IP, proxy **ON**
- **SSL/TLS mode → Flexible**

Flexible terminates TLS at Cloudflare and speaks plain HTTP to the box. The
nginx conf has no 443 block and no https redirect on purpose — adding one
under Flexible causes an infinite redirect loop.

## Verify live

```bash
curl -sI https://thrilling.world | head -3
curl -s https://thrilling.world/health
# SSE must stream, not buffer — this should dribble out, not arrive at once:
curl -N -s https://thrilling.world/bff/stream | head -5
```

If that last one hangs and then dumps everything at once, `proxy_buffering`
is still on somewhere.

## Restart after a pull

```bash
cd /opt/shockme && git pull
# restart the bff screen; nedbd and imagine only need restarting if their
# ports or the model changed.
```
