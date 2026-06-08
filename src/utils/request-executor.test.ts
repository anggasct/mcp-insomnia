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
