import { text, select, isCancel, log as clackLog } from '@clack/prompts';
import Table from 'cli-table3';
import type { TargetRole, RoleAction } from '../types.js';
import { MSG_CANCELLED } from './constants.js';

/**
 * Display target roles in a table.
 */
function displayRoles(roles: TargetRole[]): void {
  const table = new Table({
    head: ['#', 'Role', 'Priority', 'Level'],
    style: { head: ['cyan'] },
  });
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i]!;
    table.push([i + 1, r.slug, r.priority, r.level]);
  }
  clackLog.info(table.toString());
}

/**
 * Prompt for fields to create or edit a TargetRole.
 */
async function editRole(existing: TargetRole | null): Promise<TargetRole | null> {
  const slug = await text({
    message: 'Role slug (lowercase, hyphens):',
    defaultValue: existing?.slug ?? '',
    validate: (v) => {
      if (!v) {
        return 'Slug is required';
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) {
        return 'Must be lowercase alphanumeric with hyphens';
      }
    },
  });
  if (isCancel(slug)) {
    return null;
  }

  const title = await text({
    message: 'Role title:',
    defaultValue: existing?.title ?? '',
    validate: (v) => (v ? undefined : 'Title is required'),
  });
  if (isCancel(title)) {
    return null;
  }

  const priority = await select({
    message: 'Priority:',
    options: [
      { value: 'primary' as const, label: 'Primary (main focus)' },
      { value: 'secondary' as const, label: 'Secondary (open to)' },
      { value: 'stretch' as const, label: 'Stretch (aspirational)' },
    ],
    initialValue: existing?.priority ?? 'primary',
  });
  if (isCancel(priority)) {
    return null;
  }

  const level = await text({
    message: 'Level:',
    defaultValue: existing?.level ?? '',
  });
  if (isCancel(level)) {
    return null;
  }

  const domain = await text({
    message: 'Domain:',
    defaultValue: existing?.domain ?? '',
  });
  if (isCancel(domain)) {
    return null;
  }

  const stack = await text({
    message: 'Stack:',
    defaultValue: existing?.stack ?? '',
  });
  if (isCancel(stack)) {
    return null;
  }

  const workStyle = await text({
    message: 'Work style:',
    defaultValue: existing?.workStyle ?? '',
  });
  if (isCancel(workStyle)) {
    return null;
  }

  const compensation = await text({
    message: 'Compensation:',
    defaultValue: existing?.compensation ?? '',
  });
  if (isCancel(compensation)) {
    return null;
  }

  const notes = await text({
    message: 'Notes:',
    defaultValue: existing?.notes ?? '',
  });
  if (isCancel(notes)) {
    return null;
  }

  return { slug, title, priority, level, domain, stack, workStyle, compensation, notes };
}

/**
 * Review loop for target roles. Returns the final list.
 */
export async function reviewRoles(roles: TargetRole[]): Promise<TargetRole[]> {
  const current = [...roles];

  while (true) {
    clackLog.info('\nGenerated target roles:');
    displayRoles(current);

    const action = await select<RoleAction>({
      message: 'What would you like to do?',
      options: [
        { value: 'accept', label: 'Accept all' },
        { value: 'edit', label: 'Edit a role' },
        { value: 'add', label: 'Add a role' },
        { value: 'delete', label: 'Delete a role' },
      ],
    });

    if (isCancel(action)) {
      clackLog.info(MSG_CANCELLED);
      process.exit(0);
    }

    if (action === 'accept') {
      break;
    }

    if (action === 'edit') {
      const idx = await select({
        message: 'Which role to edit?',
        options: current.map((r, i) => ({
          value: i,
          label: `${r.slug} — ${r.title} [${r.priority}]`,
        })),
      });
      if (isCancel(idx)) {
        continue;
      }

      const role = current[idx]!;
      const updated = await editRole(role);
      if (updated) {
        current[idx] = updated;
      }
    }

    if (action === 'add') {
      const newRole = await editRole(null);
      if (newRole) {
        current.push(newRole);
      }
    }

    if (action === 'delete') {
      const idx = await select({
        message: 'Which role to delete?',
        options: current.map((r, i) => ({
          value: i,
          label: `${r.slug} — ${r.title} [${r.priority}]`,
        })),
      });
      if (isCancel(idx)) {
        continue;
      }
      current.splice(idx, 1);
    }
  }

  return current;
}
