#!/usr/bin/env bash
# One-command production release: pull, install, build, publish the frontends, restart the API.
# Usage (on the server, from anywhere):  ./deploy.sh
# Paths and the pm2 name can be overridden, e.g.  PM2_NAME=api ./deploy.sh
#
# Wrapped in main() so bash reads the whole file before running it: `git pull` may rewrite this
# script while it runs.
main() {
  set -euo pipefail

  local repo website_dir admin_dir pm2_name
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  website_dir="${WEBSITE_DIR:-/var/www/pg-website}"
  admin_dir="${ADMIN_DIR:-/var/www/pg-admin}"
  pm2_name="${PM2_NAME:-pg-api}"

  cd "$repo"
  echo "→ Pulling latest code"
  git pull --ff-only

  echo "→ Installing packages"
  npm ci

  # Build everything before touching the live folders: a failed build leaves the site as it was.
  echo "→ Building backend, website and admin"
  npm run build

  echo "→ Publishing website to $website_dir and admin to $admin_dir"
  sudo rsync -a --delete website/dist/ "$website_dir/"
  sudo rsync -a --delete admin/dist/ "$admin_dir/"

  echo "→ Restarting API ($pm2_name)"
  pm2 restart "$pm2_name" --update-env

  echo "→ Health check"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null; then
      echo "✔ Deployed $(git log -1 --format='%h %s')"
      return 0
    fi
    sleep 2
  done
  echo "✖ API did not come back healthy. Check: pm2 logs $pm2_name --lines 100" >&2
  return 1
}

main "$@"
