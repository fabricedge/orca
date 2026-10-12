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
          <div className="grid grid-cols-2 gap-1">
            <CopyTabIdMenuItem unifiedTabId={unifiedTabId} />
            <CopyTabDetailsMenuItem unifiedTabId={unifiedTabId} groupId={groupId} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs whitespace-normal">
            {translate(
              'components.tab.bar.CopyTabMenuItems.agentContext',
              'Share with an AI agent to identify this tab. Details include its position and workspace layout.'
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
