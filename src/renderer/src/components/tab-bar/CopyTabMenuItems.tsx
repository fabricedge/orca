import { CopyTabIdMenuItem } from './CopyTabIdMenuItem'
import { CopyTabDetailsMenuItem } from './CopyTabDetailsMenuItem'

export function CopyTabMenuItems({
  unifiedTabId,
  groupId
}: {
  unifiedTabId: string
  groupId: string
}): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-stretch rounded-md border border-border">
            <div className="min-w-0 flex-1">
              <CopyTabIdMenuItem unifiedTabId={unifiedTabId} />
            </div>
            <div className="border-l border-border">
              <CopyTabDetailsMenuItem unifiedTabId={unifiedTabId} groupId={groupId} compact />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs whitespace-normal">
            {translate(
              'components.tab.bar.CopyTabMenuItems.agentContext',
              'Share the copied tab ID with an AI agent to identify this tab. Use Details to include its position and workspace layout.'
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
