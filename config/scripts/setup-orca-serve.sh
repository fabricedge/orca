#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME=orca-serve.service
OWNER_MARKER='# Managed by Orca setup-orca-serve.sh.'
ACTION=install
ACTION_SET=false
REPLACE=false
CANDIDATE=
BACKUP=
KEEP_BACKUP=false

usage() {
  cat <<'EOF'
Usage: setup-orca-serve.sh [install|uninstall] [--replace]

Install a Linux systemd user service for Orca Mobile. Run as your regular user.
Re-running applies changed settings and briefly disconnects clients.

Environment:
  ORCA_BIN             Absolute path to the installed orca-ide launcher
  PAIRING_ADDRESS      Reachable hostname/IP (auto: Tailscale, then default route)
  PORT                 Optional fixed port, 1-65535
  ORCA_USER_DATA_PATH  Optional profile directory (relative to the current directory)

--replace adopts an existing unmarked unit, keeping a backup beside it.
Uninstall retains profiles, pairing data, terminal daemons, and user lingering.
EOF
}

die() { echo "error: $*" >&2; exit 1; }
diagnostics() {
  echo "Inspect service state: systemctl --user status $SERVICE_NAME" >&2
  echo "Pairing link and startup errors: journalctl --user -u $SERVICE_NAME -b -o cat" >&2
}
cleanup() {
  [[ -z "$CANDIDATE" ]] || rm -f -- "$CANDIDATE"
  if [[ -n "$BACKUP" && "$KEEP_BACKUP" == false ]]; then rm -f -- "$BACKUP"; fi
}
trap cleanup EXIT

for arg in "$@"; do
  case "$arg" in
    install|uninstall)
      [[ "$ACTION_SET" == false ]] || die 'Choose one action: install or uninstall.'
      ACTION="$arg"; ACTION_SET=true ;;
    --replace) REPLACE=true ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "Unknown argument: $arg" ;;
  esac
done
[[ "$ACTION" != uninstall || "$REPLACE" == false ]] || die '--replace applies only to install.'
[[ "$(uname -s)" == Linux ]] || die 'This helper requires Linux with systemd.'
UID_NUMBER="$(id -u)"
[[ "$UID_NUMBER" != 0 ]] || die 'Run as your regular user, without sudo.'
for program in systemctl loginctl flock; do
  command -v "$program" >/dev/null || die "Required command not found: $program"
