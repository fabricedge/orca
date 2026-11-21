import { atom, Button, Heading, Input, Stack, Text, read, set } from 'orca'

const example = atom('')
const submitted = atom<string | null>(null)

function brief(task: string) {
  const trigger = task.match(/^(when(?:ever)?|after|before|every|each)\b[^,;]+(?=[,;])/i)?.[0]
  const tools = []
  const criteria = []
  if (/\bagents?\b/i.test(task)) {
    tools.push('agents.list')
    criteria.push(
      'Account for every matching agent in the workspace, including a zero-match result.'
    )
  }
  if (/\b(logs?|terminals?|output)\b/i.test(task)) {
    tools.push('terminal.list', 'terminal.read')
    criteria.push('Cite one terminal and one matching output line per finding.')
  }
  if (/\b(alert|notify|notification)\b/i.test(task)) {
    tools.push('notifications.show')
    criteria.push('Deliver one notification per matching occurrence.')
  }
  return {
    trigger: trigger ?? `Run on demand for “${task}”.`,
    tools: tools.length
      ? tools.join(', ')
      : 'workspace.readContext (workspace context); confirm task-specific integrations.',
    criteria: criteria.length
      ? criteria.join(' ')
      : `Record one completion result or one actionable failure per run of “${task}”.`
  }
}

export default function Panel() {
  const task = read(submitted)
  const result = task ? brief(task) : null
  const generate = () => set(submitted, read(example).trim())
  return (
    <Stack gap="md">
      <Input
        label="Recurring task"
        placeholder="When an agent finishes, notify me."
        value={read(example)}
        onChange={(value) => {
          set(example, value)
          set(submitted, null)
        }}
        onSubmit={generate}
      />
      <Button onPress={generate}>Generate brief</Button>
      {task === '' ? <Text>Enter a recurring task.</Text> : null}
      {result ? (
        <Stack gap="sm">
          <Heading>Trigger</Heading>
          <Text>{result.trigger}</Text>
          <Heading>Required Orca tools</Heading>
          <Text>{result.tools}</Text>
          <Heading>Success criteria</Heading>
          <Text>{result.criteria}</Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
