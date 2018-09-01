import { VimMode, BufferType } from '../neovim/types'
import { EventEmitter } from 'events'

type StateKeys = keyof NeovimState
type WatchState = { [Key in StateKeys]: (fn: (value: NeovimState[Key]) => void) => void }
type UntilStateValue = {
  [Key in StateKeys]: {
    is: (value: NeovimState[Key]) => Promise<NeovimState[Key]>
  }
}

const initialState = {
  background: '#2d2d2d',
  foreground: '#dddddd',
  special: '#ef5188',
  mode: VimMode.Normal,
  bufferType: BufferType.Normal,
  absoluteFilepath: '',
  file: '',
  filetype: '',
  cwd: '',
  colorscheme: '',
  revision: -1,
  line: 0,
  column: 0,
  editorTopLine: 0,
  editorBottomLine: 0,
}

export type NeovimState = typeof state

export default (name: string) => {
  const watchers = new EventEmitter()
  const stateChangeFns = new Set<Function>()

  const watch: WatchState = new Proxy(Object.create(null), {
    get: (_, key: string) => (fn: (value: any) => void) => watchers.on(key, fn),
  })

  const onStateChange = (fn: (nextState: NeovimState, key: string, value: any, previousValue: any) => void) => {
    stateChangeFns.add(fn)
  }

  const untilStateValue: UntilStateValue = new Proxy(Object.create(null), {
    get: (_, key: string) => ({ is: (watchedValue: any) => new Promise(done => {
      const callback = (newValue: any) => {
        if (newValue === watchedValue) return
        done(newValue)
        watchers.removeListener(key, callback)
      }

      watchers.on(key, callback)
    }) }),
  })

  const notifyStateChange = (nextState: NeovimState, key: string, value: any, previousValue: any) => {
    watchers.emit(key, value, previousValue)
    stateChangeFns.forEach(fn => fn(nextState, key, value, previousValue))
  }

  default new Proxy(state, {
    set: (_, key: string, val: any) => {
      const currentVal = Reflect.get(state, key)
      if (currentVal === val) return true

      const nextState = { ...state, [key]: val }

      Reflect.set(state, key, val)
      notifyStateChange(nextState, key, val, currentVal)

      return true
    }
  })

  if (process.env.VEONIM_DEV) {
    // assumes we are also using hyperapp-redux-devtools
    // we are gonna steal the modules from ^^^
    const { createStore } = require('redux')
    const { composeWithDevTools } = require('redux-devtools-extension')

    const composeEnhancers = composeWithDevTools({ name: 'neovim-state' })
    const reducer = (state: any, action: any) => ({ ...state, ...action.payload })
    const store = createStore(reducer, state, composeEnhancers())

    store.subscribe(() => Object.assign(state, store.getState()))
    onStateChange((_, key, val) => {
      store.dispatch({ type: `SET::${key}`, payload: { [key]: val } })
    })
  }
}
