export interface EvalCoreConfig {
  dbDriver: 'sqlite';
  sqlitePath: string;
  tokenEstimation: boolean;
}

export function getDefaultConfig(): EvalCoreConfig {
  return {
    dbDriver: 'sqlite',
    sqlitePath: resolveHome('~/.omcustom/eval.db'),
    tokenEstimation: true,
  };
}

function resolveHome(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', process.env.HOME ?? '');
  }
  return path;
}
