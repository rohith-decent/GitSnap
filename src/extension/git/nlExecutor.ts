import {
  switchBranch,
  createBranch,
  deleteBranch,
  undoLastCommit,
  fetchAll,
  getLog,
  stash,
} from './index';
import type { NlOperation } from '../../types/nl';

export async function executeNlOperation(op: NlOperation): Promise<string> {
  switch (op.op) {
    case 'switchBranch': {
      if (!op.args.name) {
        throw new Error('Branch name missing in switchBranch request.');
      }
      await switchBranch(op.args.name);
      return `Switched to branch '${op.args.name}'`;
    }

    case 'createBranch': {
      if (!op.args.name) {
        throw new Error('Branch name missing in createBranch request.');
      }
      await createBranch(op.args.name, op.args.from);
      return `Created branch '${op.args.name}'${op.args.from ? ` from '${op.args.from}'` : ''}`;
    }

    case 'deleteBranch': {
      if (!op.args.name) {
        throw new Error('Branch name missing in deleteBranch request.');
      }
      await deleteBranch(op.args.name, Boolean(op.args.force));
      return `Deleted branch '${op.args.name}'`;
    }

    case 'undoLastCommit': {
      await undoLastCommit();
      return `Undid last commit (soft reset HEAD~1)`;
    }

    case 'fetchAll': {
      await fetchAll();
      return `Fetched all remote branches`;
    }

    case 'showLog': {
      const logs = await getLog(op.args.maxCount || 5);
      return `Recent commit log:\n${logs}`;
    }

    case 'stash': {
      await stash(op.args.message);
      return `Stashed changes${op.args.message ? `: "${op.args.message}"` : ''}`;
    }

    default: {
      throw new Error(`Unsupported operation: ${(op as any).op}`);
    }
  }
}
