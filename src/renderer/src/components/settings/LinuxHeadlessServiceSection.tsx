import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { Switch } from '../ui/switch'
import { AddressPicker, type AddressOption } from '../network/AddressPicker'
import { parseServerShareAddress } from '../../../../shared/network/server-share-address'
import {
  LINUX_HEADLESS_SERVICE_UNIT_EXISTS_ERROR,
  type LinuxHeadlessServiceSnapshot
} from '../../../../shared/linux-headless-service'
import { cn } from '@/lib/utils'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'

const unavailable: LinuxHeadlessServiceSnapshot = {
  supported: false,
  installed: false,
  enabled: false,
  active: false,
  linger: false,
  pairingAddress: null,
  port: null
}

export function LinuxHeadlessServiceSection(): React.JSX.Element | null {
  const [status, setStatus] = useState(unavailable)
  const [address, setAddress] = useState('auto')
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>(
    []
  )
  const [refreshingAddresses, setRefreshingAddresses] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [port, setPort] = useState('6768')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overwritePrompt, setOverwritePrompt] = useState(false)
  const refreshAddresses = useCallback(async (showError = false): Promise<void> => {
    setRefreshingAddresses(true)
    setAddressError(null)
    try {
      const result = await window.api.mobile.listNetworkInterfaces()
      setNetworkInterfaces(result.interfaces)
    } catch (cause) {
      if (showError) {
        setAddressError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      setRefreshingAddresses(false)
    }
  }, [])

  useEffect(() => {
    if (isPairedWebClientWindow() || window.api.platform.get().platform !== 'linux') {
      return
    }
    let mounted = true
    void window.api.app.linuxHeadlessService
      .getStatus()
      .then((snapshot) => {
        if (mounted) {
          setStatus(snapshot)
          if (snapshot.installed) {
            setAddress(snapshot.pairingAddress ?? 'auto')
            setPort(String(snapshot.port ?? 6768))
          }
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (mounted) {
          setLoaded(true)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!isPairedWebClientWindow() && window.api.platform.get().platform === 'linux') {
      void refreshAddresses()
    }
  }, [refreshAddresses])

  if (isPairedWebClientWindow() || window.api.platform.get().platform !== 'linux') {
    return null
  }

  const run = async (action: () => Promise<LinuxHeadlessServiceSnapshot>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (message.includes(LINUX_HEADLESS_SERVICE_UNIT_EXISTS_ERROR)) {
        setOverwritePrompt(true)
      } else {
        setError(message)
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  const addressOptions: AddressOption[] = [
    { value: 'auto', label: 'Automatic (Tailscale, then LAN)' },
    ...networkInterfaces.map((networkInterface) => ({
      value: networkInterface.address,
      label: `${networkInterface.name} (${networkInterface.address})`
    }))
  ]
  const configurationChanged =
    status.installed &&
    (address !== (status.pairingAddress ?? 'auto') || Number(port) !== (status.port ?? 6768))

  return (
    <section
      id="linux-headless-service"
      className={cn('space-y-3 rounded-lg border border-border/60 p-3')}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Run Orca headless 24/7</h3>
        <p className="text-xs text-muted-foreground">
          Install a user systemd service so Orca can start at boot and keep running after logout. It
          uses this Linux account and its Orca data. If Xvfb is missing, Orca asks for admin
          approval to install it when you activate the service.
        </p>
        <p className="text-xs text-muted-foreground">
          Enabling background login asks for administrator authorization once. Use a private network
          address, such as Tailscale, for client connections.
        </p>
      </div>
      {loaded && !status.supported && !error ? (
        <p role="status" className="text-xs text-muted-foreground">
          The 24/7 service requires Linux and a normal user account. If you are running as root,
          close Orca and open it as your normal user.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <div className="space-y-1 text-xs">
          <label htmlFor="linux-headless-connection-address" className="font-medium">
            Connection address
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <AddressPicker
              id="linux-headless-connection-address"
              className="min-w-[240px] max-w-full"
              triggerAriaLabel="Connection address"
              options={addressOptions}
              value={address}
              valueIsCustom={
                address !== 'auto' &&
                !networkInterfaces.some((networkInterface) => networkInterface.address === address)
              }
              onValueChange={setAddress}
              formatCustomLabel={(value) => `${value} (custom)`}
              addCustomLabel="Use custom address…"
              customDialogCopy={{
                title: 'Custom connection address',
                description:
                  'Advertise an address another device can reach — a LAN or Tailscale host, or a full ws(s):// URL.',
                inputLabel: 'Custom address',
                placeholder: 'host, host:port, or wss://host/path',
                hint: 'Enter a host, host:port, or a ws(s):// URL.',
                cancel: 'Cancel',
                confirm: 'Use address'
              }}
              validateCustom={parseServerShareAddress}
              customInputId="linux-headless-custom-address"
              placeholder=""
              disabled={busy || !status.supported}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void refreshAddresses(true)}
                  disabled={refreshingAddresses}
                  aria-label="Refresh connection addresses"
                  className="text-muted-foreground"
                >
                  <RefreshCw className={refreshingAddresses ? 'animate-spin' : ''} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                Refresh connection addresses
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground">
            Automatic prefers Tailscale. Choose an address to advertise a specific network path.
          </p>
          {addressError ? <p role="alert" className="text-destructive">{addressError}</p> : null}
        </div>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Port</span>
          <Input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(event.currentTarget.value)}
            disabled={busy || !status.supported}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Status:{' '}
        {!loaded
          ? 'checking…'
          : !status.supported
            ? 'unavailable'
            : status.active
              ? 'running'
              : status.enabled
                ? 'enabled; starts at boot'
                : status.installed
                  ? 'installed; disabled'
                  : 'not installed'}
        {status.installed && !status.linger ? ' · background login is not enabled' : ''}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!status.installed ? (
          <Button
            size="sm"
            disabled={busy || !port || !status.supported}
            onClick={() =>
              void run(() =>
                window.api.app.linuxHeadlessService.install({
                  pairingAddress: address.trim() || 'auto',
                  port: Number(port)
                })
              )
            }
          >
            {busy ? 'Preparing headless server…' : 'Enable at boot'}
          </Button>
        ) : (
          <>
            <div className="flex w-full items-center justify-between gap-4 rounded-md border border-border/50 px-3 py-2">
              <div className="space-y-0.5">
                <label htmlFor="linux-headless-keep-running" className="text-sm font-medium">
                  Keep server running outside Orca
                </label>
                <p className="text-xs text-muted-foreground">
                  Starts after Orca closes and at boot. Turning it off stops the service.
                </p>
              </div>
              <Switch
                id="linux-headless-keep-running"
                checked={status.enabled && status.linger}
                disabled={busy || !status.supported}
                className="disabled:opacity-100"
                onCheckedChange={(enabled) =>
                  void run(() => window.api.app.linuxHeadlessService.setRunning(enabled))
                }
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !status.supported || !configurationChanged}
              onClick={() =>
                void run(() =>
                  window.api.app.linuxHeadlessService.install({
                    pairingAddress: address,
                    port: Number(port)
                  })
                )
              }
            >
              Save server settings
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => window.api.app.linuxHeadlessService.remove())}
            >
              Remove service
            </Button>
          </>
        )}
      </div>
      <Dialog open={overwritePrompt} onOpenChange={setOverwritePrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Headless service already exists</DialogTitle>
            <DialogDescription>
              A systemd user service named <code>orca-serve.service</code> already exists. Replace
              its unit file with Orca’s configuration? This may stop the service that is currently
              running.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverwritePrompt(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(() =>
                  window.api.app.linuxHeadlessService.install({
                    pairingAddress: address.trim() || 'auto',
                    port: Number(port),
                    overwriteExisting: true
                  })
                ).then((installed) => {
                  if (installed) {
                    setOverwritePrompt(false)
                  }
                })
              }
            >
              {busy ? 'Replacing…' : 'Replace service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {status.installed ? (
        <p className="text-xs text-muted-foreground">
          The headless service and desktop app share one profile. With the switch enabled, Orca
          starts the service automatically after the desktop closes and releases its profile. You
          can also start it manually with <code>systemctl --user start orca-serve.service</code>.
          Stopping, restarting, or removing a running service ends its active terminals and agent
          processes. The service logs contain the pairing URL; keep it private.
        </p>
      ) : null}
    </section>
  )
}