done
if [[ ! -S "${XDG_RUNTIME_DIR:-}/bus" && -S "/run/user/$UID_NUMBER/bus" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$UID_NUMBER"
fi
if ! systemctl --user show-environment >/dev/null; then
  die "User service manager unavailable. Over SSH, log in as the service owner and check /run/user/$UID_NUMBER/bus and XDG_RUNTIME_DIR."
fi

CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
[[ "$CONFIG_HOME" == /* && ! "$CONFIG_HOME" =~ [[:cntrl:]] ]] || die 'XDG_CONFIG_HOME must be an absolute path without control characters.'
UNIT_DIR="$CONFIG_HOME/systemd/user"
SERVICE_PATH="$UNIT_DIR/$SERVICE_NAME"
mkdir -p -- "$UNIT_DIR"
exec 9>"$UNIT_DIR/.orca-serve-setup.lock"
flock -n 9 || die 'Another Orca service setup is running.'
[[ ! -L "$SERVICE_PATH" ]] || die "Refusing to replace a symlink: $SERVICE_PATH"
if [[ -e "$SERVICE_PATH" ]]; then
  [[ -f "$SERVICE_PATH" ]] || die "Not a regular unit file: $SERVICE_PATH"
  if ! grep -Fxq "$OWNER_MARKER" "$SERVICE_PATH"; then
    [[ "$ACTION" == install && "$REPLACE" == true ]] || die 'Existing unit is not managed by this helper. Review it, then use install --replace to adopt it.'
    KEEP_BACKUP=true
  fi
fi

if [[ "$ACTION" == uninstall ]]; then
  if [[ ! -f "$SERVICE_PATH" ]]; then echo 'No managed Orca service is installed.'; exit 0; fi
  if ! systemctl --user disable --now "$SERVICE_NAME"; then
    diagnostics; die 'Could not stop/disable the service; the unit was retained.'
  fi
  if ! STOP_STATE="$(systemctl --user show "$SERVICE_NAME" --property=ActiveState --value)"; then
    diagnostics; die 'Could not verify that the service stopped; the unit was retained.'
  fi
  case "$STOP_STATE" in
    inactive|failed) ;;
    *) diagnostics; die "Service state is $STOP_STATE; the unit was retained." ;;
  esac
  rm -f -- "$SERVICE_PATH"
  systemctl --user daemon-reload || die 'Unit removed, but daemon-reload failed; retry it manually.'
  echo 'Removed Orca service. Profile, pairing data, and lingering were retained.'
  exit 0
fi

ORCA_BIN="${ORCA_BIN:-$(command -v orca-ide || true)}"
if [[ -z "$ORCA_BIN" && -x "$HOME/.local/bin/orca-ide" ]]; then ORCA_BIN="$HOME/.local/bin/orca-ide"; fi
[[ "$ORCA_BIN" == /* && -f "$ORCA_BIN" && -x "$ORCA_BIN" ]] || die 'Install the Orca CLI or set ORCA_BIN to an absolute executable orca-ide launcher path.'
PAIRING_ADDRESS="${PAIRING_ADDRESS:-}"
if [[ -z "$PAIRING_ADDRESS" ]] && command -v tailscale >/dev/null; then
  PAIRING_ADDRESS="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$PAIRING_ADDRESS" ]] && command -v ip >/dev/null; then
  PAIRING_ADDRESS="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="src") print $(i+1)}' | sort -u || true)"
fi
[[ -n "$PAIRING_ADDRESS" && ! "$PAIRING_ADDRESS" =~ [[:space:][:cntrl:]] ]] || die 'Set PAIRING_ADDRESS to one reachable hostname or IP address.'
[[ "$PAIRING_ADDRESS" != *@* ]] || die 'PAIRING_ADDRESS must not contain credentials.'
HOST="${PAIRING_ADDRESS#*://}"
HOST="${HOST%%[/?#]*}"
if [[ "$HOST" == \[* ]]; then HOST="${HOST#\[}"; HOST="${HOST%%\]*}";
elif [[ "$HOST" != *:*:* ]]; then HOST="${HOST%%:*}"; fi
HOST="${HOST,,}"
case "$HOST" in localhost|*.localhost|127.*|0.0.0.0|::ffff:127.*) die 'Pairing address must be reachable from your phone, not loopback or a wildcard.' ;; esac
if [[ "$HOST" == *:* ]]; then
  NONZERO="${HOST//:/}"; NONZERO="${NONZERO//0/}"
  [[ -n "$NONZERO" && "$NONZERO" != 1 ]] || die 'Pairing address must not be IPv6 loopback or a wildcard.'
fi
PORT="${PORT:-}"
if [[ -n "$PORT" ]]; then
  [[ "$PORT" =~ ^[0-9]{1,5}$ ]] || die 'PORT must be an integer from 1 to 65535.'
  ((10#$PORT >= 1 && 10#$PORT <= 65535)) || die 'PORT must be an integer from 1 to 65535.'
  PORT="$((10#$PORT))"
fi

# systemd has separate specifier, environment, and command-argument expansion.
unit_quote() {
  local value="$1"
  [[ ! "$value" =~ [[:cntrl:]] ]] || die 'Unit values must not contain control characters.'
  value="${value//\\/\\\\}"; value="${value//\"/\\\"}"; value="${value//%/%%}"
  printf '"%s"' "$value"
}
exec_quote() { local value="${1//\$/\$\$}"; unit_quote "$value"; }
for variable in ORCA_BIN PAIRING_ADDRESS PATH XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME ORCA_USER_DATA_PATH; do
  [[ ! "${!variable:-}" =~ [[:cntrl:]] ]] || die "$variable must not contain control characters."
done
CANDIDATE="$(mktemp "$UNIT_DIR/.orca-serve-unit.XXXXXX")"
{
  printf '%s\n[Unit]\nDescription=Orca headless runtime server\n\n[Service]\nType=simple\n' "$OWNER_MARKER"
  # env keeps special launcher paths out of systemd's executable-name parser.
  printf 'ExecStart=/usr/bin/env -- %s serve --pairing-address %s --mobile-pairing' "$(exec_quote "$ORCA_BIN")" "$(exec_quote "$PAIRING_ADDRESS")"
  [[ -z "$PORT" ]] || printf ' --port %s' "$PORT"
  printf '\nEnvironment="ORCA_BACKGROUND_LAUNCH=1"\nEnvironment=%s\n' "$(unit_quote "PATH=$PATH")"
  for variable in XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME ORCA_USER_DATA_PATH; do
    value="${!variable:-}"
    if [[ -n "$value" ]]; then
      [[ "$value" == /* ]] || value="$PWD/$value"
      printf 'Environment=%s\n' "$(unit_quote "$variable=$value")"
    fi
  done
  printf 'Restart=always\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n'
} > "$CANDIDATE"

LINGER="$(loginctl show-user "$UID_NUMBER" --property=Linger --value)" || die 'Could not check user lingering.'
if [[ "$LINGER" != yes ]]; then
  if ! loginctl --no-ask-password enable-linger "$UID_NUMBER"; then
    die "Boot-time setup incomplete. Ask an administrator to run: sudo loginctl enable-linger $UID_NUMBER; then rerun this helper."
  fi
  [[ "$(loginctl show-user "$UID_NUMBER" --property=Linger --value)" == yes ]] || die 'Lingering was not enabled; no service configuration was changed.'
fi

CHANGED=true
WAS_ACTIVE=false
WAS_ENABLED=false
if [[ -f "$SERVICE_PATH" ]]; then
  if cmp -s "$SERVICE_PATH" "$CANDIDATE"; then CHANGED=false; fi
  PRIOR_STATE="$(systemctl --user show "$SERVICE_NAME" --property=ActiveState --value)" || die 'Could not read the previous service state.'
  case "$PRIOR_STATE" in
    active) WAS_ACTIVE=true ;;
    inactive|failed) ;;
    *) die "Service is $PRIOR_STATE; retry when it has finished starting or stopping." ;;
  esac
  ENABLED_STATE="$(systemctl --user is-enabled "$SERVICE_NAME" || true)"
  case "$ENABLED_STATE" in
    enabled) WAS_ENABLED=true ;;
    disabled) ;;
    *) die "Unsupported or unverifiable unit enablement: $ENABLED_STATE" ;;
  esac
fi
if [[ "$CHANGED" == true && -f "$SERVICE_PATH" ]]; then
  BACKUP="$(mktemp "$UNIT_DIR/orca-serve.service.backup.XXXXXX")"
  cp -p -- "$SERVICE_PATH" "$BACKUP"
fi

rollback() {
  [[ -n "$BACKUP" ]] || return 0
  echo 'Restoring previous service configuration.' >&2
  cp -p -- "$BACKUP" "$CANDIDATE" && mv -f -- "$CANDIDATE" "$SERVICE_PATH" && systemctl --user daemon-reload || return 1
  if [[ "$WAS_ENABLED" == true ]]; then systemctl --user enable "$SERVICE_NAME" || return 1;
  else systemctl --user disable "$SERVICE_NAME" || return 1; fi
  if [[ "$WAS_ACTIVE" == true ]]; then systemctl --user restart "$SERVICE_NAME";
  else systemctl --user stop "$SERVICE_NAME"; fi
}

apply_service() {
  if [[ "$CHANGED" == true ]]; then
    chmod 644 "$CANDIDATE" || return 1
    mv -f -- "$CANDIDATE" "$SERVICE_PATH" || return 1
    systemctl --user daemon-reload || return 1
    systemctl --user enable "$SERVICE_NAME" || return 1
    if [[ "$WAS_ACTIVE" == true ]]; then
      echo 'Applying changed settings; clients will briefly disconnect.'
      systemctl --user restart "$SERVICE_NAME" || return 1
    else systemctl --user start "$SERVICE_NAME" || return 1; fi
  elif [[ "$WAS_ENABLED" != true || "$WAS_ACTIVE" != true ]]; then
    systemctl --user enable --now "$SERVICE_NAME" || return 1
  fi
  systemctl --user is-active --quiet "$SERVICE_NAME"
}
if ! apply_service; then
  if ! rollback; then KEEP_BACKUP=true; echo "Recovery failed. Previous unit retained at: $BACKUP" >&2; fi
  diagnostics
  die 'Service setup failed. Inspect the logs before retrying; a new installation is retained for diagnosis.'
fi
[[ "$KEEP_BACKUP" != true ]] || echo "Previous unmarked unit backed up to: $BACKUP"
echo "Service active and enabled: $SERVICE_NAME"
echo "Advertised address: $PAIRING_ADDRESS"
echo 'Confirm server readiness and copy the mobile pairing link from the current boot log:'
echo "  journalctl --user -u $SERVICE_NAME -b -o cat"
echo 'Keep the phone on the same private network. Pairing persists while this profile and endpoint remain available.'
