export type AgentAction =
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'rename'
  | 'prompt_start'
  | 'agent_stop'
  | 'session_end'
  | 'event_log_boundary' // synthetic — inserted between JSONL files during distill
  | 'shell'
  | 'mcp_query' // MCP tool invocation

export type AgentName = 'cursor' | 'claude-code' | 'copilot'

export interface AgentEvent {
  id: string
  timestamp: string
  sessionId: string
  agent: AgentName
  action: AgentAction
  path?: string
  relativePath?: string
  extension?: string
  directory?: string
  projectName: string
  previousPath?: string // renames only
  task?: string // prompt_start only
  generationId?: string // cursor generation_id when available
  duration_ms?: number // session_end only
  reason?: string // session_end only
  command?: string // shell only
  tool?: string // mcp_query — tool name (get_task_context, get_hot_files, etc)
  input?: string // mcp_query — main input argument (path for file_history/co_accessed, empty for hot_files)
  filesReturned?: string[] // mcp_query — files returned by get_task_context
  returnCount?: number // mcp_query — count of items returned
}

export type TaskProvenance = 'user' | 'mixed'

export interface PromptWindow {
  id: string
  task?: string // full text from events only; omitted from moat.json
  timestamp: string
  sessionId: string
  agent: AgentName // agent that generated this prompt
  files: string[] // relative paths of files read/written after this prompt_start
  taskProvenance?: TaskProvenance // user = clean prompt; mixed = pasted assistant content
  taskExcerpt?: string // ~200 chars of matching text after provenance trimming
  taskKeywords?: string[] // significant terms from matching text
  windowQuality?: WindowQuality // meta/low/high — used to filter retrieval noise
  pathsInTask?: string[] // file paths regex-extracted from task text at distill time
  pathsInTaskNormalized?: string[] // pathsInTask resolved to full project-relative paths
}

export type WindowQuality = 'high' | 'low' | 'meta'

export interface TaskFileSet {
  id: string
  files: string[]
  pathsInTask: string[]
  windowIds: string[]
  occurrences: number
  lastSeen: string
}

export interface FileProfile {
  relativePath: string
  agents: AgentName[] // agents that touched this file, deduplicated
  writeCount: number
  createCount: number
  deleteCount: number
  totalEvents: number
  sessionsAppeared: number
  firstSeen: string
  lastSeen: string
  coAccessedWith: CoAccessedEntry[]
  readCount?: number
  readWriteRatio?: number
  typicallyAccessedBefore?: string[]
}

export interface CoAccessedEntry {
  path: string
  /** Distinct prompt windows where both files co-occur. */
  support: number
}

export interface Session {
  id: string
  startedAt: string
  endedAt?: string
  agent: AgentName
  eventCount: number
  filesRead: string[]
  filesWritten: string[]
}

export interface MoatDataHealth {
  readsCaptured: boolean
  windowCounts: Record<WindowQuality, number>
}

export interface Moat {
  _generated: string
  _version: string
  scope: string
  projectName: string
  generatedAt: string
  generatedFrom: string
  totalEvents: number
  totalSessions: number
  dataHealth: MoatDataHealth
  hotFiles: FileProfile[]
  sessions: Session[]
  extensionBreakdown: Record<string, number>
  promptWindows: PromptWindow[]
  taskFileSets: TaskFileSet[]
}

export interface MoatlogConfig {
  projectRoot: string
  logDir: string
  projectName: string
  ignore: string[]
  sessionTimeoutMs: number
}

export const DEFAULT_CONFIG: Omit<MoatlogConfig, 'projectRoot' | 'logDir' | 'projectName'> = {
  ignore: [
    'node_modules',
    '.git',
    '.moatlog',
    'dist',
    'build',
    '.next',
    '*.log',
    '*.jsonl'
  ],
  sessionTimeoutMs: 30 * 60 * 1000 // 30 min gap = new session
}
