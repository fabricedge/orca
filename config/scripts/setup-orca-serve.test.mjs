import { afterEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runProcessSync } from '../../src/shared/child-process/run-process'

const script = resolve(import.meta.dirname, 'setup-orca-serve.sh')
const fixtures = []
const marker = '# Managed by Orca setup-orca-serve.sh.'

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'orca-serve-setup-'))
  fixtures.push(root)
  const bin = join(root, 'bin')
  const home = join(root, 'home')
  const unitDirectory = join(home, '.config', 'systemd', 'user')
  mkdirSync(bin)
  mkdirSync(home)
  const executable = (name, body) => {
    const path = join(bin, name)
    writeFileSync(path, `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 })
    chmodSync(path, 0o755)
    return path
  }
  executable('uname', 'echo "${TEST_PLATFORM:-Linux}"')
  executable('id', 'echo "${TEST_UID:-1000}"')
  executable('tailscale', '[[ -n "${TEST_TAILSCALE_IP:-}" ]]; echo "$TEST_TAILSCALE_IP"')
  executable(
    'ip',
    'echo "${TEST_ROUTE:-1.1.1.1 via 192.168.1.1 dev eth0 src 192.168.1.20 uid 1000}"'
  )
  executable(
    'loginctl',
    `
printf 'loginctl %s\\n' "$*" >> "$TEST_ROOT/calls"
[[ "\${1:-}" != --no-ask-password ]] || shift
case "$1" in
  show-user) [[ "\${TEST_LINGER_UNKNOWN:-0}" == 0 ]]; cat "$TEST_ROOT/linger" ;;
  enable-linger) [[ "\${TEST_LINGER_DENIED:-0}" == 0 ]]; echo yes > "$TEST_ROOT/linger" ;;
  *) exit 1 ;;
esac`
  )
  executable(
    'systemctl',
    `
printf 'systemctl %s\\n' "$*" >> "$TEST_ROOT/calls"
[[ "$1" == --user ]]; shift
operation="$1"; shift
if [[ "\${TEST_FAIL_COMMAND:-}" == "$operation" && ( "\${TEST_ALWAYS_FAIL:-0}" == 1 || ! -f "$TEST_ROOT/already-failed" ) ]]; then
  touch "$TEST_ROOT/already-failed"; exit 1
fi
case "$operation" in
  show-environment) [[ "\${TEST_BUS_FAIL:-0}" == 0 ]] ;;
  daemon-reload) ;;
  enable) touch "$TEST_ROOT/enabled"; [[ " $* " != *' --now '* ]] || touch "$TEST_ROOT/active" ;;
  disable) rm -f "$TEST_ROOT/enabled"; if [[ " $* " == *' --now '* && "\${TEST_KEEP_ACTIVE:-0}" == 0 ]]; then rm -f "$TEST_ROOT/active"; fi ;;
  start|restart) touch "$TEST_ROOT/active" ;;
  stop) rm -f "$TEST_ROOT/active" ;;
  is-active) [[ -f "$TEST_ROOT/active" ]] ;;
  is-enabled) if [[ -f "$TEST_ROOT/enabled" ]]; then echo enabled; else echo disabled; exit 1; fi ;;
  show)
    [[ "\${TEST_STATE_UNKNOWN:-0}" == 0 ]] || exit 1
    if [[ -f "$TEST_ROOT/active" ]]; then echo active; else echo inactive; fi ;;
  *) exit 1 ;;
