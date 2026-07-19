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

/**
 * Map a known core error class to a user-friendly MCP tool error response.
 * Unknown errors are passed through with their original message.
 *
 * @param err - The caught error.
 * @returns An MCP `CallToolResult` with `isError: true`.
 */
export function handleToolError(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);

  if (err instanceof ApplicationNotFoundError) {
    return {
      content: [{ type: 'text', text: `Application not found: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof InterviewNotFoundError) {
    return {
      content: [{ type: 'text', text: `Interview not found: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof CoverLetterError) {
    return {
      content: [{ type: 'text', text: `Cover letter error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof AnswerError) {
    return {
      content: [{ type: 'text', text: `Answer generation error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof TrackError) {
    return {
      content: [{ type: 'text', text: `Track error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof RepairError) {
    return {
      content: [{ type: 'text', text: `Repair error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof DoctorError) {
    return {
      content: [{ type: 'text', text: `Doctor error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof RetroError) {
    return {
      content: [{ type: 'text', text: `Retro error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof PrepError) {
    return {
      content: [{ type: 'text', text: `Prep error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof ProfileReadError) {
    return {
      content: [{ type: 'text', text: `Profile error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof StatsError) {
    return {
      content: [{ type: 'text', text: `Stats error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof ListError) {
    return {
      content: [{ type: 'text', text: `List error: ${msg}` }],
      isError: true,
    };
  }

  if (err instanceof InitError) {
    return {
      content: [{ type: 'text', text: `Init error: ${msg}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: `Error: ${msg}` }],
    isError: true,
  };
}
