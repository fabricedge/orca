import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFile, readFile, rename } from 'node:fs/promises'
import { runProcess } from '../shared/child-process/run-process'
import {
  getLinuxHeadlessServiceSnapshot,
  installLinuxHeadlessService,
  setLinuxHeadlessServiceRunning,
  startEnabledLinuxHeadlessServiceAfterDesktopQuit
} from './linux-headless-service'

const runtime = vi.hoisted(() => ({ packaged: false }))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return runtime.packaged
    },
    quit: vi.fn(),
    getAppPath: () => '/workspace/Orca test',
    getPath: (key: string) => (key === 'exe' ? '/workspace/electron' : '/data/orca-preview')
  }
}))
vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../shared/child-process/run-process', () => ({
  runProcess: vi.fn().mockResolvedValue({ code: 0, stdout: 'yes', stderr: '' })
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, 'getuid').mockReturnValue(1000)
  vi.stubEnv('APPIMAGE', '/old/inherited.AppImage')
  runtime.packaged = false
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe.skipIf(process.platform !== 'linux')('Linux service installed from a local build', () => {
  it('supports the preview and launches Electron with its app root and matching data directory', async () => {
    expect((await getLinuxHeadlessServiceSnapshot()).supported).toBe(true)
    expect(
      vi.mocked(runProcess).mock.calls.some(([spec]) => spec.program === '/usr/bin/pkexec')
    ).toBe(false)
    await installLinuxHeadlessService({ pairingAddress: 'auto', port: 6768 })
    const unit = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(unit).toContain('ExecStart="/workspace/electron" "/workspace/Orca test" --serve')
    expect(unit).toContain('Environment="ORCA_DEV_USER_DATA_PATH=/data/orca-preview"')
    expect(unit).not.toContain('/old/inherited.AppImage')
    expect(unit).toContain('ELECTRON_RUN_AS_NODE ELECTRON_RENDERER_URL')
  })

  it('keeps the packaged AppImage launch without a development app root', async () => {
    runtime.packaged = true
    await installLinuxHeadlessService({ pairingAddress: 'auto', port: 6768 })
    const unit = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(unit).toContain('ExecStart="/old/inherited.AppImage" --serve')
    expect(unit).not.toContain('ORCA_DEV_USER_DATA_PATH')
  })

  it('still requires confirmation before replacing an existing service', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('# Installed by Orca\nold unit')
    await expect(
      installLinuxHeadlessService({ pairingAddress: 'auto', port: 6768 })
    ).rejects.toThrow('confirm to replace')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('restores the old unit if systemd rejects the replacement', async () => {
    vi.mocked(readFile).mockResolvedValue('# Installed by Orca\nold unit')
    vi.mocked(runProcess).mockImplementation(async (spec) => {
      if (spec.program === '/usr/bin/systemctl' && spec.args?.includes('daemon-reload')) {
        return { code: 1, stdout: '', stderr: 'invalid unit', signal: null, timedOut: false }
      }
      return { code: 0, stdout: 'yes', stderr: '', signal: null, timedOut: false }
    })

    await expect(
      installLinuxHeadlessService({ pairingAddress: 'auto', port: 6768, overwriteExisting: true })
    ).rejects.toThrow('invalid unit')
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining('.backup-'),
      expect.stringMatching(/orca-serve\.service$/u)
    )
  })

  it('reads the saved address and port from an Orca-managed unit', async () => {
    vi.mocked(readFile).mockResolvedValue(
      [
        '# Installed by Orca',
        '[Service]',
        'ExecStart="/opt/Orca/orca-ide" --serve --serve-json --serve-port 17688 --serve-pairing-address "host%%name.test"'
      ].join('\n')
    )
    const snapshot = await getLinuxHeadlessServiceSnapshot()
    expect(snapshot).toMatchObject({
      installed: true,
      pairingAddress: 'host%name.test',
      port: 17688
    })
  })

  it('arms the service without starting it or closing the GUI', async () => {
    vi.mocked(readFile).mockResolvedValue('# Installed by Orca\nunit')
    await setLinuxHeadlessServiceRunning(true)
    expect(
      vi.mocked(runProcess).mock.calls.some(
        ([spec]) =>
          spec.program === '/usr/bin/systemctl' &&
          JSON.stringify(spec.args) === JSON.stringify(['--user', 'enable', 'orca-serve.service'])
      )
    ).toBe(true)
    const electron = await import('electron')
    expect(electron.app.quit).not.toHaveBeenCalled()
  })

  it('schedules the enabled service on normal GUI quit without closing the GUI itself', async () => {
    vi.mocked(readFile).mockResolvedValue('# Installed by Orca\nunit')
    vi.mocked(runProcess).mockImplementation(async (spec) => {
      const result = { signal: null, timedOut: false }
      if (spec.program === '/usr/bin/loginctl') {
        return { ...result, code: 0, stdout: 'yes', stderr: '' }
      }
      if (spec.program === '/usr/bin/systemctl' && spec.args?.includes('is-active')) {
        return { ...result, code: 1, stdout: 'inactive', stderr: '' }
      }
      return { ...result, code: 0, stdout: 'yes', stderr: '' }
    })
    await startEnabledLinuxHeadlessServiceAfterDesktopQuit()
    expect(vi.mocked(runProcess).mock.calls.at(-1)?.[0]).toMatchObject({
      program: '/usr/bin/systemd-run',
      args: expect.arrayContaining([
        '--user',
        expect.stringContaining('--unit=orca-serve-after-desktop-quit'),
        expect.stringContaining('systemctl --user start orca-serve.service')
      ])
    })
    const electron = await import('electron')
    expect(electron.app.quit).not.toHaveBeenCalled()
  })
})
