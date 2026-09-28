import { useCallback, useEffect, useState } from 'react'
import { Server, ServerOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { LinuxHeadlessServiceSnapshot } from '../../../../shared/linux-headless-service'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'

const UNSUPPORTED_STATUS: LinuxHeadlessServiceSnapshot = {
  supported: false,
  installed: false,
  enabled: false,
  active: false,
  linger: false,
  pairingAddress: null,
  port: null
}

export function HeadlessServerStatusSegment({
  iconOnly = false
}: {
  iconOnly?: boolean
}): React.JSX.Element | null {
  const setActiveView = useAppStore((state) => state.setActiveView)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const [status, setStatus] = useState(UNSUPPORTED_STATUS)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (window.api.platform.get().platform !== 'linux') {
      return
    }
    try {
      setStatus(await window.api.app.linuxHeadlessService.getStatus())
    } catch {
      setStatus(UNSUPPORTED_STATUS)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const update = async (): Promise<void> => {
      if (window.api.platform.get().platform !== 'linux') {
        return
      }
      try {
        const snapshot = await window.api.app.linuxHeadlessService.getStatus()
        if (mounted) {
          setStatus(snapshot)
        }
      } catch {
        if (mounted) {
          setStatus(UNSUPPORTED_STATUS)
        }
      } finally {
        if (mounted) {
          setLoaded(true)
        }
      }
    }
    void update()
    const timer = window.setInterval(() => void update(), 15_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  if (window.api.platform.get().platform !== 'linux') {
    return null
  }

  const configuredToRun = status.installed && status.enabled && status.linger
  const statusText = !loaded
    ? translate('auto.components.status.bar.HeadlessServerStatusSegment.checking', 'Checking…')
    : !status.supported
      ? translate(
          'auto.components.status.bar.HeadlessServerStatusSegment.unavailable',
          'Unavailable for this user'
        )
      : status.active
        ? translate('auto.components.status.bar.HeadlessServerStatusSegment.running', 'Running')
        : configuredToRun
          ? translate('auto.components.status.bar.HeadlessServerStatusSegment.starting', 'Enabled')
          : translate('auto.components.status.bar.HeadlessServerStatusSegment.stopped', 'Stopped')
  const title = translate(
    'auto.components.status.bar.HeadlessServerStatusSegment.title',
    'Headless server'
  )
  const openSetup = (): void => {
    openSettingsTarget({ pane: 'servers', repoId: null, sectionId: 'linux-headless-service' })
    setActiveView('settings')
  }
  const setEnabled = async (enabled: boolean): Promise<void> => {
    setBusy(true)
    try {
      if (enabled && !status.linger) {
        await window.api.app.linuxHeadlessService.enableBackgroundLogin()
      }
      setStatus(await window.api.app.linuxHeadlessService.setRunning(enabled))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      void refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
              aria-label={`${title}, ${statusText}`}
            >
              {configuredToRun ? (
                <Server className={`size-3 ${status.active ? 'text-foreground' : ''}`} />
              ) : (
                <ServerOff className="size-3" />
              )}
              {!iconOnly ? <span className="text-[11px] font-medium">Headless</span> : null}
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${
                  configuredToRun ? 'bg-foreground' : 'bg-muted-foreground/40'
                }`}
              />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {`${title} · ${statusText}`}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        side="top"
        align="end"
        sideOffset={8}
        className="w-72"
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>{title}</span>
          <span className="font-normal text-muted-foreground">{statusText}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {status.installed ? (
          <DropdownMenuCheckboxItem
            checked={configuredToRun}
            disabled={busy || !status.supported}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') {
                void setEnabled(checked)
              }
            }}
          >
            {status.active
              ? translate(
                  'auto.components.status.bar.HeadlessServerStatusSegment.runningKeepAtBoot',
                  'Keep server running outside Orca (running now)'
                )
              : translate(
                  'auto.components.status.bar.HeadlessServerStatusSegment.keepRunning',
                  'Keep server running outside Orca'
                )}
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuItem onSelect={openSetup}>
          {translate(
            'auto.components.status.bar.HeadlessServerStatusSegment.configure',
            'Configure headless server…'
          )}
        </DropdownMenuItem>
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {translate(
            'auto.components.status.bar.HeadlessServerStatusSegment.description',
            'Runs as a Linux systemd service after Orca closes and at startup. Configure the service in Remote Orca Servers.'
          )}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
