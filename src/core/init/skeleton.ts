/**
 * Generate a skeleton profile.md with placeholder structure.
 * @param githubUser GitHub username (empty string to omit).
 * @param linkedinUrl LinkedIn profile URL (empty string to omit).
 */
export function generateSkeletonProfile(githubUser: string, linkedinUrl: string = ''): string {
  return `# Profile — Candidate

## Contact

- Email:
- Phone:
- Location:
- LinkedIn: ${linkedinUrl}
- GitHub: ${githubUser}
- Website:

## Summary

<Write a 2-3 sentence pitch about yourself>

## Skills

### Languages / Frameworks / Tools / Cloud / Methodology

## Experience

### <Role> @ <Company> (<start> – <end>)

- <Action-led, quantified bullets>

## Education

## Notable projects

### <name> (github.com/...)

- one-liner · tech · impact

## Preferences

- Work style:
- Work rights:
- Notice period:

## Target roles

<!-- jho:target-roles — tool suggests; you decide. Edit freely. -->

### <role-slug> — <Role Title> [primary]

- Level:
- Domain:
- Stack:
- Work style:
- Compensation:
- Notes:
`;
}
