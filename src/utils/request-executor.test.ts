import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InsomniaRequest } from '../types/request.js';

vi.mock('axios', () => ({
    default: vi.fn(),
}));

import axios from 'axios';
import { buildProcessedRequest, executeHttpRequest } from './request-executor.js';

const mockedAxios = vi.mocked(axios);

function makeRequest(overrides: Partial<InsomniaRequest> = {}): InsomniaRequest {
    return {
        _id: 'req_test',
        _type: 'request',
        parentId: 'wrk_test',
        name: 'Test Request',
        url: '{{baseUrl}}/users',
        method: 'GET',
        headers: [{ name: 'X-Custom', value: '{{token}}' }],
        parameters: [],
        modified: 0,
        created: 0,
        ...overrides,
    };
}

describe('buildProcessedRequest', () => {
    it('substitutes environment variables in URL and headers', () => {
        const processed = buildProcessedRequest(makeRequest(), {
            baseUrl: 'https://api.example.com',
            token: 'abc',
        });

        expect(processed.url).toBe('https://api.example.com/users');
        expect(processed.headers['X-Custom']).toBe('abc');
    });

    it('applies bearer authentication after header substitution', () => {
        const processed = buildProcessedRequest(
            makeRequest({
                headers: [],
                authentication: { type: 'bearer', token: 'secret-token' },
            }),
            {},
        );

        expect(processed.headers['Authorization']).toBe('Bearer secret-token');
    });

    it('applies basic authentication', () => {
        const processed = buildProcessedRequest(
            makeRequest({
                headers: [],
                authentication: { type: 'basic', username: 'user', password: 'pass' },
            }),
            {},
        );

        const expected = Buffer.from('user:pass').toString('base64');
        expect(processed.headers['Authorization']).toBe(`Basic ${expected}`);
    });

    it('substitutes {{ _.a }} with whitespace and leading underscore-dot prefix', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ _.a }}' }), { a: 1 });
        expect(processed.url).toBe('1');
    });

    it('substitutes {{_.a}} without whitespace', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{_.a}}' }), { a: 1 });
        expect(processed.url).toBe('1');
    });

    it('substitutes {{a}} backward-compatibly', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{a}}' }), { a: 1 });
        expect(processed.url).toBe('1');
    });

    it('substitutes {{ a }} with whitespace around bare variable', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ a }}' }), { a: 1 });
        expect(processed.url).toBe('1');
    });

    it('replaces the same variable multiple times in one string', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ _.a }}/x/{{ _.a }}' }), { a: 1 });
        expect(processed.url).toBe('1/x/1');
    });

    it('inserts replacement values containing $& and $1 literally', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ _.val }}' }), {
            val: 'literal $& and $1 end',
        });
        expect(processed.url).toBe('literal $& and $1 end');
    });

    it('leaves unknown variable tokens untouched', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ _.missing }}/x' }), {});
        expect(processed.url).toBe('{{ _.missing }}/x');
    });

    it('does not treat key with regex special characters as wildcard for other tokens', () => {
        const processed = buildProcessedRequest(makeRequest({ url: '{{ _.aXb }}' }), {
            'a.b': 'wildcard-replacement',
        });
        expect(processed.url).toBe('{{ _.aXb }}');
    });

    it('resolves {{ _.base_url }}/anything/62 and Authorization: Bearer {{ _.access_token }} together', () => {
        const processed = buildProcessedRequest(
            makeRequest({
                url: '{{ _.base_url }}/anything/62',
                headers: [{ name: 'Authorization', value: 'Bearer {{ _.access_token }}' }],
            }),
            {
                base_url: 'https://api.example.com',
                access_token: 'secret123',
            },
        );

        expect(processed.url).toBe('https://api.example.com/anything/62');
        expect(processed.headers['Authorization']).toBe('Bearer secret123');
    });
});

describe('executeHttpRequest', () => {
    beforeEach(() => {
        mockedAxios.mockReset();
    });

    it('returns success result with processed URL on HTTP response', async () => {
        mockedAxios.mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: { ok: true },
        });

        const result = await executeHttpRequest({
            request: makeRequest(),
            environmentVariables: { baseUrl: 'https://api.example.com', token: 't' },
        });

        expect(result.kind).toBe('success');
        if (result.kind !== 'success') {
            return;
        }

        expect(result.processed.url).toBe('https://api.example.com/users');
        expect(result.status).toBe(200);
        expect(mockedAxios).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://api.example.com/users',
                headers: expect.objectContaining({ 'X-Custom': 't' }) as Record<string, string>,
            }),
        );
    });
});
