import userSelectOption from '../components/generic-menu'
import { notify, NotifyKind } from '../ui/notifications'
import userPrompt from '../components/generic-prompt'
import * as storage from '../support/local-storage'
import { action } from '../core/neovim'
import finder from '@medv/finder'

if (process.env.VEONIM_DEV) {

interface RecordingEvent {
  kind: string
  when: number
  offsetStart: number
  offsetPrevious: number
  selector: string
  event: Event
}

interface Record {
  name: string
  events: RecordingEvent[]
}

const KEY = {
  ALL: 'veonim-dev-recordings',
  ONE: 'veonim-dev-recording-',
}

const monitorEvents = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'change', 'focus', 'blur']

let recordedEvents = [] as RecordingEvent[]
let captureEvents = false
let lastRecordedAt = Date.now()
let recordingStartTime = Date.now()

action('record-start', () => {
  // TODO: show in ui instead of log
  console.warn('RECORD - START')

  recordedEvents = []
  lastRecordedAt = Date.now()
  recordingStartTime = Date.now()
  captureEvents = true
})

action('record-stop', async () => {
  // TODO: show in ui instead of log
  console.warn('RECORD - STOP')

  const events = cleanupRecControlEvents(recordedEvents)
  console.log('events', events)

  captureEvents = false
  const recordingName = await userPrompt('recording name')

  storage.setItem(`${KEY.ONE}${recordingName}`, { events, name: recordingName })

  const recordings = storage.getItem<string[]>(KEY.ALL, [])
  const uniqRecordings = new Set(recordings)
  uniqRecordings.add(recordingName)
  storage.setItem(KEY.ALL, [...uniqRecordings])

  notify(`saved "${recordingName}" to local storage`, NotifyKind.Success)
})

action('record-replay', async () => {
  const recordingName = await userSelectOption<string>({
    description: 'select recording to replay',
    options: getAllRecordings(),
  })

  const key = recordingName.replace(KEY.ONE, '')
  const { events } = storage.getItem<Record>(recordingName)
  if (!events || !events.length) return notify(`recording "${key}" does not exist`, NotifyKind.Error)

  notify(`replaying "${key}" recording`, NotifyKind.System)
  recordPlayer(events)
})

action('record-remove', async () => {
  const recording = await userSelectOption<string>({
    description: 'select recording to REMOVE',
    options: getAllRecordings(),
  })

  if (!recording) return

  const key = recording.replace(KEY.ONE, '')
  const recordings = storage.getItem<string[]>(KEY.ALL, [])
  const next = recordings.filter(m => m !== key)

  storage.setItem(KEY.ALL, next)
  storage.removeItem(recording)

  notify(`removed "${key}" recording`, NotifyKind.Success)
})

action('record-remove-all', async () => {
  const confirmation = await userPrompt('type "yes" to remove all recordings')
  if (confirmation !== 'yes') return notify('did NOT remove all recordings', NotifyKind.Error)

  storage
    .getItem<string[]>(KEY.ALL, [])
    .forEach(rec => storage.removeItem(`${KEY.ONE}${rec}`))

  storage.removeItem(KEY.ALL)

  notify('removed all recordings', NotifyKind.Success)
})

action('record-set-startup', async () => {
  const recordingName = await userSelectOption<string>({
    description: 'select recording for startup',
    options: getAllRecordings(),
  })

  const key = recordingName.replace(KEY.ONE, '')
  const { events } = storage.getItem<Record>(recordingName)
  notify(`set "${key}" as startup replay`, NotifyKind.System)

  // TODO: set as startup
  console.warn('NYI: set recorded events to run on startup', events)
})

const createEvent = (kind: string, event: Event) => {
  // InputEvent is still experimental - not widely supported but used in Chrome. No typings in TS lib
  if (kind.includes('input')) return new (window as any).InputEvent(kind, event)
  if (kind.includes('key')) return new KeyboardEvent(kind, event)
  else return new Event(kind, event)
}

const recordPlayer = (events: RecordingEvent[]) => {
  const replays = events.map(m => ({
    target: document.querySelector(m.selector),
    event: createEvent(m.kind, m.event),
    timeout: m.offsetStart,
  }))

  replays.filter(m => m.target).forEach(m => setTimeout(() => {
    m.target!.dispatchEvent(m.event)
  }, m.timeout))
}

const getAllRecordings = () => storage.getItem(KEY.ALL, []).map((m: string) => ({
  key: `${KEY.ONE}${m}`,
  value: m,
}))

monitorEvents.forEach(ev => window.addEventListener(ev, e => {
  if (!captureEvents) return

  console.log(e)

  recordedEvents.push({
    kind: e.type,
    when: Date.now(),
    offsetPrevious: Date.now() - lastRecordedAt,
    offsetStart: Date.now() - recordingStartTime,
    selector: finder(e.target as Element),
    event: evvy(e),
  })

  lastRecordedAt = Date.now()
}))

const cleanupRecControlEvents = (recordedEvents: RecordingEvent[]): RecordingEvent[] => {
  if (!recordedEvents.length) return recordedEvents
  const event1 = recordedEvents[0].event as KeyboardEvent
  const events = [...recordedEvents.filter(m => m)]

  if (event1.type === 'keyup' && event1.key === 'r') events.splice(0, 1)

  const eventsToRemove = [
    { key: 's', kind: 'keypress' },
    { key: 's', kind: 'keydown' },
    { key: 'r', kind: 'keypress' },
    { key: 'r', kind: 'keydown' },
    { key: ' ', kind: 'keyup' },
    { key: ' ', kind: 'keypress' },
    { key: ' ', kind: 'keydown' },
  ]

  eventsToRemove.forEach(criteria => {
    const found = findLast(events, ({ event }) => {
      const e = event as KeyboardEvent
      if (!e.key || !e.type) return false
      return e.key === criteria.key && e.type === criteria.kind
    })

    if (found > -1) events.splice(found, 1)
  })

  return events
}

const findLast = <T>(arr: T[], fn: (item: T) => any): number => {
  for (let ix = arr.length - 1; ix > 0; ix--) {
    if (!!fn(arr[ix])) return ix
  }
  return -1
}
  
const props = [
  'altKey', 'bubbles', 'cancelBubble', 'cancelable', 'charCode', 'code',
  'composed', 'ctrlKey', 'data', 'dataTransfer', 'defaultPrevented', 'detail',
  'eventPhase', 'inputType', 'isComposing', 'isTrusted', 'key', 'keyCode',
  'location', 'metaKey', 'repeat', 'returnValue', 'shiftKey', 'type', 'which',
]

const evvy = (eo: any) => props.reduce((res, prop) => Object.assign(res, { [prop]: eo[prop] }), {}) as Event
}
