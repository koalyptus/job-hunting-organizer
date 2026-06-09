import type { TargetRole } from './types.js';

/**
 * Regex for the H3 heading of a target role.
 * Captures: (1) slug, (2) title, (3) priority tag.
 * Example: `### senior-backend-engineer — Senior Backend Engineer [primary]`
 */
const ROLE_H3_RE = /^### ([a-z0-9-]+)\s+—\s+(.+?)\s+\[(primary|secondary|stretch)\]\s*$/;

/**
 * Regex for a bullet-point field inside a target role.
 * Captures: (1) field name, (2) value.
 * Example: `- Level: Senior (IC4)`
 */
const FIELD_RE = /^- ([A-Za-z /]+):\s*(.+)$/;

/**
 * The section marker that precedes the target roles list.
 */
const TARGET_ROLES_MARKER = '<!-- jho:target-roles -->';

/**
 * Mutable internal type used during parsing. Converted to the
 * readonly {@link TargetRole} by {@link finalizeRole}.
 */
interface MutableTargetRole {
  slug: string;
  title: string;
  priority: 'primary' | 'secondary' | 'stretch';
  level: string;
  domain: string;
  stack: string;
  workStyle: string;
  compensation: string;
  notes: string;
}

/**
 * Parse the `## Target roles` section from a profile body into
 * structured {@link TargetRole} objects. Returns an empty array if
 * the section is absent or contains no roles.
 * @param body - The profile body text (everything after the frontmatter).
 * @returns The parsed target roles, in document order.
 */
export function parseTargetRoles(body: string): TargetRole[] {
  const sectionStart = body.indexOf('## Target roles');
  if (sectionStart === -1) {
    return [];
  }

  // Find the next H2 after "## Target roles" to bound the section
  const afterSection = body.slice(sectionStart + '## Target roles'.length);
  const nextH2 = afterSection.search(/\n## /);
  const sectionBody = nextH2 === -1 ? afterSection : afterSection.slice(0, nextH2);

  const lines = sectionBody.split(/\r?\n/);
  const roles: TargetRole[] = [];
  let current: MutableTargetRole | null = null;

  for (const line of lines) {
    const h3Match = line.match(ROLE_H3_RE);
    if (h3Match) {
      if (current?.slug) {
        roles.push(finalizeRole(current));
      }
      current = {
        slug: h3Match[1] ?? '',
        title: h3Match[2] ?? '',
        priority: (h3Match[3] as TargetRole['priority']) ?? 'secondary',
        level: '',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      };
      continue;
    }

    const fieldMatch = line.match(FIELD_RE);
    if (fieldMatch && current) {
      const key = fieldMatch[1];
      const value = fieldMatch[2]?.trim() ?? '';
      if (key === 'Level') {
        current.level = value;
      } else if (key === 'Domain') {
        current.domain = value;
      } else if (key === 'Stack') {
        current.stack = value;
      } else if (key === 'Work style') {
        current.workStyle = value;
      } else if (key === 'Compensation') {
        current.compensation = value;
      } else if (key === 'Notes') {
        current.notes = value;
      }
    }
  }

  if (current?.slug) {
    roles.push(finalizeRole(current));
  }

  return roles;
}

/**
 * Fill missing fields with empty strings so the returned role is
 * always fully populated.
 */
function finalizeRole(partial: MutableTargetRole): TargetRole {
  return {
    slug: partial.slug,
    title: partial.title,
    priority: partial.priority,
    level: partial.level,
    domain: partial.domain,
    stack: partial.stack,
    workStyle: partial.workStyle,
    compensation: partial.compensation,
    notes: partial.notes,
  };
}

/**
 * Find a single target role by slug.
 * @param body - The profile body text.
 * @param slug - The role slug to look for.
 * @returns The matching role, or `null` if not found.
 */
export function findTargetRole(body: string, slug: string): TargetRole | null {
  return parseTargetRoles(body).find((r) => r.slug === slug) ?? null;
}

/**
 * Replace the entire `## Target roles` section (from the H2 heading
 * up to, but not including, the next H2) with newly generated content.
 * If the section does not exist, it is appended to the end of the body.
 *
 * The section marker `<!-- jho:target-roles -->` is always emitted
 * after the H2 heading.
 * @param body - The profile body text.
 * @param roles - The new roles to write.
 * @returns The updated body text.
 */
export function replaceTargetRoles(body: string, roles: TargetRole[]): string {
  const heading = '## Target roles';
  const sectionStart = body.indexOf(heading);

  const sectionContent = formatTargetRoles(roles);

  if (sectionStart === -1) {
    // Append to end
    const trimmed = body.replace(/\s*$/, '');
    return `${trimmed}\n\n${heading}\n${TARGET_ROLES_MARKER}\n\n${sectionContent}\n`;
  }

  // Find the next H2 to bound the replacement
  const afterHeading = body.slice(sectionStart + heading.length);
  const nextH2 = afterHeading.search(/\n## /);
  const before = body.slice(0, sectionStart);
  const after = nextH2 === -1 ? '' : afterHeading.slice(nextH2);

  return `${before}${heading}\n${TARGET_ROLES_MARKER}\n\n${sectionContent}\n${after}`;
}

/**
 * Format a list of target roles into the markdown section body.
 * @param roles - The roles to format.
 * @returns The formatted markdown (no trailing newline).
 */
function formatTargetRoles(roles: TargetRole[]): string {
  return roles
    .map((r) => {
      const lines = [`### ${r.slug} — ${r.title} [${r.priority}]`, ''];
      if (r.level) {
        lines.push(`- Level: ${r.level}`);
      }
      if (r.domain) {
        lines.push(`- Domain: ${r.domain}`);
      }
      if (r.stack) {
        lines.push(`- Stack: ${r.stack}`);
      }
      if (r.workStyle) {
        lines.push(`- Work style: ${r.workStyle}`);
      }
      if (r.compensation) {
        lines.push(`- Compensation: ${r.compensation}`);
      }
      if (r.notes) {
        lines.push(`- Notes: ${r.notes}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Validate a target-role slug. Valid slugs are lowercase alphanumeric
 * with hyphens, matching the convention used in application folder slugs.
 * @param slug - The slug to validate.
 * @returns `true` if the slug is valid.
 */
export function isValidRoleSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length > 0;
}
