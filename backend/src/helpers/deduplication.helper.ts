/**
 * Deduplication Helper
 *
 * Provides utility functions for detecting and preventing duplicate content
 * in AI-generated responses. Uses two strategies:
 * 1. Normalized content: Full text comparison (whitespace normalized)
 * 2. Fingerprint: First 100 chars comparison (catches similar openings)
 */

/**
 * Normalizes content by removing extra whitespace and converting to lowercase
 * Used for exact duplicate detection
 *
 * @param text - Raw content text
 * @returns Normalized string (lowercase, single spaces)
 */
export function normalizeContent(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Creates a fingerprint from the first 100 characters of content
 * Used for detecting similar openings (same intro, different conclusion)
 *
 * @param text - Raw content text
 * @returns First 100 chars of normalized content, or empty string
 */
export function fingerprintContent(text: string): string {
  const normalized = normalizeContent(text);
  return normalized ? normalized.slice(0, 100) : '';
}

/**
 * Checks if content has RAG citation markers
 * Used to determine if response includes evidence references
 *
 * @param text - Content to check
 * @returns True if contains RAG citation format (RAG#N |)
 */
export function hasCitation(text: string): boolean {
  return /\(RAG#\d+\s*\|/.test(text);
}

/**
 * Deduplication Manager
 * Manages duplicate detection state for a single request
 */
export class DeduplicationManager {
  private usedNormalized = new Set<string>();
  private usedFingerprints = new Set<string>();

  /**
   * Checks if content is a duplicate
   *
   * @param content - Content to check
   * @returns True if content is duplicate (by normalization or fingerprint)
   */
  isDuplicate(content: string): boolean {
    const normalized = normalizeContent(content);
    const fingerprint = fingerprintContent(content);

    if (normalized && this.usedNormalized.has(normalized)) {
      return true;
    }

    if (fingerprint && this.usedFingerprints.has(fingerprint)) {
      return true;
    }

    return false;
  }

  /**
   * Marks content as used (adds to deduplication sets)
   *
   * @param content - Content to mark as used
   */
  markAsUsed(content: string): void {
    const normalized = normalizeContent(content);
    const fingerprint = fingerprintContent(content);

    if (normalized) {
      this.usedNormalized.add(normalized);
    }

    if (fingerprint) {
      this.usedFingerprints.add(fingerprint);
    }
  }

  /**
   * Gets current deduplication state (for debugging)
   */
  getState() {
    return {
      normalizedCount: this.usedNormalized.size,
      fingerprintCount: this.usedFingerprints.size,
    };
  }

  /**
   * Clears all deduplication state
   */
  clear(): void {
    this.usedNormalized.clear();
    this.usedFingerprints.clear();
  }
}
