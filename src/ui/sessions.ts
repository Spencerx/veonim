import { on, attach, switchTo, create } from '../neovim'
import { pub } from '../dispatch'
import { remote } from 'electron'

interface Vim { id: number, name: string, active: boolean, path: string }
const vims = new Map<number, Vim>()
const onReady = new Set<Function>()
const notifyReady = () => onReady.forEach(cb => cb())
export enum Session {
  create = 'session:create',
  switch = 'session:switch',
}

export default (id: number, path: string) => {
  vims.set(id, { id, path, name: 'main', active: true })
  notifyReady()
  pub(Session.create, { id, path })
}

export const onVimCreate = (fn: Function) => onReady.add(fn)

export const createVim = async (name: string, nameAfterDir = false) => {
  const { id, path } = await create({ askCd: nameAfterDir })
  attach(id)
  switchTo(id)
  vims.forEach(v => v.active = false)
  vims.set(id, { id, path, name, active: true })
  notifyReady()
  pub(Session.create, { id, path })
}

export const switchVim = async (id: number) => {
  if (!vims.has(id)) return
  switchTo(id)
  vims.forEach(v => v.active = false)
  vims.get(id)!.active = true
  pub(Session.switch, id)
}

export const renameVim = (id: number, newName: string) => {
  if (!vims.has(id)) return
  vims.get(id)!.name = newName
}

export const getNameForSession = (id: number) => vims.has(id) && vims.get(id)!.name

export const getCurrentName = () => {
  const active = [...vims.values()].find(v => v.active)
  return active ? active.name : ''
}

export const renameCurrent = (name: string) => {
  const active = [...vims.values()].find(v => v.active)
  if (!active) return
  renameVim(active.id, name)
}

export const list = () => [...vims.values()].filter(v => !v.active).map(v => ({ id: v.id, name: v.name }))

on.exit((id: number) => {
  if (!vims.has(id)) return
  vims.delete(id)
  if (!vims.size) return remote.app.quit()

  const next = Math.max(...vims.keys())
  switchVim(next)
})
