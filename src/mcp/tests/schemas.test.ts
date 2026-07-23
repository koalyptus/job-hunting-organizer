import { describe, it, expect } from 'vitest';
import {
  ListApplicationsInput,
  ShowApplicationInput,
  ListInterviewsInput,
  ReadProfileInput,
  GetStatsInput,
  GetRootInput,
  GetCampaignInput,
  ListCampaignsInput,
  OwnershipInput,
  DoctorInput,
  RepairInput,
  TrackApplicationInput,
  AddInterviewInput,
  MarkInterviewInput,
  UpdateProfileInput,
  UpdateConfigInput,
  InitInput,
  PostMortemInput,
  AppendRetroInput,
  CoverLetterInput,
  ReadCoverLetterInput,
  AnswerQuestionInput,
  ExtractJdInput,
  PrepareInput,
  AggregateRetrosInput,
} from '../schemas.js';

describe('MCP schemas', () => {
  describe('ListApplicationsInput', () => {
    it('accepts minimal input', () => {
      expect(ListApplicationsInput.parse({ campaign: 'default' })).toEqual({
        campaign: 'default',
      });
    });

    it('accepts all filters', () => {
      const result = ListApplicationsInput.parse({
        campaign: 'default',
        status: 'applied',
        tags: ['react', 'remote'],
        targetRole: 'frontend',
        employmentType: 'permanent',
      });
      expect(result.status).toBe('applied');
      expect(result.tags).toEqual(['react', 'remote']);
    });

    it('rejects missing campaign', () => {
      expect(() => ListApplicationsInput.parse({})).toThrow();
    });

    it('rejects invalid status', () => {
      expect(() => ListApplicationsInput.parse({ campaign: 'default', status: 'bogus' })).toThrow();
    });
  });

  describe('ShowApplicationInput', () => {
    it('accepts valid input', () => {
      expect(ShowApplicationInput.parse({ campaign: 'default', slug: 'acme' })).toEqual({
        campaign: 'default',
        slug: 'acme',
      });
    });

    it('rejects missing slug', () => {
      expect(() => ShowApplicationInput.parse({ campaign: 'default' })).toThrow();
    });
  });

  describe('ListInterviewsInput', () => {
    it('accepts valid input', () => {
      expect(ListInterviewsInput.parse({ campaign: 'default', slug: 'acme' })).toBeDefined();
    });
  });

  describe('ReadProfileInput', () => {
    it('accepts valid input', () => {
      expect(ReadProfileInput.parse({ campaign: 'default' })).toBeDefined();
    });
  });

  describe('GetStatsInput', () => {
    it('accepts minimal input', () => {
      expect(GetStatsInput.parse({ campaign: 'default' })).toEqual({ campaign: 'default' });
    });

    it('accepts all optional fields', () => {
      const result = GetStatsInput.parse({
        campaign: 'default',
        targetRole: 'frontend',
        since: '30d',
        employmentType: 'permanent',
      });
      expect(result.since).toBe('30d');
      expect(result.targetRole).toBe('frontend');
    });
  });

  describe('GetRootInput / GetCampaignInput', () => {
    it('accepts valid input', () => {
      expect(GetRootInput.parse({ campaign: 'default' })).toBeDefined();
      expect(GetCampaignInput.parse({ campaign: 'default' })).toBeDefined();
    });
  });

  describe('ListCampaignsInput / OwnershipInput', () => {
    it('accepts empty object', () => {
      expect(ListCampaignsInput.parse({})).toEqual({});
      expect(OwnershipInput.parse({})).toEqual({});
    });
  });

  describe('DoctorInput / RepairInput', () => {
    it('accepts minimal input', () => {
      expect(DoctorInput.parse({ campaign: 'default' })).toEqual({ campaign: 'default' });
      expect(RepairInput.parse({ campaign: 'default' })).toEqual({ campaign: 'default' });
    });

    it('accepts optional slug', () => {
      const result = DoctorInput.parse({ campaign: 'default', slug: 'acme' });
      expect(result.slug).toBe('acme');
    });
  });

  describe('TrackApplicationInput', () => {
    it('accepts create mode with url', () => {
      const result = TrackApplicationInput.parse({
        campaign: 'default',
        url: 'https://example.com/job',
      });
      expect(result.url).toBe('https://example.com/job');
    });

    it('accepts update mode with slug', () => {
      const result = TrackApplicationInput.parse({
        campaign: 'default',
        slug: 'acme',
        status: 'interview',
      });
      expect(result.status).toBe('interview');
    });

    it('rejects invalid url', () => {
      expect(() =>
        TrackApplicationInput.parse({ campaign: 'default', url: 'not-a-url' }),
      ).toThrow();
    });

    it('rejects invalid status', () => {
      expect(() =>
        TrackApplicationInput.parse({ campaign: 'default', slug: 'x', status: 'bogus' }),
      ).toThrow();
    });
  });

  describe('AddInterviewInput', () => {
    it('accepts minimal input', () => {
      const result = AddInterviewInput.parse({
        campaign: 'default',
        slug: 'acme',
        when: '2026-06-15 10:00',
      });
      expect(result.when).toBe('2026-06-15 10:00');
    });

    it('accepts all optional fields', () => {
      const result = AddInterviewInput.parse({
        campaign: 'default',
        slug: 'acme',
        when: '2026-06-15 10:00',
        title: 'Phone screen',
        type: 'technical',
        duration: 60,
        interviewers: ['Alice', 'Bob'],
        location: 'Zoom',
      });
      expect(result.duration).toBe(60);
      expect(result.interviewers).toEqual(['Alice', 'Bob']);
    });

    it('rejects missing when', () => {
      expect(() => AddInterviewInput.parse({ campaign: 'default', slug: 'acme' })).toThrow();
    });

    it('rejects invalid type', () => {
      expect(() =>
        AddInterviewInput.parse({
          campaign: 'default',
          slug: 'acme',
          when: '2026-06-15',
          type: 'bogus',
        }),
      ).toThrow();
    });
  });

  describe('MarkInterviewInput', () => {
    it('accepts valid input', () => {
      const result = MarkInterviewInput.parse({
        campaign: 'default',
        slug: 'acme',
        index: 0,
        status: 'passed',
      });
      expect(result.index).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('rejects negative index', () => {
      expect(() =>
        MarkInterviewInput.parse({
          campaign: 'default',
          slug: 'acme',
          index: -1,
          status: 'passed',
        }),
      ).toThrow();
    });
  });

  describe('UpdateProfileInput', () => {
    it('accepts valid input', () => {
      expect(UpdateProfileInput.parse({ campaign: 'default', content: '# Hello' })).toBeDefined();
    });
  });

  describe('UpdateConfigInput', () => {
    it('accepts valid input', () => {
      const result = UpdateConfigInput.parse({ patch: { theme: 'dark' } });
      expect(result.patch).toEqual({ theme: 'dark' });
    });
  });

  describe('InitInput', () => {
    it('accepts empty object', () => {
      expect(InitInput.parse({})).toEqual({});
    });

    it('accepts all fields', () => {
      const result = InitInput.parse({
        campaign: 'freelance',
        cvPath: '/path/to/cv.pdf',
        githubUser: 'octocat',
        linkedinUrl: 'https://linkedin.com/in/octocat',
      });
      expect(result.campaign).toBe('freelance');
    });
  });

  describe('PostMortemInput / AppendRetroInput', () => {
    it('accepts minimal input', () => {
      expect(PostMortemInput.parse({ campaign: 'default', slug: 'acme' })).toBeDefined();
      expect(AppendRetroInput.parse({ campaign: 'default', slug: 'acme' })).toBeDefined();
    });
  });

  describe('CoverLetterInput', () => {
    it('accepts valid input', () => {
      expect(CoverLetterInput.parse({ campaign: 'default', slug: 'acme' })).toBeDefined();
    });
  });

  describe('ReadCoverLetterInput', () => {
    it('accepts valid input', () => {
      expect(ReadCoverLetterInput.parse({ campaign: 'default', slug: 'acme' })).toEqual({
        campaign: 'default',
        slug: 'acme',
      });
    });

    it('rejects missing campaign', () => {
      expect(() => ReadCoverLetterInput.parse({ slug: 'acme' })).toThrow();
    });

    it('rejects missing slug', () => {
      expect(() => ReadCoverLetterInput.parse({ campaign: 'default' })).toThrow();
    });
  });

  describe('AnswerQuestionInput', () => {
    it('accepts valid input', () => {
      const result = AnswerQuestionInput.parse({
        campaign: 'default',
        slug: 'acme',
        question: 'Why do you want this role?',
      });
      expect(result.question).toBe('Why do you want this role?');
    });

    it('rejects missing question', () => {
      expect(() => AnswerQuestionInput.parse({ campaign: 'default', slug: 'acme' })).toThrow();
    });
  });

  describe('ExtractJdInput', () => {
    it('accepts url mode', () => {
      const result = ExtractJdInput.parse({
        campaign: 'default',
        url: 'https://example.com/job',
      });
      expect(result.url).toBeDefined();
    });

    it('accepts text mode', () => {
      const result = ExtractJdInput.parse({
        campaign: 'default',
        text: 'Looking for a React developer...',
      });
      expect(result.text).toBeDefined();
    });
  });

  describe('PrepareInput', () => {
    it('accepts valid input', () => {
      const result = PrepareInput.parse({
        campaign: 'default',
        slug: 'acme',
        days: 7,
      });
      expect(result.days).toBe(7);
    });
  });

  describe('AggregateRetrosInput', () => {
    it('accepts minimal input', () => {
      expect(AggregateRetrosInput.parse({ campaign: 'default' })).toBeDefined();
    });

    it('accepts all optional fields', () => {
      const result = AggregateRetrosInput.parse({
        campaign: 'default',
        targetRole: 'frontend',
        includeAbandoned: true,
      });
      expect(result.includeAbandoned).toBe(true);
    });
  });
});
