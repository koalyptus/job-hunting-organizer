import { Badge } from '@/src/components/ui/badge';
import { CardContent } from '@/src/components/ui/card';
import { statusVariant } from '@/src/lib/status';
import type { ApplicationEntry } from '@/src/mcp/types';

/** Props for {@link ApplicationList}. */
interface ApplicationListProps {
  /** Applications to render. */
  entries: ApplicationEntry[];
  /** Whether a refresh is in flight. */
  loading: boolean;
}

/**
 * Render one campaign's applications as status, title, company and target role.
 *
 * @param props - Component props.
 * @returns The application list UI.
 */
export function ApplicationList({ entries, loading }: ApplicationListProps) {
  if (entries.length === 0) {
    return (
      <CardContent className="text-muted-foreground text-sm">
        {loading ? 'Loading…' : 'No applications yet.'}
      </CardContent>
    );
  }

  return (
    <CardContent className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div key={entry.slug} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{entry.title || entry.slug}</span>
            <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
          </div>
          <span className="text-muted-foreground text-xs">
            {entry.company}
            {entry.targetRole ? ` · ${entry.targetRole}` : ''}
          </span>
        </div>
      ))}
    </CardContent>
  );
}
