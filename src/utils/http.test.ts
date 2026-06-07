import { describe, expect, it } from 'vitest';
import { capResponsePayload } from './http.js';

describe('capResponsePayload', () => {
    it('returns full data when maxResponseBytes is omitted', () => {
        const data = { items: [1, 2, 3] };
        const result = capResponsePayload(data);
        expect(result).toEqual({ data, size: JSON.stringify(data).length, truncated: false });
    });

    it('returns full data when maxResponseBytes is 0', () => {
        const data = { x: 'y'.repeat(100) };
        const result = capResponsePayload(data, 0);
        expect(result.truncated).toBe(false);
        expect(result.data).toEqual(data);
    });

    it('returns full data when maxResponseBytes is negative', () => {
        const data = { x: 'y'.repeat(100) };
        const result = capResponsePayload(data, -1);
        expect(result.truncated).toBe(false);
        expect(result.data).toEqual(data);
    });

    it('returns unchanged data when under cap', () => {
        const data = { ok: true };
        const result = capResponsePayload(data, 1024);
        expect(result.truncated).toBe(false);
        expect(result.data).toEqual(data);
        expect(result.size).toBe(JSON.stringify(data).length);
    });

    it('truncates large object over cap', () => {
        const data = { items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item-${String(i)}` })) };
        const originalSize = JSON.stringify(data).length;
        const cap = 256;
        const result = capResponsePayload(data, cap);

        expect(result.truncated).toBe(true);
        expect(result.maxResponseBytes).toBe(cap);
        expect(result.size).toBe(originalSize);
        expect(typeof result.data).toBe('string');
        expect((result.data as string).length).toBe(cap);
        expect((result.data as string)).toBe(JSON.stringify(data).slice(0, cap));
    });

    it('truncates string body over cap', () => {
        const data = 'a'.repeat(500);
        const cap = 100;
        const result = capResponsePayload(data, cap);

        expect(result.truncated).toBe(true);
        expect(result.data).toBe('a'.repeat(100));
        expect(result.size).toBe(JSON.stringify(data).length);
    });

    it('handles undefined body', () => {
        const result = capResponsePayload(undefined);
        expect(result).toEqual({ data: undefined, size: 0, truncated: false });
    });

    it('handles null body', () => {
        const result = capResponsePayload(null);
        expect(result).toEqual({ data: null, size: 4, truncated: false });
    });
});
