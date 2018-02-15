import { merge, CreateTask, requireDir, log, delay as timeout } from '../support/utils'
import { resize, attachTo, create } from '../core/master-control'
import * as canvasContainer from '../core/canvas-container'
import configReader from '../config/config-reader'
import { store } from '../state/trade-federation'
import setDefaultSession from '../core/sessions'
import { sub } from '../messaging/dispatch'
import { h, renderDom } from '../ui/coffee'
import * as windows from '../core/windows'
import * as uiInput from '../core/input'
import { Provider } from 'react-redux'
import { remote } from 'electron'
import '../ui/notifications'
import '../core/render'
import '../core/title'

const lazyLoadCSS = (href: string) => {
  const css = document.createElement('link')
  merge(css, { href, rel: 'stylesheet', type: 'text/css' })
  document.head.appendChild(css)
}

const loadingConfig = CreateTask()

configReader('nvim/init.vim', c => {
  canvasContainer.setFont({
    face: c.get('font'),
    size: c.get('font_size')-0,
    lineHeight: c.get('line_height')-0
  })

  loadingConfig.done('')
})

sub('colors.vim.bg', color => {
  if (document.body.style.background !== color) document.body.style.background = color
})

canvasContainer.on('resize', ({ rows, cols }) => {
  resize(cols, rows)
  setImmediate(() => windows.render())
})

const main = async () => {
  const { id, path } = await create()
  await Promise.race([ loadingConfig.promise, timeout(500) ])
  resize(canvasContainer.size.cols, canvasContainer.size.rows)
  uiInput.focus()
  attachTo(id)
  setDefaultSession(id, path)
  remote.getCurrentWindow().show()

  setTimeout(() => {
    lazyLoadCSS('../assets/seti-icons.css')
    requireDir(`${__dirname}/../services`)
    requireDir(`${__dirname}/../components`)
    setTimeout(() => require('../core/ai'))

    const targetEl = document.getElementById('plugins') as HTMLElement
    const { default: hover } = require('../components/hover2')

    const components = [
      hover,
    ]

    renderDom(h(Provider, { store }, components), targetEl)
  }, 1)
}

main().catch(log)

export const touched = () => {
  const start = document.getElementById('start')
  if (start) start.remove()
}
