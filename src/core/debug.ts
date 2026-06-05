import createDebug, { type Debugger } from 'debug';

const NAMESPACE = 'jho';

export function debug(namespace: string): Debugger {
  if (!namespace.startsWith(`${NAMESPACE}:`) && namespace !== NAMESPACE) {
    return createDebug(`${NAMESPACE}:${namespace}`);
  }
  return createDebug(namespace);
}

export function enableFromEnv(): void {
  const env = process.env['DEBUG'];
  if (env !== undefined && env !== '') {
    createDebug.enable(env);
  } else {
    createDebug.enable(`${NAMESPACE}:*`);
  }
}

export { createDebug };
