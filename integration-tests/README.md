# integration-tests

End-to-end tests for `job-hunting-organizer`.

- `helpers.ts` — shared temp-env setup, campaign creation, cleanup.
- `cli/` — exercises real CLI commands against temp filesystems with real core; mocks logger and LLM only.
- `mcp/` — exercises MCP tool dispatch through a test server with real core; mocks logger and LLM only.
- Keep tests deterministic: use fixed temp roots, reset env vars in `afterEach`, and avoid touching real `$JHO_DATA`/`$JHO_CONFIG_HOME`.
