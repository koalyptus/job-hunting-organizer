# Profile Build Rubric v1

**Prompt version:** 1
**Last updated:** 2026-07-10

## Dimensions

Evaluate the generated profile.md against these dimensions.

### 1. structure

Check these rules programmatically:

- **Required sections**: Contains `# Profile`, `## Summary`, `## Skills`
- **Target roles section**: Contains `## Target roles` with 2–4 H3 entries
- **No frontmatter**: Output is pure markdown body (no `---` frontmatter block)
- **Section order**: Follows the prompt's section ordering

### 2. grounding

- **Profile references**: Skills and technologies match what is in the CV/GitHub input
- **No fabrication**: Does not invent employers, degrees, or projects not in the input
- **GitHub repos**: Notable projects reference actual repos from the GitHub data
- **Conservative estimates**: Compensation and seniority are reasonable for the apparent experience level

### 3. target roles

- **Role count**: 2–4 target roles generated
- **Priority tags**: Each role has a priority (primary/secondary/stretch)
- **Slug format**: Lowercase alphanumeric + hyphens only
- **Relevance**: Roles align with the candidate's apparent career trajectory
