// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { RuntimeEnvironmentsPane } from './RuntimeEnvironmentsPane'

const state = vi.hoisted(() => ({
  settingsNavigationTarget: null,
  remoteServerUpdates: {},
  refreshRemoteServerUpdates: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./use-runtime-environment-catalog', () => ({
  useRuntimeEnvironmentCatalog: () => ({
    environments: [],
    detailsByEnvironmentId: {},
    mountedRef: { current: true }
  })
}))
vi.mock('./use-runtime-environment-connection-actions', () => ({
  useRuntimeEnvironmentConnectionActions: () => ({})
}))
vi.mock('./use-runtime-environment-mutation-actions', () => ({
  useRuntimeEnvironmentMutationActions: ({
    setAddServerFormOpen
  }: {
    setAddServerFormOpen: (open: boolean) => void
  }) => ({ closeAddServerForm: () => setAddServerFormOpen(false) })
}))
vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('./EphemeralVmRuntimesSection', () => ({ EphemeralVmRuntimesSection: () => null }))
vi.mock('./CloudVmSetupGuide', () => ({ CloudVmSetupGuide: () => null }))
vi.mock('./runtime-servers-connect-section', () => ({ RuntimeServersConnectSection: () => null }))
vi.mock('./runtime-active-server-section', () => ({ RuntimeActiveServerSection: () => null }))
vi.mock('./runtime-environment-dialogs', () => ({
  RuntimeEnvironmentRemoveDialog: () => null,
  RuntimeEnvironmentSwitchDialog: () => null
}))
vi.mock('./RuntimePairingUrlGenerator', () => ({ RuntimePairingUrlGenerator: () => null }))
vi.mock('./MachineNameField', () => ({ MachineNameField: () => null }))
vi.mock('./LinuxHeadlessServiceSection', () => ({
  LinuxHeadlessServiceSection: () => <div data-testid="headless-section" />
}))

afterEach(cleanup)
const settings = {} as GlobalSettings
const setPreference = vi.fn()

describe('headless settings navigation', () => {
  it('opens Share this host after the parent has consumed the navigation target', async () => {
    render(
      <RuntimeEnvironmentsPane
        settings={settings}
        setActiveRuntimeEnvironmentPreference={setPreference}
        headlessServiceIntentSignal={1}
      />
    )
    expect(await screen.findByTestId('headless-section')).toBeTruthy()
    expect(screen.getByTestId('headless-section').getAttribute('data-highlight')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Connect to a host/i }))
    await waitFor(() => expect(screen.queryByTestId('headless-section')).toBeNull())
  })

  it('overrides an open Connect form and handles another headless click', async () => {
    const pane = (signal: number) => (
      <RuntimeEnvironmentsPane
        settings={settings}
        setActiveRuntimeEnvironmentPreference={setPreference}
        addServerIntentSignal={1}
        headlessServiceIntentSignal={signal}
      />
    )
    const { rerender } = render(pane(0))
    expect(screen.queryByTestId('headless-section')).toBeNull()
    rerender(pane(1))
    expect(await screen.findByTestId('headless-section')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Connect to a host/i }))
    await waitFor(() => expect(screen.queryByTestId('headless-section')).toBeNull())
    rerender(pane(2))
    expect(await screen.findByTestId('headless-section')).toBeTruthy()
  })
})
