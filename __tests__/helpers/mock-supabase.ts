/**
 * Reusable Supabase mock builder for tests.
 *
 * Creates a chainable query builder that mimics supabaseAdmin.from(table).select()...
 */
import { vi } from 'vitest';

/** Creates a chainable mock that returns the given data on terminal calls */
export function chainable(data: unknown = null, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not',
    'in', 'is', 'like', 'ilike', 'or', 'filter',
    'order', 'limit', 'range', 'head', 'match',
  ];

  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods
  builder.single = vi.fn().mockResolvedValue({ data, error });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data, error });

  return builder;
}

/** Creates a mockFrom function that can be configured per-table */
export function createMockFrom() {
  const tableHandlers = new Map<string, ReturnType<typeof chainable>>();

  const mockFrom = vi.fn((table: string) => {
    if (tableHandlers.has(table)) return tableHandlers.get(table)!;
    // Default: return null data
    return chainable(null, null);
  });

  return {
    mockFrom,
    /** Set the response for a specific table */
    onTable(table: string, data: unknown = null, error: unknown = null) {
      const chain = chainable(data, error);
      tableHandlers.set(table, chain);
      return chain;
    },
  };
}
