import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  files: new Map<string, string>(),
  xvfbAvailable: true,
  aptGetAvailable: false,
  enabled: true,
  active: true,
  linger: true,
  failEnableCount: 0,
  failDaemonReloadCount: 0,
  processCalls: [] as { program: string; args: string[] }[]
}))

function missingFileError(): Error & { code: string } {
  return Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async (filePath: string) => {
    if (filePath === '/usr/bin/Xvfb' && fixture.xvfbAvailable) {return}
    if (filePath === '/usr/bin/apt-get' && fixture.aptGetAvailable) {return}
    if (filePath === '/usr/bin/dnf') {throw missingFileError()}
    throw missingFileError()
  }),
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (filePath: string) => {
    const contents = fixture.files.get(filePath)
    if (contents === undefined) {throw missingFileError()}
    return contents
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const contents = fixture.files.get(from)
    if (contents === undefined) {throw missingFileError()}
    fixture.files.set(to, contents)
    fixture.files.delete(from)
  }),
  unlink: vi.fn(async (filePath: string) => {
    if (!fixture.files.delete(filePath)) {throw missingFileError()}
  }),
  writeFile: vi.fn(async (filePath: string, contents: string) => {
    fixture.files.set(filePath, contents)
  })
}))

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/home/test',
    userInfo: () => ({ username: 'test' })
  }
}))

vi.mock('./child-process/run-process', () => ({
  runProcess: vi.fn(async (spec: { program: string; args: string[] }) => {
    fixture.processCalls.push(spec)
    if (spec.program === '/usr/bin/pkexec') {
      if (spec.args[0] === '/usr/bin/apt-get' && spec.args[1] === 'install') {
        fixture.xvfbAvailable = true
      }
      return { code: 0, stdout: '', stderr: '', signal: null, timedOut: false }
    }
    if (spec.program === '/usr/bin/loginctl') {
      return {
        code: 0,
        stdout: fixture.linger ? 'yes' : 'no',
        stderr: '',
        signal: null,
        timedOut: false
      }
    }

    const action = spec.args[1]
    if (action === 'is-enabled') {
      return {
        code: fixture.enabled ? 0 : 1,
        stdout: fixture.enabled ? 'enabled' : 'disabled',
        stderr: '',
        signal: null,
        timedOut: false
      }
    }
    if (action === 'is-active') {
      return {
        code: fixture.active ? 0 : 1,
        stdout: fixture.active ? 'active' : 'inactive',
        stderr: '',
        signal: null,
        timedOut: false
      }
    }
    if (action === 'daemon-reload' && fixture.failDaemonReloadCount > 0) {
      fixture.failDaemonReloadCount -= 1
      return { code: 1, stdout: '', stderr: 'reload failed', signal: null, timedOut: false }
    }
    if (action === 'enable' && fixture.failEnableCount > 0) {
      fixture.failEnableCount -= 1
      return { code: 1, stdout: '', stderr: 'enable failed', signal: null, timedOut: false }
    }
    if (action === 'enable') {fixture.enabled = true}
    if (action === 'disable') {
      fixture.enabled = false
      fixture.active = false
    }
    if (action === 'stop') {fixture.active = false}
    if (action === 'start') {fixture.active = true}
    return { code: 0, stdout: '', stderr: '', signal: null, timedOut: false }
  })
}))

import {
  installManagedLinuxHeadlessService,
  removeManagedLinuxHeadlessService,
  setManagedLinuxHeadlessServiceRunning
} from './linux-headless-service-manager'
import { ensureLinuxHeadlessDisplay } from './linux-headless-display'

const unitPath = '/home/test/.config/systemd/user/orca-serve.service'
const oldUnit = '# Installed by Orca\nold unit'
const unitOptions = {
  executable: '/opt/orca/orca-ide',
  pairingAddress: 'auto',
  port: 6768
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.files.clear()
  fixture.xvfbAvailable = true
  fixture.aptGetAvailable = false
  fixture.enabled = true
  fixture.active = true
  fixture.linger = true
  fixture.failEnableCount = 0
  fixture.failDaemonReloadCount = 0
  vi.spyOn(process, 'getuid').mockReturnValue(1000)
})

afterEach(() => vi.restoreAllMocks())

describe.skipIf(process.platform !== 'linux')('Linux headless service manager', () => {
  it('restores the old unit and active state when enabling a replacement fails', async () => {
    fixture.files.set(unitPath, oldUnit)
    fixture.failEnableCount = 1

    await expect(
      installManagedLinuxHeadlessService(
        { ...unitOptions, overwriteExisting: true },
        async () => undefined
      )
    ).rejects.toThrow('enable failed')

    expect(fixture.files.get(unitPath)).toBe(oldUnit)
    expect(fixture.files.has(`${unitPath}.backup-${process.pid}`)).toBe(false)
    expect(fixture.active).toBe(true)
    expect(fixture.enabled).toBe(true)
  })

  it('reports an incomplete replacement rollback without deleting the new unit or backup', async () => {
    fixture.files.set(unitPath, oldUnit)
    fixture.failEnableCount = 1
    const { rename } = await import('node:fs/promises')
    vi.mocked(rename).mockImplementation(async (from, to) => {
      const source = from.toString()
      const destination = to.toString()
      if (source.endsWith(`.backup-${process.pid}`)) {throw new Error('restore failed')}
      const contents = fixture.files.get(source)
      if (contents === undefined) {throw missingFileError()}
      fixture.files.set(destination, contents)
      fixture.files.delete(source)
    })

    await expect(
      installManagedLinuxHeadlessService(
        { ...unitOptions, overwriteExisting: true },
        async () => undefined
      )
    ).rejects.toThrow(/rollback was incomplete/iu)

    expect(fixture.files.get(`${unitPath}.backup-${process.pid}`)).toBe(oldUnit)
    expect(fixture.files.get(unitPath)).toContain('ExecStart=')
  })

  it('restores the old unit and service state when daemon reload fails during removal', async () => {
    fixture.files.set(unitPath, oldUnit)
    fixture.failDaemonReloadCount = 1

    await expect(removeManagedLinuxHeadlessService()).rejects.toThrow('reload failed')

    expect(fixture.files.get(unitPath)).toBe(oldUnit)
    expect(fixture.files.has(`${unitPath}.remove-${process.pid}`)).toBe(false)
    expect(fixture.enabled).toBe(true)
    expect(fixture.active).toBe(true)
  })

  it('updates apt indexes before requesting Xvfb installation', async () => {
    fixture.xvfbAvailable = false
    fixture.aptGetAvailable = true

    await ensureLinuxHeadlessDisplay()

    expect(fixture.processCalls.filter((call) => call.program === '/usr/bin/pkexec')).toMatchObject(
      [
        { program: '/usr/bin/pkexec', args: ['/usr/bin/apt-get', 'update'] },
        { program: '/usr/bin/pkexec', args: ['/usr/bin/apt-get', 'install', '-y', 'xvfb'] }
      ]
    )
  })

  it('rejects service control operations when invoked as root', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0)

    await expect(setManagedLinuxHeadlessServiceRunning(false)).rejects.toThrow('non-root users')
    await expect(removeManagedLinuxHeadlessService()).rejects.toThrow('non-root users')
  })
})
