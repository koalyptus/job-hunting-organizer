import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApplicationNotFoundError } from '../core/applications/applications.js';
import { InterviewNotFoundError } from '../core/interviews/interviews.js';
import { CoverLetterError } from '../core/applications/cover-letter.js';
import { AnswerError } from '../core/applications/application-qa.js';
import { TrackError } from '../core/track/errors.js';
import { RepairError } from '../core/repair/repair.js';
import { DoctorError } from '../core/doctor/doctor.js';
import { RetroError } from '../core/retro/retro.js';
import { PrepError } from '../core/prepare/prepare.js';
import { ProfileReadError } from '../core/campaign/profile.js';
import { StatsError } from '../core/stats/errors.js';
import { ListError } from '../core/list/errors.js';
import { InitError } from '../core/init/errors.js';

type ErrorConstructor = new (...args: never[]) => Error;

const ERROR_PREFIXES: Map<ErrorConstructor, string> = new Map([
  [ApplicationNotFoundError, 'Application not found'],
  [InterviewNotFoundError, 'Interview not found'],
  [CoverLetterError, 'Cover letter error'],
  [AnswerError, 'Answer generation error'],
  [TrackError, 'Track error'],
  [RepairError, 'Repair error'],
  [DoctorError, 'Doctor error'],
  [RetroError, 'Retro error'],
  [PrepError, 'Prep error'],
  [ProfileReadError, 'Profile error'],
  [StatsError, 'Stats error'],
  [ListError, 'List error'],
  [InitError, 'Init error'],
]);

/**
 * Map a known core error class to a user-friendly MCP tool error response.
 * Unknown errors are passed through with their original message.
 *
 * @param err - The caught error.
 * @returns An MCP `CallToolResult` with `isError: true`.
 */
export function handleToolError(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);

  for (const [ctor, prefix] of ERROR_PREFIXES) {
    if (err instanceof ctor) {
      return {
        content: [{ type: 'text', text: `${prefix}: ${msg}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Error: ${msg}` }],
    isError: true,
  };
}
