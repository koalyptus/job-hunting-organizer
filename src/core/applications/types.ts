/**
 * Application lifecycle statuses. The distinction between `withdrawn` and
 * `abandoned` matters for `jho retro --aggregate` and self-reflection:
 * `withdrawn` is a professional closing action, `abandoned` is a
 * self-reflection state (see PLAN §4 status semantics).
 */
export type ApplicationStatus =
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'abandoned'
  | 'ghosted'
  | 'accepted';

/**
 * Zod-inferred frontmatter shape for `meta.md`. Every application folder
 * contains a `meta.md` with tool-managed frontmatter and a user-owned body.
 */
export interface ApplicationFrontmatter {
  /** Application slug (matches the folder name). */
  slug: string;
  /** Current lifecycle status. */
  status: ApplicationStatus;
  /** Application date as ISO date string (e.g. `'2026-06-03'`). */
  appliedOn: string;
  /** Job title. */
  title: string;
  /** Company name. */
  company: string;
  /** Freeform location text. */
  location: string;
  /** Job board or source site (e.g. `'Seek'`, `'LinkedIn'`). */
  site: string;
  /** Original job posting URL. */
  link: string;
  /** Salary or pay range text. */
  salary: string;
  /** Classification tags (e.g. `['typescript', 'react', 'backend']`). */
  tags: string[];
  /** Slug of the best-matching target role from `profile.md` `## Target roles`. */
  targetRole: string;
}

/**
 * A single entry in `applied/.index.json`. Derived from the folder
 * listing + each `meta.md` frontmatter. Used for fast listing in
 * `jho list` and `jho stats` without reading every file.
 */
export interface ApplicationEntry {
  /** Application slug (folder name). */
  slug: string;
  /** Current lifecycle status. */
  status: ApplicationStatus;
  /** Job title. */
  title: string;
  /** Company name. */
  company: string;
  /** Job board or source site. */
  site: string;
  /** Slug of the target role (empty string if unassigned). */
  targetRole: string;
  /** Application date as ISO date string. */
  appliedOn: string;
  /** Classification tags. */
  tags: string[];
}

/**
 * Input for {@link createApplication}. All fields except `appliedDir`
 * are optional; missing values fall back to defaults.
 */
export interface CreateApplicationInput {
  /** Absolute path to the campaign's `applied/` directory. */
  appliedDir: string;
  /** Job title. */
  title?: string;
  /** Company name. */
  company?: string;
  /** Job posting URL. */
  url?: string;
  /** Application date. Defaults to now (UTC). */
  appliedOn?: string | Date;
  /** Initial status. Default: `'applied'`. */
  status?: ApplicationStatus;
  /** Salary or pay range. */
  salary?: string;
  /** Classification tags. */
  tags?: string[];
  /** Target role slug from `profile.md`. */
  targetRole?: string;
  /** Freeform location. */
  location?: string;
  /** Job board or source site. */
  site?: string;
  /** Original job posting URL (stored in frontmatter). */
  link?: string;
}

/**
 * Input for {@link updateApplication}. Only the fields present in the
 * patch are updated; all others are preserved.
 */
export interface UpdateApplicationInput {
  /** New status. */
  status?: ApplicationStatus;
  /** New salary. */
  salary?: string;
  /** Tags to add (merged with existing). */
  tags?: string[];
  /** New target role slug. */
  targetRole?: string;
  /** New location. */
  location?: string;
  /** New site. */
  site?: string;
  /** New job posting URL. */
  link?: string;
}

/**
 * Collision counters for application folder slugs. When the user applies
 * to the same role+company on the same day (or re-applies later), a `-N`
 * suffix is appended; the next free `N` is looked up here.
 *
 * The file lives at `<appliedDir>/.counters.json` and is gitignored
 * (derived state — see AGENTS.md "applied/.counters.json" row).
 */
export interface Counters {
  [baseSlug: string]: number;
}
