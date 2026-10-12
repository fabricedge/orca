/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { CopyTabMenuItems } from './CopyTabMenuItems'

const mocks = vi.hoisted(() => ({ describe: vi.fn(), write: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./workspace-tab-location', () => ({ describeTabLocation: mocks.describe }))

beforeEach(() => {
  mocks.write.mockResolvedValue(undefined)
  mocks.describe.mockReturnValue({ tabs: [{ tabId: 'clicked-tab', groupId: 'g2' }] })
  vi.stubGlobal('api', { ui: { writeClipboardText: mocks.write } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function renderMenu() {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Tab actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <CopyTabMenuItems unifiedTabId="clicked-tab" groupId="g2" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('split tab copy control', () => {
  it('explains the agent context on hover without copying anything', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.hover(screen.getByRole('menuitem', { name: 'Copy Tab Details' }))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toContain(
      'Use Details to include its position and workspace layout.'
    )
    expect(mocks.write).not.toHaveBeenCalled()
  })

  it('copies the normal reference without reading detailed information', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Tab ID' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith('orcaTabId: clicked-tab'))
    expect(mocks.describe).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('copies details from the right-hand hint without copying the normal reference', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Tab Details' }))
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1))
    expect(mocks.describe).toHaveBeenCalledExactlyOnceWith('clicked-tab', 'g2')
    expect(JSON.parse(mocks.write.mock.calls[0][0])).toEqual({
      tabs: [{ tabId: 'clicked-tab', groupId: 'g2' }]
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('lets the keyboard reach and activate detailed copy', async () => {
    const user = userEvent.setup()
    renderMenu()
    screen.getByRole('menuitem', { name: 'Copy Tab ID' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Copy Tab Details' }))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mocks.describe).toHaveBeenCalledExactlyOnceWith('clicked-tab', 'g2'))
    expect(mocks.write).toHaveBeenCalledTimes(1)
  })
})