esac`
  )
  writeFileSync(join(root, 'linger'), 'yes\n')
  const env = {
    HOME: home,
    USER: 'orca-fixture',
    PATH: `${bin}:/usr/bin:/bin`,
    XDG_CONFIG_HOME: join(home, '.config'),
    ORCA_BIN: executable('orca-ide', 'exit 0'),
    PAIRING_ADDRESS: '100.64.1.20',
    ORCA_BACKGROUND_LAUNCH: '1',
    TEST_ROOT: root,
    LANG: 'C'
  }
  return {
    root,
    home,
    bin,
    env,
    executable,
    unitDirectory,
    unit: join(unitDirectory, 'orca-serve.service'),
    run(overrides = {}, args = []) {
      return runProcessSync({
        program: '/bin/bash',
        args: [script, ...args],
        cwd: home,
        env: { ...env, ...overrides },
        timeoutMs: 10_000
      })
    },
    calls() {
      return existsSync(join(root, 'calls'))
        ? readFileSync(join(root, 'calls'), 'utf8').trim().split('\n')
        : []
    },
    content() {
      return readFileSync(join(unitDirectory, 'orca-serve.service'), 'utf8')
    }
  }
}

function succeeds(result) {
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
}

describe.skipIf(process.platform !== 'linux')('Orca systemd user service setup', () => {
  it('shows help and rejects unknown or contradictory actions without touching systemd', () => {
    const f = fixture()
    succeeds(f.run({ TEST_BUS_FAIL: '1' }, ['--help']))
    expect(f.run({}, ['typo']).code).toBe(1)
    expect(f.run({}, ['install', 'uninstall']).code).toBe(1)
    expect(f.run({}, ['uninstall', '--replace']).code).toBe(1)
    expect(f.calls()).toEqual([])
  })

  it.each([{ TEST_PLATFORM: 'Darwin' }, { TEST_UID: '0' }])(
    'rejects unsupported execution before mutation: %j',
    (env) => {
      const f = fixture()
      expect(f.run(env).code).toBe(1)
      expect(f.calls()).toEqual([])
      expect(existsSync(f.unit)).toBe(false)
    }
  )

  it('fails before writing when the SSH user manager is unavailable', () => {
    const f = fixture()
    const result = f.run({ TEST_BUS_FAIL: '1' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Over SSH')
    expect(existsSync(f.unit)).toBe(false)
  })

  it.each(['relative/orca', '/missing/orca'])('rejects invalid launchers: %s', (ORCA_BIN) => {
    const f = fixture()
    expect(f.run({ ORCA_BIN }).code).toBe(1)
    expect(existsSync(f.unit)).toBe(false)
  })

  it.each(['0', '65536', 'no', '12 --no-pairing', '12\nEnvironment=BAD=1'])(
    'rejects invalid ports: %j',
    (PORT) => {
      const f = fixture()
      expect(f.run({ PORT }).code).toBe(1)
      expect(existsSync(f.unit)).toBe(false)
    }
  )

  it.each([
    'localhost',
    '127.2.3.4',
    '0.0.0.0',
    '::',
    '::1',
    '[0:0:0:0:0:0:0:1]',
    'ws://127.0.0.1:6768',
    '::ffff:127.0.0.1',
    'host\nEnvironment=BAD=1'
  ])('rejects unsafe advertised addresses: %j', (PAIRING_ADDRESS) => {
    const f = fixture()
    expect(f.run({ PAIRING_ADDRESS }).code).toBe(1)
    expect(existsSync(f.unit)).toBe(false)
  })

  it('installs a mobile service with a normalized fixed port and background launch policy', () => {
    const f = fixture()
    succeeds(f.run({ PORT: '06768' }))
    expect(f.content()).toContain(marker)
    expect(f.content()).toContain(
      'serve --pairing-address "100.64.1.20" --mobile-pairing --port 6768'
    )
    expect(f.content()).toContain('Environment="ORCA_BACKGROUND_LAUNCH=1"')
    expect(f.calls()).toContain('systemctl --user start orca-serve.service')
  })

  it('makes an unchanged enabled and active install a no-op', () => {
    const f = fixture()
    succeeds(f.run())
    const count = f.calls().length
    succeeds(f.run())
    expect(
      f
        .calls()
        .slice(count)
        .some((call) => /daemon-reload|enable |start |restart /.test(call))
    ).toBe(false)
  })

  it('restarts an active service when settings change', () => {
    const f = fixture()
    succeeds(f.run())
    succeeds(f.run({ PORT: '6769' }))
    expect(f.content()).toContain('--port 6769')
    expect(f.calls()).toContain('systemctl --user restart orca-serve.service')
    expect(readdirSync(f.unitDirectory).some((name) => name.includes('backup'))).toBe(false)
  })

  it('reenables and starts an unchanged disabled service', () => {
    const f = fixture()
    succeeds(f.run())
    rmSync(join(f.root, 'active'))
    rmSync(join(f.root, 'enabled'))
    succeeds(f.run())
    expect(f.calls()).toContain('systemctl --user enable --now orca-serve.service')
  })

  it('pins relative profiles and preserves the selected XDG directories and PATH', () => {
    const f = fixture()
    succeeds(f.run({ ORCA_USER_DATA_PATH: 'profile', XDG_DATA_HOME: '/data/orca' }))
    expect(f.content()).toContain(`Environment="ORCA_USER_DATA_PATH=${f.home}/profile"`)
    expect(f.content()).toContain('Environment="XDG_DATA_HOME=/data/orca"')
    expect(f.content()).toContain(`Environment="PATH=${f.env.PATH}"`)
  })

  it('escapes systemd command arguments separately from environment assignments', () => {
    const f = fixture()
    const ORCA_BIN = f.executable('orca "50% $name\\bin"', 'exit 0')
    succeeds(f.run({ ORCA_BIN, ORCA_USER_DATA_PATH: '/profile/50% $name\\"' }))
    expect(f.content()).toContain('ExecStart=/usr/bin/env -- ')
    expect(f.content()).toContain('orca \\"50%% $$name\\\\bin\\"" serve')
    expect(f.content()).toContain('Environment="ORCA_USER_DATA_PATH=/profile/50%% $name\\\\\\""')
  })

  it('rejects unit control characters before changing lingering or writing the service', () => {
    const f = fixture()
    expect(f.run({ ORCA_USER_DATA_PATH: '/profile\nEnvironment=BAD=1' }).code).toBe(1)
    expect(existsSync(f.unit)).toBe(false)
    expect(f.calls().some((call) => call.startsWith('loginctl'))).toBe(false)
  })

  it('uses Tailscale first and the default-route source address as fallback', () => {
    const f = fixture()
    succeeds(f.run({ PAIRING_ADDRESS: '', TEST_TAILSCALE_IP: '100.80.1.2' }))
    expect(f.content()).toContain('--pairing-address "100.80.1.2"')
    succeeds(f.run({ PAIRING_ADDRESS: '' }))
    expect(f.content()).toContain('--pairing-address "192.168.1.20"')
  })

  it('requires an explicit address when the route has no unique source', () => {
    const f = fixture()
    expect(f.run({ PAIRING_ADDRESS: '', TEST_ROUTE: 'unreachable' }).code).toBe(1)
    expect(
      f.run({ PAIRING_ADDRESS: '', TEST_ROUTE: 'src 192.168.1.2\nsrc 192.168.1.3' }).code
    ).toBe(1)
    expect(existsSync(f.unit)).toBe(false)
  })

  it('enables lingering before starting the service', () => {
    const f = fixture()
    writeFileSync(join(f.root, 'linger'), 'no\n')
    succeeds(f.run())
    expect(f.calls().indexOf('loginctl --no-ask-password enable-linger 1000')).toBeLessThan(
      f.calls().indexOf('systemctl --user start orca-serve.service')
    )
  })

  it.each([{ TEST_LINGER_DENIED: '1' }, { TEST_LINGER_UNKNOWN: '1' }])(
    'retains the unit boundary on lingering failure: %j',
    (env) => {
      const f = fixture()
      writeFileSync(join(f.root, 'linger'), 'no\n')
      expect(f.run(env).code).toBe(1)
      expect(existsSync(f.unit)).toBe(false)
    }
  )

  it('requires explicit adoption and keeps an unmarked unit backup', () => {
    const f = fixture()
    mkdirSync(f.unitDirectory, { recursive: true })
    writeFileSync(f.unit, 'user-written unit\n')
    expect(f.run().code).toBe(1)
    expect(f.content()).toBe('user-written unit\n')
    succeeds(f.run({}, ['install', '--replace']))
    const backup = readdirSync(f.unitDirectory).find((name) => name.includes('.backup.'))
    expect(backup).toBeDefined()
    expect(readFileSync(join(f.unitDirectory, backup), 'utf8')).toBe('user-written unit\n')
  })

  it('refuses symlinked units even with explicit replacement', () => {
    const f = fixture()
    mkdirSync(f.unitDirectory, { recursive: true })
    const target = join(f.home, 'user-unit')
    writeFileSync(target, 'retain this unit\n')
    symlinkSync(target, f.unit)
    expect(f.run({}, ['install', '--replace']).code).toBe(1)
    expect(f.run({}, ['uninstall']).code).toBe(1)
    expect(readFileSync(target, 'utf8')).toBe('retain this unit\n')
  })

  it('does not replace the unit when its previous state is unverifiable', () => {
    const f = fixture()
    succeeds(f.run())
    const before = f.content()
    expect(f.run({ PORT: '6769', TEST_STATE_UNKNOWN: '1' }).code).toBe(1)
    expect(f.content()).toBe(before)
    expect(f.calls()).not.toContain('systemctl --user restart orca-serve.service')
  })

  it('restores a disabled, inactive service after a failed refresh', () => {
    const f = fixture()
    succeeds(f.run())
    const before = f.content()
    rmSync(join(f.root, 'active'))
    rmSync(join(f.root, 'enabled'))
    expect(f.run({ PORT: '6769', TEST_FAIL_COMMAND: 'start' }).code).toBe(1)
    expect(f.content()).toBe(before)
    expect(existsSync(join(f.root, 'active'))).toBe(false)
    expect(existsSync(join(f.root, 'enabled'))).toBe(false)
  })

  it.each(['restart', 'daemon-reload', 'enable'])(
    'restores the previous active service after a failed refresh: %s',
    (TEST_FAIL_COMMAND) => {
      const f = fixture()
      succeeds(f.run())
      const before = f.content()
      const result = f.run({ PORT: '6769', TEST_FAIL_COMMAND })
      expect(result.code).toBe(1)
      expect(result.stderr).toContain('Restoring previous')
      expect(f.content()).toBe(before)
      expect(existsSync(join(f.root, 'active'))).toBe(true)
      expect(existsSync(join(f.root, 'enabled'))).toBe(true)
    }
  )

  it('retains a recovery backup if restarting the old service also fails', () => {
    const f = fixture()
    succeeds(f.run())
    const result = f.run({ PORT: '6769', TEST_FAIL_COMMAND: 'restart', TEST_ALWAYS_FAIL: '1' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Recovery failed')
    expect(readdirSync(f.unitDirectory).some((name) => name.includes('.backup.'))).toBe(true)
  })

  it('prints troubleshooting instructions on first-start failure', () => {
    const f = fixture()
    const result = f.run({ TEST_FAIL_COMMAND: 'start' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('journalctl --user')
    expect(existsSync(f.unit)).toBe(true)
    expect(result.stdout).not.toContain('Service active and enabled')
  })

  it('removes only the managed service, preserving profile data and lingering', () => {
    const f = fixture()
    succeeds(f.run())
    writeFileSync(join(f.home, 'pairing-fixture'), 'keep')
    succeeds(f.run({}, ['uninstall']))
    expect(existsSync(f.unit)).toBe(false)
    expect(readFileSync(join(f.home, 'pairing-fixture'), 'utf8')).toBe('keep')
    expect(readFileSync(join(f.root, 'linger'), 'utf8')).toBe('yes\n')
  })

  it.each([
    { TEST_FAIL_COMMAND: 'disable' },
    { TEST_STATE_UNKNOWN: '1' },
    { TEST_KEEP_ACTIVE: '1' }
  ])('retains the unit unless stopping is verified: %j', (env) => {
    const f = fixture()
    succeeds(f.run())
    const before = f.content()
    expect(f.run(env, ['uninstall']).code).toBe(1)
    expect(f.content()).toBe(before)
  })

  it('treats an absent installation as an uninstall no-op', () => {
    const f = fixture()
    succeeds(f.run({}, ['uninstall']))
    expect(f.calls()).toEqual(['systemctl --user show-environment'])
  })
})
