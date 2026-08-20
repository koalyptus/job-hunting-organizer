/** @deprecated Re-exports from `src/workflow/applications/` during Phase 9i-9k migration. */
export {
  createApplication,
  updateApplication,
  readApplication,
  listApplications,
  deleteApplication,
  getEntryFromSlug,
  appendNote,
  ApplicationNotFoundError,
} from '../../workflow/applications/applications.js';
export {
  indexPath,
  readIndex,
  writeIndex,
  buildIndex,
  rebuildIndex,
  upsertIndexEntry,
  removeIndexEntry,
} from '../../workflow/applications/index-builder.js';
export {
  readCounters,
  readCountersAsync,
  writeCountersAsync,
  readCollisionSuffix,
  removeCounterEntry,
} from '../../workflow/applications/counters.js';
export {
  ApplicationFrontmatterSchema,
  ApplicationStatusSchema,
  validateApplicationFrontmatter,
  safeValidateApplicationFrontmatter,
} from '../../workflow/applications/meta-schema.js';
export { generateCoverLetter, CoverLetterError } from '../../workflow/applications/cover-letter.js';
export { answerQuestion, AnswerError } from '../../workflow/applications/application-qa.js';
export {
  readShowData,
  readShowFile,
  ShowError,
  SHOWABLE_FILES,
} from '../../workflow/applications/show.js';
export { parseEmploymentType } from '../../workflow/applications/normalize.js';
export type { ApplicationFile, ShowResult } from '../../workflow/applications/show.js';
export type {
  ApplicationEntry,
  ApplicationStatus,
  EmploymentType,
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationFrontmatter,
  Counters,
} from '../../workflow/applications/types.js';
