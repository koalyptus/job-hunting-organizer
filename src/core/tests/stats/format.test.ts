import { describe, expect, it } from 'vitest';
import { renderFullStats, renderCompactStats, renderThisMonth } from '../../stats/format.js';
import type { CampaignStats } from '../../types.js';

const baseStats: CampaignStats = {
  total: 5,
  byStatus: {
    applied: 2,
    interview: 1,
    offer: 1,
    rejected: 1,
    withdrawn: 0,
    abandoned: 0,
    ghosted: 0,
    accepted: 0,
  },
  byRole: { 'senior-backend': 3, '': 2 },
  bySite: { Seek: 3, LinkedIn: 2 },
  byEmploymentType: { permanent: 3, contract: 2 },
  funnel: { applied: 2, interview: 1, offer: 1, accepted: 0 },
  thisMonth: { applied: 1, rejected: 0, offer: 1, withdrawn: 0 },
  since: '2026-06-01',
};

describe('renderFullStats', () => {
  it('includes campaign name and total', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('Campaign: default');
    expect(out).toContain('5 applications');
  });

  it('includes since label', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('since 2026-06-01');
  });

  it('omits since label when undefined', () => {
    const stats = { ...baseStats, since: undefined };
    const out = renderFullStats('default', stats);
    expect(out).not.toContain('since');
  });

  it('renders singular application when total is 1', () => {
    const stats = { ...baseStats, total: 1 };
    const out = renderFullStats('default', stats);
    expect(out).toContain('1 application');
    expect(out).not.toContain('1 applications');
  });

  it('renders all non-zero statuses', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('applied');
    expect(out).toContain('interview');
    expect(out).toContain('offer');
    expect(out).toContain('rejected');
  });

  it('renders roles with percentages', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('senior-backend');
    expect(out).toContain('(60%)');
    expect(out).toContain('(unassigned)');
    expect(out).toContain('(40%)');
  });

  it('renders sites', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('Seek');
    expect(out).toContain('LinkedIn');
  });

  it('renders "(unknown)" for empty site', () => {
    const stats: CampaignStats = {
      ...baseStats,
      bySite: { '': 3 },
    };
    const out = renderFullStats('default', stats);
    expect(out).toContain('(unknown)');
  });

  it('renders funnel with percentages', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('Funnel (lifetime):');
    expect(out).toContain('applied (2)');
    expect(out).toContain('interview (1, 20%)');
    expect(out).toContain('offer (1, 20%)');
    expect(out).toContain('accepted (0, 0%)');
  });

  it('renders this-month block when there are deltas', () => {
    const out = renderFullStats('default', baseStats);
    expect(out).toContain('This month');
    expect(out).toContain('+1 application');
    expect(out).toContain('+1 offer');
  });

  it('omits this-month block when all deltas are zero', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
    };
    const out = renderFullStats('default', stats);
    expect(out).not.toContain('This month');
  });

  it('renders 0% funnel percentages when total is 0', () => {
    const stats: CampaignStats = {
      ...baseStats,
      total: 0,
      byStatus: {
        applied: 0,
        interview: 0,
        offer: 0,
        rejected: 0,
        withdrawn: 0,
        abandoned: 0,
        ghosted: 0,
        accepted: 0,
      },
      funnel: { applied: 0, interview: 0, offer: 0, accepted: 0 },
    };
    const out = renderFullStats('default', stats);
    expect(out).toContain('applied (0)');
    expect(out).toContain('interview (0, 0%)');
    expect(out).toContain('offer (0, 0%)');
    expect(out).toContain('accepted (0, 0%)');
  });
});

describe('renderCompactStats', () => {
  it('includes campaign name and total', () => {
    const out = renderCompactStats('freelance', baseStats);
    expect(out).toContain('freelance');
    expect(out).toContain('5 applications');
  });

  it('includes since label', () => {
    const out = renderCompactStats('freelance', baseStats);
    expect(out).toContain('since 2026-06-01');
  });

  it('omits since label when undefined', () => {
    const stats = { ...baseStats, since: undefined };
    const out = renderCompactStats('freelance', stats);
    expect(out).not.toContain('since');
  });

  it('includes funnel counts', () => {
    const out = renderCompactStats('freelance', baseStats);
    expect(out).toContain('applied 2');
    expect(out).toContain('interview 1');
    expect(out).toContain('offer 1');
    expect(out).toContain('accepted 0');
  });

  it('does not bold count when total is 0', () => {
    const stats: CampaignStats = {
      ...baseStats,
      total: 0,
      byStatus: {
        applied: 0,
        interview: 0,
        offer: 0,
        rejected: 0,
        withdrawn: 0,
        abandoned: 0,
        ghosted: 0,
        accepted: 0,
      },
      funnel: { applied: 0, interview: 0, offer: 0, accepted: 0 },
    };
    const out = renderCompactStats('freelance', stats);
    expect(out).toContain('0 applications');
  });

  it('renders singular application when total is 1', () => {
    const stats: CampaignStats = { ...baseStats, total: 1 };
    const out = renderCompactStats('freelance', stats);
    expect(out).toContain('1 application');
    expect(out).not.toContain('1 applications');
  });
});

describe('renderThisMonth', () => {
  it('renders applied delta', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 3, rejected: 0, offer: 0, withdrawn: 0 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('+3 applications');
  });

  it('renders rejected delta', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 0, rejected: 2, offer: 0, withdrawn: 0 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('-2 rejections');
  });

  it('renders offer delta', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 0, rejected: 0, offer: 1, withdrawn: 0 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('+1 offer');
  });

  it('renders withdrawn delta', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 1 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('-1 withdrawn');
  });

  it('returns empty string when all deltas are zero', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
    };
    expect(renderThisMonth(stats)).toBe('');
  });

  it('renders singular forms for count of 1', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 1, rejected: 1, offer: 1, withdrawn: 1 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('+1 application');
    expect(out).not.toContain('+1 applications');
    expect(out).toContain('-1 rejection');
    expect(out).not.toContain('-1 rejections');
    expect(out).toContain('+1 offer');
    expect(out).not.toContain('+1 offers');
  });

  it('renders plural forms for count > 1', () => {
    const stats: CampaignStats = {
      ...baseStats,
      thisMonth: { applied: 5, rejected: 3, offer: 2, withdrawn: 4 },
    };
    const out = renderThisMonth(stats);
    expect(out).toContain('+5 applications');
    expect(out).toContain('-3 rejections');
    expect(out).toContain('+2 offers');
  });
});
