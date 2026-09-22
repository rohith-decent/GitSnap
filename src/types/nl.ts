export type NlOpType =
  | 'switchBranch'
  | 'createBranch'
  | 'deleteBranch'
  | 'undoLastCommit'
  | 'fetchAll'
  | 'showLog'
  | 'stash';

export interface NlOperation {
  op: NlOpType;
  args: Record<string, any>;
  description: string;
  requiresConfirmation?: boolean;
}

export interface NlPlan {
  userPrompt: string;
  commands: NlOperation[];
}

export interface NlHistoryEntry {
  timestamp: string;
  userPrompt: string;
  commands: NlOperation[];
  executed: boolean;
}
