import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { describeTabLocation } from './workspace-tab-location'

export function CopyTabDetailsMenuItem({
  unifiedTabId,
  groupId,
  compact = false
}: {
  unifiedTabId: string
  groupId: string
  compact?: boolean
}): React.JSX.Element {
  const copyDetails = async (): Promise<void> => {
    try {
      const details = describeTabLocation(unifiedTabId, groupId)
      await window.api.ui.writeClipboardText(JSON.stringify(details, null, 2))
      toast.success(
        translate('components.tab.bar.CopyTabDetailsMenuItem.copied', 'Detailed tab ID copied'),
        { position: 'bottom-right' }
      )
    } catch {
      toast.error(
        translate('components.tab.bar.CopyTabDetailsMenuItem.failed', 'Could not copy tab details')
      )
    }
  }
  return (
    <DropdownMenuItem
      aria-label={translate('components.tab.bar.CopyTabDetailsMenuItem.copy', 'Copy Tab Details')}
      onSelect={() => void copyDetails()}
    >
      {!compact && <Copy className="size-3.5" />}
      {compact
        ? translate('components.tab.bar.CopyTabDetailsMenuItem.details', 'Details')
        : translate('components.tab.bar.CopyTabDetailsMenuItem.copy', 'Copy Tab Details')}
    </DropdownMenuItem>
  )
}
