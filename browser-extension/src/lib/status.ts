import type { ApplicationStatus } from '@/src/mcp/types';

/**
 * Map an application status to a badge variant.
 *
 * Mirrors the semantics of `APPLICATION_STATUSES` on the server; kept here as a
 * presentational map only.
 *
 * @param status - Application status.
 * @returns The badge variant to render.
 */
export function statusVariant(status: ApplicationStatus): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'offer':
    case 'interview':
      return 'default';
    case 'applied':
    case 'screening':
      return 'secondary';
    case 'rejected':
    case 'abandoned':
      return 'outline';
    default:
      return 'secondary';
  }
}
