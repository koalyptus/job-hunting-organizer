import type { ApplicationStatus } from '@/src/mcp/types';

/**
 * Map an application status to a badge variant.
 *
 * Presentational only. The status set is `APPLICATION_STATUSES` from
 * `src/workflow/applications/types.ts`, transcribed into `src/mcp/types.ts`.
 *
 * @param status - Application status.
 * @returns The badge variant to render.
 */
export function statusVariant(status: ApplicationStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    // Positive movement: the application is alive and advancing.
    case 'offer':
    case 'accepted':
    case 'interview':
      return 'default';
    // In progress, or silent for a while.
    case 'applied':
    case 'ghosted':
      return 'secondary';
    // Closed out, one way or another.
    case 'rejected':
    case 'abandoned':
    case 'withdrawn':
      return 'outline';
  }
}
