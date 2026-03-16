export interface RawSessionRecord {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  cwd: string;
  pid: number;
}

export interface RawTurnRecord {
  timestamp: string;
  type: string;
  thread_id: string;
  turn_id: string;
  input_preview: string;
  output_preview: string;
}

export interface RawOutcomeRecord {
  timestamp: string;
  agent_type: string;
  model: string;
  outcome: 'success' | 'failure';
  pattern_used?: string;
  skill?: string;
  description?: string;
  error_summary?: string;
}
