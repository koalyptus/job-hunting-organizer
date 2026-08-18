/**
 * @deprecated The init workflow has moved to `src/workflow/init/`. Import from
 * `../../workflow/init/index.js` (CLI) or `../../workflow/init/index.js` (MCP)
 * instead. This barrel is retained only during the Phase 9g–9k transition and
 * will be removed in Phase 9k.
 */
export { runInit } from '../../workflow/init/wizard.js';
export {
  generateSkeletonProfile,
  generateVoiceGuideSkeleton,
} from '../../workflow/init/skeleton.js';
export { InitCancelled, InitError } from '../../workflow/init/errors.js';
