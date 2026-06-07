import { CanceledError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createExecutionAbortSignal,
    DEFAULT_EXECUTION_TIMEOUT_MS,
    getAbortErrorInfo,
    resolveExecutionTimeoutMs,
} from './http.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('resolveExecutionTimeoutMs', () => {
    it('defaults to 30s when omitted', () => {
        expect(resolveExecutionTimeoutMs()).toBe(DEFAULT_EXECUTION_TIMEOUT_MS);
    });

    it('returns explicit value including zero', () => {
        expect(resolveExecutionTimeoutMs(5000)).toBe(5000);
        expect(resolveExecutionTimeoutMs(0)).toBe(0);
    });
});

describe('createExecutionAbortSignal', () => {
    it('aborts after timeoutMs by default', async () => {
        vi.useFakeTimers();
        const signal = createExecutionAbortSignal({ timeoutMs: 1000 });

        const abortPromise = new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
                resolve();
            });
        });

        await vi.advanceTimersByTimeAsync(1000);
        await abortPromise;
        expect(signal.aborted).toBe(true);
    });

    it('does not auto-abort when timeoutMs is zero', async () => {
        vi.useFakeTimers();
        const signal = createExecutionAbortSignal({ timeoutMs: 0 });

        await vi.advanceTimersByTimeAsync(DEFAULT_EXECUTION_TIMEOUT_MS + 1000);
        expect(signal.aborted).toBe(false);
    });

    it('forwards MCP signal abort', () => {
        const mcpController = new AbortController();
        const signal = createExecutionAbortSignal({ mcpSignal: mcpController.signal, timeoutMs: 0 });

        mcpController.abort();
        expect(signal.aborted).toBe(true);
    });

    it('aborts when either timeout or MCP signal fires', async () => {
        vi.useFakeTimers();
        const mcpController = new AbortController();
        const signal = createExecutionAbortSignal({ mcpSignal: mcpController.signal, timeoutMs: 5000 });

        mcpController.abort();
        expect(signal.aborted).toBe(true);

        const timeoutSignal = createExecutionAbortSignal({ timeoutMs: 1000 });
        const abortPromise = new Promise<void>((resolve) => {
            timeoutSignal.addEventListener('abort', () => {
                resolve();
            });
        });
        await vi.advanceTimersByTimeAsync(1000);
        await abortPromise;
        expect(timeoutSignal.aborted).toBe(true);
    });
});

describe('getAbortErrorInfo', () => {
    it('returns null for non-cancel errors', () => {
        const executionSignal = createExecutionAbortSignal({ timeoutMs: 0 });
        const info = getAbortErrorInfo(new Error('ECONNREFUSED'), {
            executionSignal,
            timeoutMs: 0,
        });
        expect(info).toBeNull();
    });

    it('detects timeout cancellation', () => {
        const executionSignal = AbortSignal.timeout(1000);
        const cancelError = new CanceledError('timeout', 'ERR_CANCELED');
        const info = getAbortErrorInfo(cancelError, {
            executionSignal,
            timeoutMs: 1000,
        });

        expect(info).toEqual({
            cancelled: true,
            cancelReason: 'timeout',
            message: 'Request timed out after 1000ms',
        });
    });

    it('detects MCP cancellation', () => {
        const mcpController = new AbortController();
        mcpController.abort();
        const executionSignal = createExecutionAbortSignal({
            mcpSignal: mcpController.signal,
            timeoutMs: 5000,
        });
        const cancelError = new CanceledError('cancelled', 'ERR_CANCELED');

        const info = getAbortErrorInfo(cancelError, {
            mcpSignal: mcpController.signal,
            executionSignal,
            timeoutMs: 5000,
        });

        expect(info).toEqual({
            cancelled: true,
            cancelReason: 'mcp_cancelled',
            message: 'Request was cancelled',
        });
    });
});
