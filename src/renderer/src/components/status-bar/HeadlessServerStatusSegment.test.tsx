// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HeadlessServerStatusSegment } from './HeadlessServerStatusSegment'
import { LinuxHeadlessServiceSection } from '../settings/LinuxHeadlessServiceSection'

const state = vi.hoisted(() => ({
  setActiveView: vi.fn(),
  openSettingsTarget: vi.fn(),
  settingsNavigationTarget: null,
  paired: false
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/lib/desktop-window-chrome', () => ({
  isPairedWebClientWindow: () => state.paired
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.paired = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      platform: { get: () => ({ platform: 'linux' }) },
      app: {
        linuxHeadlessService: {
          getStatus: vi.fn().mockResolvedValue({
            supported: false,
            installed: false,
            enabled: false,
            active: false,
            linger: false,
            pairingAddress: null,
            port: null
          }),
          setRunning: vi.fn().mockResolvedValue({
            supported: true,
            installed: true,
            enabled: true,
            active: false,
            linger: true,
            pairingAddress: 'auto',
            port: 6768
          }),
          install: vi.fn().mockImplementation(async (config) => {
            if (!config.overwriteExisting) {
              throw new Error('A systemd unit already exists at the test path')
            }
            return {
              supported: true,
              installed: true,
              enabled: true,
              active: false,
              linger: true,
              pairingAddress: config.pairingAddress,
              port: config.port
            }
          }),
          remove: vi.fn()
        }
      },
      mobile: {
        listNetworkInterfaces: vi.fn().mockResolvedValue({
          interfaces: [{ name: 'enp1s0', address: '10.0.2.15' }]
        })
      }
    }
  })
})
afterEach(cleanup)

describe('headless controls in a local Linux preview', () => {
  it('selects a detected address and saves updated settings for the installed service', async () => {
    window.api.app.linuxHeadlessService.getStatus = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      enabled: true,
      active: false,
      linger: true,
      pairingAddress: 'auto',
      port: 6768
    })
    render(
      <TooltipProvider>
        <LinuxHeadlessServiceSection />
      </TooltipProvider>
    )
    const addressPicker = await screen.findByRole('combobox', { name: 'Connection address' })
    fireEvent.click(addressPicker)
    fireEvent.click(await screen.findByRole('option', { name: 'enp1s0 (10.0.2.15)' }))
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '17688' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save server settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace service' }))
    await waitFor(() => {
      expect(window.api.app.linuxHeadlessService.install).toHaveBeenLastCalledWith({
        pairingAddress: '10.0.2.15',
        port: 17688,
        overwriteExisting: true
      })
    })
  })

  it('uses a boolean switch to keep the service running outside Orca', async () => {
    window.api.app.linuxHeadlessService.getStatus = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      enabled: false,
      active: false,
      linger: true,
      pairingAddress: 'auto',
      port: 6768
    })
    render(
      <TooltipProvider>
        <LinuxHeadlessServiceSection />
      </TooltipProvider>
    )
    const toggle = await screen.findByRole('switch', { name: 'Keep server running outside Orca' })
    expect(toggle.className).toContain('disabled:opacity-100')
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(window.api.app.linuxHeadlessService.setRunning).toHaveBeenCalledWith(true)
      expect(toggle.getAttribute('data-state')).toBe('checked')
    })
  })

  it('keeps the configuration shortcut available when service installation is unsupported', async () => {
    render(
      <TooltipProvider>
        <HeadlessServerStatusSegment />
      </TooltipProvider>
    )
    const trigger = await screen.findByRole('button', {
      name: 'Headless server, Unavailable for this user'
    })
    expect(trigger.textContent).toContain('Headless')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Configure headless server…' }))
    expect(state.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'servers',
      repoId: null,
      sectionId: 'linux-headless-service'
    })
    expect(state.setActiveView).toHaveBeenCalledWith('settings')
  })

  it('shows a running state and boot option when the headless service is active', async () => {
    window.api.app.linuxHeadlessService.getStatus = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      enabled: true,
      active: true,
      linger: true,
      pairingAddress: 'auto',
      port: 6768
    })
    render(
      <TooltipProvider>
        <HeadlessServerStatusSegment />
      </TooltipProvider>
    )
    const trigger = await screen.findByRole('button', { name: 'Headless server, Running' })
    expect(trigger.className).not.toContain('bg-sky-')
    expect(trigger.className).not.toContain('bg-emerald-')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(
      await screen.findByRole('menuitemcheckbox', {
        name: 'Keep server running outside Orca (running now)'
      })
    ).toBeTruthy()
  })

  it('shows the status button as enabled while armed for after Orca closes', async () => {
    window.api.app.linuxHeadlessService.getStatus = vi.fn().mockResolvedValue({
      supported: true,
      installed: true,
      enabled: true,
      active: false,
      linger: true,
      pairingAddress: 'auto',
      port: 6768
    })
    render(
      <TooltipProvider>
        <HeadlessServerStatusSegment />
      </TooltipProvider>
    )
    const trigger = await screen.findByRole('button', { name: 'Headless server, Enabled' })
    expect(trigger.querySelector('span[aria-hidden="true"]')?.className).toContain('bg-foreground')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(
      (await screen.findByRole('menuitemcheckbox', { name: 'Keep server running outside Orca' }))
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('explains the account requirement at the destination and disables installation', async () => {
    render(
      <TooltipProvider>
        <LinuxHeadlessServiceSection />
      </TooltipProvider>
    )
    expect((await screen.findByRole('status')).textContent).toContain('normal user account')
    expect(
      (screen.getByRole('button', { name: 'Enable at boot' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('does not offer local systemd configuration in a paired web client', () => {
    state.paired = true
    const { container } = render(<LinuxHeadlessServiceSection />)
    expect(container.childElementCount).toBe(0)
    expect(window.api.app.linuxHeadlessService.getStatus).not.toHaveBeenCalled()
  })
})
