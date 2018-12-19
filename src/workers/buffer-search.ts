import TextDocumentManager from '../neovim/text-document-manager'
import { filter as fuzzy, match } from 'fuzzaldrin-plus'
import { on } from '../messaging/worker-client'
import nvim from '../neovim/api'

const tdm = TextDocumentManager(nvim)

interface FilterResult {
  line: string,
  start: {
    line: number,
    column: number,
  },
  end: {
    line: number,
    column: number,
  }
}

const buffers = new Map<string, string[]>()

const getLocations = (str: string, query: string, buffer: string[]) => {
  const line = buffer.indexOf(str)
  const locations = match(str, query)

  return {
    start: { line, column: locations[0] },
    end: { line, column: locations[locations.length - 1] },
  }
}

const asFilterResults = (results: string[], lines: string[], query: string): FilterResult[] => [...new Set(results)]
  .map(m => ({
    line: m,
    ...getLocations(m, query, lines),
  }))

tdm.on.didOpen(({ name, textLines }) => buffers.set(name, textLines))
tdm.on.didClose(({ name }) => buffers.delete(name))
tdm.on.didChange(({ name, textLines, firstLine, lastLine }) => {
  const buf = buffers.get(name) || []
  const affectAmount = lastLine - firstLine
  buf.splice(firstLine, affectAmount, ...textLines)
})

on.fuzzy(async (file: string, query: string, maxResults = 20): Promise<FilterResult[]> => {
  const bufferData = buffers.get(file) || []
  const results = fuzzy(bufferData, query, { maxResults })
  return asFilterResults(results, bufferData, query)
})

on.visibleFuzzy(async (query: string): Promise<FilterResult[]> => {
  const { editorTopLine: start, editorBottomLine: end } = nvim.state
  const visibleLines = await nvim.current.buffer.getLines(start, end)
  const results = fuzzy(visibleLines, query)
  return asFilterResults(results, visibleLines, query)
})
