# NL Command Parsing Rubric

## Pass Criteria (ALL must be met)

1. **Command Correct**: Parsed `command` matches expected exactly
2. **Subcommand Correct** (if expected): Parsed `subcommand` matches expected (when expected has a subcommand)
3. **Args Correct**: Positional `args` array contains expected args (order + values). Extra args allowed if harmless.
4. **Options Correct**: All expected options present with correct values
   - Extra options allowed if harmless (e.g., `--yes` when not needed)
   - Missing required options = FAIL
5. **Confidence**: Reported confidence ≥ `minConfidence` for the case
6. **Valid JSON**: Output parses as valid ParsedCommand

## Fail Examples

- Wrong command (e.g., "list" → "show")
- Wrong subcommand (e.g., cover-letter without "show" when expected)
- Missing required arg (e.g., track without URL/slug)
- Wrong option value (e.g., --status "hired" → "interview")
- Confidence < `minConfidence` on clear input
- Invalid JSON output

## Edge Cases (scored separately)

- Ambiguous input → confidence 0.3-0.7, correct parse = partial pass
- Typos in command names → should still parse correctly
- Synonyms ("show" vs "list", "create" vs "track", "write" vs "cover-letter")
- Implicit campaign/slug (inferred from cwd) → args may be empty when expected allows
