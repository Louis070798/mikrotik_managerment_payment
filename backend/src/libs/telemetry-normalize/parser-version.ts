/**
 * Bumped whenever parsing/normalization semantics change for a source. Stored on every
 * normalized row (interface_counter_samples.parser_version, etc.) per SYSTEM_SPEC §11, so a
 * future reprocess job can tell which rows were parsed under which rules.
 */
export const NORMALIZER_PARSER_VERSION = 'normalize-1.0.0';
