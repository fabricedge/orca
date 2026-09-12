# Running a headless `serve` and the desktop GUI on the same machine

A machine with a desktop session can also run `orca serve` — for the mobile
companion, the web client, or remote CLI access — while the Orca desktop app is
open in front of the user. This document is the contract for that coexistence:
why the two processes normally cannot share one profile, and the supported way
to run both side by side.

## The single-instance lock is per userData profile

Orca acquires one Electron single-instance lock per `userData` path
([`src/main/startup/single-instance-lock.ts`](../../src/main/startup/single-instance-lock.ts)).
The lock exists because two instances on one profile would both write the
canonical discovery files under `<userData>/` — `orca-runtime.json` (RPC
endpoint + authToken for the bundled CLI) and `agent-hooks/endpoint.env` (hook
port + token) — so whichever instance quits last leaves metadata pointing at a
dead process, and their terminal daemons would race for the same socket.

Two facts follow from that design:

- A second launch for a profile someone else holds logs
  `[single-instance] Another Orca instance is already running…` and exits with
  `SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE` (= `3`) after asking the live
  instance to handle the argv. A `serve`-shaped second launch is treated as a
  supervisor artifact and does **not** promote the live server to a desktop
  window (`shouldActivateDesktopForSecondInstance`).
- The packaged GUI owns the default profile (`~/.config/orca` on Linux). A
  headless `serve` launched from the same binary also resolves that profile, so
  an unmodified GUI launch while `serve` is up **cannot** open a window — it
  pings the serve instance and exits.

## Run each on its own profile with `--user-data-dir`

Electron maps the Chromium `--user-data-dir` switch into
`app.getPath('userData')`, which is what Orca keys its lock and daemon socket
on, so pointing the GUI at a second profile gives it an independent lock, its
own `<userData>/daemon/` socket, and its own discovery files. This works in
packaged builds; `src/main/startup/configure-process.ts` only overrides
`userData` for dev/E2E, so packaged launches otherwise use the Electron default.

Verified contract (Electron 43): launching the Electron binary with
`--user-data-dir=/tmp/x` makes `app.getPath('userData')` return `/tmp/x`.

Prefer `--user-data-dir` over re-pointing `XDG_CONFIG_HOME`. The switch moves
only Orca's/Electron's profile; `XDG_CONFIG_HOME` would also re-home every tool
the GUI spawns (git, codex, claude, …), silently changing which config files
those agents read.

`--user-data-dir` is already listed in
[`serve-mode-argv.ts`](../../src/main/startup/serve-mode-argv.ts)
`VALUE_TAKING_FLAGS`, so an argument like `--user-data-dir,path,serve` is never
misread as the `serve` subcommand.

### Worked layout

| Instance | Launch | Profile | Outcome |
| -------- | ------ | ------- | ------- |
| headless `serve` | `orca-ide serve --port 6768` | `~/.config/orca` (default) | owns the WebSocket port and any headless agent work |
| desktop GUI | `orca-ide --user-data-dir=~/.config/orca-gui` | `~/.config/orca-gui` | own lock, own daemon, own window |

Both bind independent WebSocket listeners; if the serve holds port 6768 the GUI
drops to the next candidate or an OS-assigned port (`[ws-transport] … trying
next candidate`), so there is no listener conflict.

### Build and install on Debian-based hosts

```bash
pnpm run build:linux
```

`build:linux` emits an AppImage, a `.deb`, and a `.rpm`. The rpm target requires
`rpmbuild` on the host (`sudo apt-get install rpm`), which Debian does not ship
by default — the AppImage and `.deb` are sufficient there. Install with

```bash
sudo apt-get install -y libgtk-3-0 libnss3 libxss1 libatspi2.0-0   # if missing
sudo dpkg -i dist/orca-ide_<version>_amd64.deb
```

The package installs to `/opt/Orca`, registers
`/usr/share/applications/orca-ide.desktop`, and symlinks `/usr/bin/orca-ide`.

### Make the desktop launcher carry the profile

The packaged desktop entry runs `/opt/Orca/orca-ide %U` with no profile switch,
so a launch from dmenu/rofi while `serve` is up hits the lock again. Override
the entry at the user level — the same file id in
`~/.local/share/applications` wins over `/usr/share/applications`:

```ini
[Desktop Entry]
Name=Orca
Exec=/opt/Orca/orca-ide --user-data-dir=/home/<user>/.config/orca-gui %U
Terminal=false
Type=Application
Icon=orca-ide
StartupWMClass=orca
Comment=Next-gen IDE for parallel agentic development
MimeType=text/markdown;x-scheme-handler/orca;x-scheme-handler/orca;
Categories=Utility;
```

`dmenu_run` then lists "Orca" and launches it on the GUI profile.

## Trade-offs to keep in mind

- **Profiles are data partitions, not views.** Configuration, workspaces,
  sessions, terminal history, and agent state under `~/.config/orca` are invisible to the
  GUI on `~/.config/orca-gui`, and vice versa. Each profile also runs its own
  terminal daemon. If both instances must steer the same work, they have to be
  the same profile — which the lock forbids — so pick which instance owns the
  default profile and give the other a dedicated one.
- **Version skew is safe.** State migrates forward on load from any build, so an
  AppImage at one version and a `.deb` at another can own separate profiles
  concurrently. Headless `serve` never auto-updates; the GUI auto-updates on its
  own profile.
- **Reverting.** Stop the extra instance and drop the user desktop entry (or the
  `--user-data-dir` flag) and the GUI returns to the default profile.

## Related

- [`headless-linux-server.md`](./headless-linux-server.md) — running `orca
  serve` as a supervised service, including the `RestartPreventExitStatus=3`
  contract for the single-instance exit code.