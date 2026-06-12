#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-94.156.112.224}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/cyberkotleta/current}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-cyberkotleta.service}"
SSH_ARGS=(-o StrictHostKeyChecking=no)
SSH_BIN=(ssh "${SSH_ARGS[@]}")
RSYNC_SSH="ssh -o StrictHostKeyChecking=no"

if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
  SSH_BIN=(sshpass -e ssh "${SSH_ARGS[@]}")
  RSYNC_SSH="sshpass -e ssh -o StrictHostKeyChecking=no"
fi

npm run check

rsync -az -e "${RSYNC_SSH}" server/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/server/"

rsync -az -e "${RSYNC_SSH}" package.json package-lock.json "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

# Do not delete old hashed assets on every deploy: users with an already-open tab
# may still request the previous JS/CSS file during reload.
rsync -az -e "${RSYNC_SSH}" dist/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/dist/"

"${SSH_BIN[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "systemctl restart ${DEPLOY_SERVICE} && systemctl is-active ${DEPLOY_SERVICE}"
