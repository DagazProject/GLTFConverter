# Deploy to Timeweb (blue-green)

The site is a static Vite build (`dist/`). [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds it on every push to `master` and publishes it to Timeweb over SSH using a
blue-green scheme: the new release is unpacked into the *inactive* colour slot,
then a single `current` symlink is flipped atomically. Rollback = repoint the
symlink at the other slot.

## GitHub secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Example | Notes |
| --- | --- | --- |
| `TIMEWEB_SSH_HOST` | `12.34.56.78` | server IP / host |
| `TIMEWEB_SSH_USER` | `c12345` | SSH/hosting login |
| `TIMEWEB_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY----- …` | private key whose public half is in the server's `~/.ssh/authorized_keys` |
| `TIMEWEB_SSH_PORT` | `22` | optional (defaults to 22) |
| `TIMEWEB_DEPLOY_PATH` | `/home/z/zitsky/GltfUtils` | base dir for releases (NOT the web root) |

## One-time server setup

This server already serves the site from `/home/z/zitsky/GltfUtils/public_html`.
The workflow only ever manages the `current` symlink — turning `public_html`
into a symlink to `current` is a one-time manual step, deliberately kept out of
the deploy script.

```sh
BASE=/home/z/zitsky/GltfUtils            # == TIMEWEB_DEPLOY_PATH
mkdir -p "$BASE/releases" "$BASE/incoming"

# Replace the existing docroot with a symlink to the blue-green "current".
# Note: the site is unavailable between this step and the first successful
# deploy (current doesn't exist yet) — run a deploy right after, or seed
# current first: ln -sfn "$BASE/releases/blue" "$BASE/current".
rm -rf "$BASE/public_html"
ln -s "$BASE/current" "$BASE/public_html"
```

After the first successful workflow run, `/home/z/zitsky/GltfUtils/current` →
`releases/blue` (then alternates `green`/`blue` each deploy), and
`public_html` follows it.

`vite.config.ts` uses `base: './'`, so the bundle works from any path/symlink,
and the app is a single `index.html` SPA (no server rewrite rules needed).

## Rollback

```sh
cd ~/gltf-editor
ln -sfn releases/blue current   # or releases/green — whichever was the previous one
```
