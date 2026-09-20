import { useCallback, useState } from 'react'

export type OrganizeMode = 'list' | 'book'

const KEY = 'glassbox.notesOrganize.v1'

/* Every note in one place is the mode that cannot lose anything, so it is what
   a reader who has never chosen gets. */
const DEFAULT_MODE: OrganizeMode = 'list'

const isMode = (value: unknown): value is OrganizeMode =>
  value === 'list' || value === 'book'

export const readOrganizeMode = (): OrganizeMode => {
  try {
    const stored = localStorage.getItem(KEY)
    /* A value written by a future version, or a half-written one, falls back
       rather than throwing. Losing the preference costs a click. Throwing here
       would take the whole rail down with it. */
    return isMode(stored) ? stored : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

const writeOrganizeMode = (mode: OrganizeMode): void => {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Non-fatal. The mode still holds for this session.
  }
}

/**
 * How the rail arranges notes and books. Deliberately kept out of the notes
 * folder: it is a display choice for this machine, and writing it to disk
 * would sync it between machines and show up in a diff of the library.
 */
export const useNoteOrganize = (): [OrganizeMode, (mode: OrganizeMode) => void] => {
  const [mode, setMode] = useState<OrganizeMode>(readOrganizeMode)

  const choose = useCallback((next: OrganizeMode) => {
    setMode(next)
    writeOrganizeMode(next)
  }, [])

  return [mode, choose]
}
