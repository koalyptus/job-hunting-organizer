/**
 * A single repair action taken by {@link repairApp} or {@link repairAll}.
 */
export interface RepairAction {
  /** Machine-readable action name (e.g. `'toolhash_updated'`, `'index_rebuilt'`). */
  readonly action: string;
  /** Human-readable description of what was repaired. */
  readonly message: string;
  /** Slug of the affected application, or `null` for campaign-level repairs. */
  readonly slug: string | null;
}

/**
 * Result of a repair operation.
 */
export interface RepairResult {
  /** All actions taken. Empty array means nothing needed repair. */
  readonly actions: RepairAction[];
  /** Whether the index was rebuilt (convenience flag for callers). */
  readonly isIndexRebuilt: boolean;
}

/**
 * Options for {@link repairApp}. All fields are optional.
 */
export interface RepairOptions {
  /** When `true`, update toolhash sidecars to match current file contents. */
  readonly updateToolhash?: boolean;
}
