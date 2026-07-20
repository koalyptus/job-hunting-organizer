/**
 * Profile module — re-exports from the lightweight read-only module
 * and the heavy build module. Consumers that only need {@link readProfile}
 * or {@link ProfileReadError} should import from `./profile-read.js`
 * directly to avoid pulling in LLM/CV/GitHub dependencies.
 */
export { readProfile, ProfileReadError } from './profile-read.js';
export { buildProfile } from './profile-build.js';
