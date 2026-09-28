import { describe, expect, it } from 'vitest'
import { resolveHeadlessServiceLaunchTarget } from './headless'

describe('headless CLI service launch target', () => {
  it('uses the dev Electron executable, app root, and matching development data directory', () => {
    expect(
      resolveHeadlessServiceLaunchTarget({
        electron: false,
        executable: '/usr/bin/node',
        env: {
          ORCA_DEV_CLI_INVOCATION: '1',
          ORCA_APP_EXECUTABLE: '/repo/node_modules/.bin/electron',
          ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1',
          ORCA_APP_ROOT: '/repo',
          ORCA_USER_DATA_PATH: '/home/test/.config/orca-dev',
          APPIMAGE: '/stale/orca.AppImage'
        }
      })
    ).toEqual({
      executable: '/repo/node_modules/.bin/electron',
      args: ['/repo'],
      environment: { ORCA_DEV_USER_DATA_PATH: '/home/test/.config/orca-dev' }
    })
  })

  it('uses the active AppImage path for a packaged Electron CLI', () => {
    expect(
      resolveHeadlessServiceLaunchTarget({
        electron: true,
        executable: '/tmp/.mount/orca-ide',
        env: { APPIMAGE: '/opt/downloads/orca.AppImage' }
      })
    ).toEqual({
      executable: '/opt/downloads/orca.AppImage',
      args: [],
      environment: {}
    })
  })

  it('rejects an unconfigured Node CLI instead of installing a unit for Node', () => {
    expect(() =>
      resolveHeadlessServiceLaunchTarget({
        electron: false,
        executable: '/usr/bin/node',
        env: {}
      })
    ).toThrow('packaged Linux Orca CLI')
  })
})
