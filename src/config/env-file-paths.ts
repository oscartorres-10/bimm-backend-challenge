/**
 * Lists the `.env` files to read for the current NODE_ENV, in priority order.
 * Example for NODE_ENV=test: `.env.test.local`, `.env.test`, `.env`.
 * `.local` files are git-ignored and meant for personal overrides.
 */
export function envFilePaths(nodeEnv = process.env.NODE_ENV ?? 'development') {
  return [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env'];
}
