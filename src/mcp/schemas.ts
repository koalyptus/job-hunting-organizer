import { z } from 'zod';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES } from '../core/applications/types.js';
import { INTERVIEW_TYPES, INTERVIEW_STATUSES } from '../core/interviews/types.js';

/** Zod schema for the `campaign` parameter (used by most tools). */
export const CampaignParam = z.string().describe('Campaign name (e.g. "default")');

/** Zod schema for the `slug` parameter. */
export const SlugParam = z.string().describe('Application slug');

/** Zod schema for optional status filter. */
export const StatusFilter = z
  .enum(APPLICATION_STATUSES)
  .optional()
  .describe('Filter by application status');

/** Zod schema for optional tags filter. */
export const TagsFilter = z.array(z.string()).optional().describe('AND-combined tag filter');

/** Zod schema for optional target role filter. */
export const TargetRoleFilter = z.string().optional().describe('Filter by target role slug');

/** Zod schema for optional employment type filter. */
export const EmploymentTypeFilter = z
  .enum(EMPLOYMENT_TYPES)
  .optional()
  .describe('Filter by employment type');

/** Zod schema for `list_applications` tool input. */
export const ListApplicationsInput = z.object({
  campaign: CampaignParam,
  status: StatusFilter,
  tags: TagsFilter,
  targetRole: TargetRoleFilter,
  employmentType: EmploymentTypeFilter,
});

/** Zod schema for `show_application` tool input. */
export const ShowApplicationInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
});

/** Zod schema for `list_interviews` tool input. */
export const ListInterviewsInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
});

/** Zod schema for `read_profile` tool input. */
export const ReadProfileInput = z.object({
  campaign: CampaignParam,
});

/** Zod schema for `get_stats` tool input. */
export const GetStatsInput = z.object({
  campaign: CampaignParam,
  targetRole: TargetRoleFilter,
  since: z.string().optional().describe('Filter by date range (e.g. "7d", "30d", "2026-01-01")'),
  employmentType: EmploymentTypeFilter,
});

/** Zod schema for `get_root` tool input. */
export const GetRootInput = z.object({
  campaign: CampaignParam,
});

/** Zod schema for `get_campaign` tool input. */
export const GetCampaignInput = z.object({
  campaign: CampaignParam,
});

/** Zod schema for `list_campaigns` tool input. */
export const ListCampaignsInput = z.object({});

/** Zod schema for `ownership` tool input. */
export const OwnershipInput = z.object({});

/** Zod schema for `doctor` tool input. */
export const DoctorInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam.optional().describe('Optional application slug to diagnose a single app'),
});

/** Zod schema for `repair` tool input. */
export const RepairInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam.optional().describe('Optional application slug to repair a single app'),
});

/** Zod schema for `track_application` tool input. */
export const TrackApplicationInput = z.object({
  campaign: CampaignParam,
  url: z.string().url().optional().describe('Job posting URL (create mode)'),
  slug: SlugParam.optional().describe('Application slug (update mode)'),
  status: z.enum(APPLICATION_STATUSES).optional().describe('New status'),
  salary: z.string().optional().describe('Salary or pay range'),
  tags: z.array(z.string()).optional().describe('Tags to add'),
  targetRole: z.string().optional().describe('Target role slug'),
  location: z.string().optional().describe('Freeform location'),
  site: z.string().optional().describe('Job board or source site'),
  link: z.string().optional().describe('Original job posting URL'),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().describe('Employment type'),
  note: z.string().optional().describe('Note to append to jd.md'),
  steer: z.string().optional().describe('Custom LLM instructions for JD extraction'),
});

/** Zod schema for `add_interview` tool input. */
export const AddInterviewInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  when: z.string().describe('Interview datetime (e.g. "2026-06-15 10:00")'),
  title: z.string().optional().describe('Interview title'),
  type: z.enum(INTERVIEW_TYPES).optional().describe('Interview type'),
  duration: z.number().int().positive().optional().describe('Duration in minutes'),
  interviewers: z.array(z.string()).optional().describe('Interviewer names'),
  location: z.string().optional().describe('Interview location'),
});

/** Zod schema for `mark_interview` tool input. */
export const MarkInterviewInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  index: z.number().int().nonnegative().describe('Interview index (0-based)'),
  status: z.enum(INTERVIEW_STATUSES).describe('New interview status'),
  notes: z.string().optional().describe('Additional notes'),
});

/** Zod schema for `update_profile` tool input. */
export const UpdateProfileInput = z.object({
  campaign: CampaignParam,
  content: z.string().describe('New profile markdown content'),
});

/** Zod schema for `update_config` tool input. */
export const UpdateConfigInput = z.object({
  patch: z.record(z.unknown()).describe('Partial config patch to merge'),
});

/** Zod schema for `init` tool input. */
export const InitInput = z.object({
  campaign: z.string().optional().describe('Campaign name (default: "default")'),
  cvPath: z.string().optional().describe('Path to CV file (PDF, DOCX, MD)'),
  githubUser: z.string().optional().describe('GitHub username'),
  linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
});

/** Zod schema for `post_mortem` tool input. */
export const PostMortemInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  weakTopics: z.array(z.string()).optional().describe('Weak topics to include'),
  notes: z.string().optional().describe('Additional notes'),
  steer: z.string().optional().describe('Custom LLM instructions'),
  status: z.string().optional().describe('Status at the time of writing'),
});

/** Zod schema for `append_retro` tool input. */
export const AppendRetroInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  weakTopics: z.array(z.string()).optional().describe('Weak topics to add'),
  notes: z.string().optional().describe('Additional notes'),
  steer: z.string().optional().describe('Custom LLM instructions'),
  status: z.string().optional().describe('Status at the time of writing'),
  noCarryOver: z.boolean().optional().describe('Do not carry prior weak topics/notes forward'),
});

/** Zod schema for `cover_letter` tool input. */
export const CoverLetterInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  steer: z.string().optional().describe('Custom LLM instructions'),
});

/** Zod schema for `answer_question` tool input. */
export const AnswerQuestionInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  question: z.string().describe('Question to answer'),
  steer: z.string().optional().describe('Custom LLM instructions'),
});

/** Zod schema for `extract_jd` tool input. */
export const ExtractJdInput = z.object({
  campaign: CampaignParam,
  url: z.string().url().optional().describe('Job posting URL'),
  text: z.string().optional().describe('Raw job description text'),
});

/** Zod schema for `prepare` tool input. */
export const PrepareInput = z.object({
  campaign: CampaignParam,
  slug: SlugParam,
  steer: z.string().optional().describe('Custom LLM instructions'),
  days: z.number().int().positive().optional().describe('Days until interview'),
});

/** Zod schema for `aggregate_retros` tool input. */
export const AggregateRetrosInput = z.object({
  campaign: CampaignParam,
  targetRole: TargetRoleFilter,
  includeAbandoned: z.boolean().optional().describe('Include abandoned applications'),
});
