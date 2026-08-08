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

/**
* Generate a skeleton my-voice.md with instructions and editable sections.
* This file personalizes cover letters and application answers. It is
* written to the campaign's `knowledge-base/` folder at init (never
* overwritten on re-init) and is excluded from knowledge-base ingestion.
*/
export function generateVoiceGuideSkeleton(): string {
return `# My Voice

<!--
jho:my-voice — personalizes your cover letters and application answers.
The tool reads it for voice only and never ingests it as a knowledge-base document.
Fill the sections below with your own phrasing, then delete this comment.
-->

## Tone
<e.g. warm, direct, confident, understated, enthusiastic>

## Vocabulary
<words you favor>

<words to avoid>

## Sentence style
<e.g. short sentences, varied rhythm, first person "I">

## What to emphasize
<strengths, values, and experiences you want highlighted>

## What to avoid
<topics, phrases, or claims to steer clear of>
`;
}
