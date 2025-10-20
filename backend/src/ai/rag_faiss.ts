/**
 * FAISS RAG Client
 *
 * Connects to FAISS server (port 8004) for semantic vector search
 * Replaces token-based search in rag.ts with embedding-based similarity search
 */

import type { Role } from '../types.js';

export type NS = 'macro' | 'firm' | 'household';

export type Hit = {
  ns: NS;
  text: string;
  meta?: {
    id?: string;
    title?: string;
    source?: string;
    date?: string;
    tags?: string[];
    score?: number;
  };
  sim?: number;
};

export type AskRole = 'eco' | 'firm' | 'house';

const ROLE_TO_NS: Record<AskRole, NS> = {
  eco: 'macro',
  firm: 'firm',
  house: 'household',
};

// FAISS server configuration
const FAISS_SERVER_URL = process.env.FAISS_SERVER_URL || 'http://localhost:8004';
const FAISS_TIMEOUT_MS = Number(process.env.FAISS_TIMEOUT_MS) || 5000;

/**
 * Check if FAISS server is available
 */
export async function isFaissAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${FAISS_SERVER_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Search RAG using FAISS vector similarity
 *
 * @param q - Query string
 * @param roles - Roles to search (eco, firm, house)
 * @param k - Number of results per role
 * @returns Array of hits with similarity scores
 */
export async function searchRAG(q: string, roles: AskRole[], k = 3): Promise<Hit[]> {
  if (!q.trim()) {
    return [];
  }

  // Validate roles
  const validRoles = roles.filter(role => role === 'eco' || role === 'firm' || role === 'house');
  if (!validRoles.length) {
    console.warn('[RAG_FAISS] No valid roles provided, defaulting to eco');
    validRoles.push('eco');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FAISS_TIMEOUT_MS);

    const response = await fetch(`${FAISS_SERVER_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: q,
        roles: validRoles,
        k,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FAISS server error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Convert FAISS response to Hit format
    const hits: Hit[] = (data.hits || []).map((hit: any) => ({
      ns: ROLE_TO_NS[hit.role as AskRole],
      text: hit.text || '',
      meta: {
        id: hit.meta?.id,
        title: hit.meta?.title,
        source: hit.meta?.source,
        date: hit.meta?.date,
        tags: hit.meta?.tags || [],
        score: hit.meta?.score,
      },
      sim: hit.sim || 0,
    }));

    console.log(
      `[RAG_FAISS] Found ${hits.length} hits for "${q.slice(0, 50)}" (roles: ${validRoles.join(',')}, time: ${data.query_time_ms?.toFixed(1)}ms)`
    );

    return hits;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[RAG_FAISS] Timeout after ${FAISS_TIMEOUT_MS}ms`);
    } else {
      console.error('[RAG_FAISS] Search failed:', err);
    }

    // Return empty results on failure
    // Backend will continue without RAG evidence
    return [];
  }
}

/**
 * Get FAISS server health status
 */
export async function getHealth(): Promise<{
  status: string;
  model?: string;
  dimension?: number;
  loaded_roles?: string[];
  total_vectors?: Record<string, number>;
}> {
  const response = await fetch(`${FAISS_SERVER_URL}/health`);

  if (!response.ok) {
    throw new Error(`FAISS health check failed: ${response.status}`);
  }

  return response.json();
}
