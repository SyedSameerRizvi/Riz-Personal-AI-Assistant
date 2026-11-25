import { Database, FilePen, FileText, type LucideIcon, Search, Terminal, Trash2 } from 'lucide-react'

export const TOOL_META: Record<string, { title: string; done: string; icon: LucideIcon }> = {
  read_file: { title: 'Read file', done: 'Read file', icon: FileText },
  write_file: { title: 'Write file', done: 'Wrote file', icon: FilePen },
  delete_file: { title: 'Delete file', done: 'Deleted file', icon: Trash2 },
  run_command: { title: 'Run command', done: 'Ran command', icon: Terminal },
  recall_memory: { title: 'Search memory', done: 'Searched memory', icon: Search },
  save_memory: { title: 'Save to memory', done: 'Saved to memory', icon: Database },
}

export function toolMeta(tool: string) {
  return TOOL_META[tool] ?? { title: tool, done: tool, icon: Terminal }
}

/** The one argument worth showing: a path, a command or a search. */
export function toolTarget(tool: string, args: Record<string, string>): string {
  if (tool === 'run_command') return args.command ?? ''
  if (tool === 'recall_memory') return args.query ?? ''
  if (tool === 'save_memory') return args.text ?? ''
  return args.path ?? ''
}
