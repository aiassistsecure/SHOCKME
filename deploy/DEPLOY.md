# SHOCKME · deploy

**Live at https://thrilling.world**

Cloudflare (Flexible) → nginx :80 → BFF :3410 → nedbd :7070 (+ imagine :8081)

Everything below is what was ACTUALLY done on the box, not what I first
guessed. The four things that cost us time are marked ⚠️.

## 1 · code

```bash
git clone https://github.com/aiassistsecure/SHOCKME.git /opt/shockme
cd /opt/shockme
```

## 2 · prerequisites

```bash
pip install nedb-engine
node -v          # 22.6+ required. run/_node.sh refuses below that.
```

## 3 · env

```bash
cp .env.example .env
```

Edit it to match what you'll actually run:

```
PORT=3410
NEDB_URL=http://127.0.0.1:7070
NEDB_DB=shockme
SHOCKME_IMAGINE=1
IMAGINE_URL=http://127.0.0.1:8081
SHOCKME_ORIGIN=https://thrilling.world
```

⚠️ **PORT must match the nginx `proxy_pass`.** The conf says 3410. If `.env`
doesn't set PORT, the BFF defaults to 3400 and nginx 502s into the void.

## 4 · run the three, in screen

⚠️ **Use screen or tmux.** These are foreground processes. Close the SSH
session without a multiplexer and the site dies with it.

```bash
screen -S sm-engine   # ./run/nedbd.sh     -> :7070
screen -S sm-voice    # ./run/imagine.sh   -> :8081  (532MB first run)
screen -S sm-site     # ./run/bff.sh       -> :3410
# ctrl-A then D to detach each
```

## 5 · verify the app BEFORE touching nginx

```bash
curl -s localhost:3410/health
# {"ok":true,...,"voice":"on"}
```

⚠️ **Check the process, not just the port.** A port being occupied does not
mean it is occupied by US — on this box something else was already sitting on
3400, and `curl` returning nothing looked like our app being broken. To see
who actually owns a port:

```bash
ss -ltnp | grep -E '3410|7070|8081'
```

Node shows as `node`. If you see `MainThread`, that's a Python process and
it isn't ours.

## 6 · nginx

⚠️ **This box uses `sites-available` + `sites-enabled`**, despite running
Mail-in-a-Box. `vibecode-101.com` and `vibecode-expo.com` already live there.
Copying the file in is not enough — it must be SYMLINKED into sites-enabled
or nginx never reads it and MiaB's catch-all answers instead.

```bash
cp deploy/nginx-shockme.conf /etc/nginx/sites-available/shockme.conf
ln -s /etc/nginx/sites-available/shockme.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Verify nginx routes the Host correctly, independent of DNS and Cloudflare:

```bash
curl -sI -H "Host: thrilling.world" localhost | head -3   # expect 200
```

## 7 · Cloudflare

- **A record** `thrilling.world` → box IP, proxied (orange cloud)
- **A record** `www` → box IP, proxied
- **SSL/TLS mode → Flexible** ⚠️ **not optional**

⚠️ **The Flexible/Full trap.** This conf listens on **:80 only**. Under
**Full** or **Full (Strict)**, Cloudflare connects on **:443** instead, where
MiaB's catch-all is waiting — so you get the Mail-in-a-Box landing page even
though `curl` on :80 returns a perfect 200. That exact split (curl works,
browser shows MiaB) is the signature of the wrong SSL mode.

## Restart after a pull

```bash
cd /opt/shockme && git pull
screen -r sm-site     # ctrl-C, ./run/bff.sh, ctrl-A D
```

nedbd and imagine only need restarting if ports or the model changed.

## Known operational debt

- Nothing supervises the three processes. A crash or reboot means manual
  restart. systemd units were written and dropped at M's request; revisit
  when the site matters more than the iteration speed.
- nedbd on **7070 is shared** with other projects on this box. `NEDB_DB=shockme`
  keeps the data separate, but restarting that daemon for another project
  takes SHOCKME down too. A dedicated instance on 7075 is the clean fix.
