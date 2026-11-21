import { assert, mount, test } from 'orca/testing'
import * as panel from './panel'

test('submits a recurring task and clears the brief for blank input', async () => {
  const view = await mount(panel)
  const field = { label: 'Recurring task' }
  await view.type(field, 'Every Friday, summarize terminal logs.', { replace: true })
  await view.press({ text: 'Generate brief' })
  assert.ok(view.find({ text: 'Every Friday' }))
  assert.ok(view.find({ text: 'terminal.list, terminal.read' }))
  assert.ok(view.find({ text: /one matching output line per finding/ }))
  await view.type(field, '   ', { replace: true })
  await view.press({ text: 'Generate brief' })
  assert.ok(view.find({ text: 'Enter a recurring task.' }))
  assert.ok(!view.find({ text: 'Every Friday' }))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})
