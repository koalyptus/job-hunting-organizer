/**
 * Framework-free shadow-DOM content script.
 *
 * Injects a `[Track in JHO]` action on LinkedIn, Seek and Indeed job pages.
 * Per the #112 stack decision this is deliberately *not* React: a shadow root
 * keeps the host page's CSS out, and it costs a few kB instead of shipping
 * React into every job board. All styling lives in `content.css`, injected
 * into the shadow root by WXT's `cssInjectionMode: 'ui'`.
 */

import '@/src/content.css';
import { getCampaign } from '@/src/bridge/settings';

/** Selectors tried, in order, to place the action next to the job title. */
const JOB_TITLE_SELECTORS = [
  'h1.top-card-layout__title', // LinkedIn (legacy)
  'h1.jobs-unified-top-card__job-title', // LinkedIn (current)
  'h1.jobsearch-JobInfoHeader-title', // Indeed
  'h1[data-automation="jobTitle"]', // Seek
  'h1',
];

/** Message rendered while the tool call is in flight. */
const TRACKING = 'Tracking…';

/** Message rendered once the application is recorded. */
const TRACKED = 'Tracked ✓';

/**
 * Find the element the `[Track in JHO]` action should sit beside.
 *
 * @returns A stable anchor, falling back to the document body.
 */
function findAnchor(): Element {
  for (const selector of JOB_TITLE_SELECTORS) {
    const match = document.querySelector(selector);
    if (match !== null) {
      return match;
    }
  }

  return document.body;
}

/**
 * Build the shadow-root UI.
 *
 * @param url - Job posting URL to record.
 * @returns A function that mounts the button inside the UI container.
 */
function buildButton(url: string): (container: HTMLElement) => void {
  return (container) => {
    const root = document.createElement('div');
    root.className = 'jho-widget';
    root.dataset.state = 'idle';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jho-button';
    button.textContent = 'Track in JHO';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'jho-dismiss';
    dismiss.textContent = '×';
    dismiss.title = 'Dismiss';

    const track = async (): Promise<void> => {
      if (root.dataset.state !== 'idle') {
        return;
      }

      root.dataset.state = 'pending';
      button.disabled = true;
      button.textContent = TRACKING;

      try {
        const campaign = await getCampaign();
        const response = await browser.runtime.sendMessage({
          type: 'bridge/track',
          campaign,
          url,
        });

        if (
          typeof response === 'object' &&
          response !== null &&
          (response as { ok?: boolean }).ok === true
        ) {
          root.dataset.state = 'done';
          button.textContent = TRACKED;
          return;
        }

        throw new Error((response as { error?: string }).error ?? 'track failed');
      } catch (err) {
        root.dataset.state = 'error';
        button.disabled = false;
        button.textContent = 'Track in JHO';
        button.title = err instanceof Error ? err.message : String(err);
      }
    };

    button.addEventListener('click', () => void track());
    dismiss.addEventListener('click', () => root.remove());

    root.append(button, dismiss);
    container.append(root);
  };
}

export default defineContentScript({
  matches: [
    '*://www.linkedin.com/jobs/*',
    '*://www.seek.com.au/job/*',
    '*://www.seek.co.nz/job/*',
    '*://au.indeed.com/viewjob*',
    '*://www.indeed.com/viewjob*',
  ],
  // Ship the CSS as a web-accessible resource and inject it into the shadow
  // root, rather than as a page-level <link> — the isolation #112 asks for.
  cssInjectionMode: 'ui',

  /** @param ctx - WXT content-script context. */
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'jho-track-widget',
      position: 'inline',
      anchor: findAnchor(),
      append: 'before',
      onMount: buildButton(window.location.href),
    });

    ui.mount();
  },
});
