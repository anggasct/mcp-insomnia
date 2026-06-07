export type HeadersInput = Record<string, string | string[] | number | boolean | null | undefined>;

export const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000;

export type CancelReason = 'timeout' | 'mcp_cancelled';

export interface AbortErrorInfo {
    cancelled: true;
    cancelReason: CancelReason;
    message: string;
}

export interface ExecutionAbortOptions {
    mcpSignal?: AbortSignal;
    timeoutMs?: number;
}

export interface AbortErrorContext {
    mcpSignal?: AbortSignal;
    executionSignal: AbortSignal;
    timeoutMs: number;
}

const noopAbortController = new AbortController();

export function resolveExecutionTimeoutMs(timeoutMs?: number): number {
    return timeoutMs === undefined ? DEFAULT_EXECUTION_TIMEOUT_MS : timeoutMs;
}

export function createExecutionAbortSignal(options: ExecutionAbortOptions = {}): AbortSignal {
    const timeoutMs = resolveExecutionTimeoutMs(options.timeoutMs);
    const signals: AbortSignal[] = [];

    if (timeoutMs > 0) {
        signals.push(AbortSignal.timeout(timeoutMs));
    }

    if (options.mcpSignal && !options.mcpSignal.aborted) {
        signals.push(options.mcpSignal);
    }

    if (signals.length === 0) {
        return noopAbortController.signal;
    }

    if (signals.length === 1) {
        return signals[0];
    }

    return AbortSignal.any(signals);
}

function isTimeoutAbortReason(reason: unknown): boolean {
    return reason instanceof DOMException && reason.name === 'TimeoutError';
}

function isAxiosCancelError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ERR_CANCELED';
}

export function getAbortErrorInfo(error: unknown, context: AbortErrorContext): AbortErrorInfo | null {
    if (!isAxiosCancelError(error)) {
        return null;
    }

    if (context.mcpSignal?.aborted) {
        return {
            cancelled: true,
            cancelReason: 'mcp_cancelled',
            message: 'Request was cancelled',
        };
    }

    if (context.timeoutMs > 0 && isTimeoutAbortReason(context.executionSignal.reason)) {
        return {
            cancelled: true,
            cancelReason: 'timeout',
            message: `Request timed out after ${String(context.timeoutMs)}ms`,
        };
    }

    if (context.timeoutMs > 0) {
        return {
            cancelled: true,
            cancelReason: 'timeout',
            message: `Request timed out after ${String(context.timeoutMs)}ms`,
        };
    }

    return {
        cancelled: true,
        cancelReason: 'mcp_cancelled',
        message: 'Request was cancelled',
    };
}

export interface CappedResponsePayload {
    data: unknown;
    size: number;
    truncated: boolean;
    maxResponseBytes?: number;
}

export function serializedByteLength(value: unknown): number {
    if (value === undefined) {
        return 0;
    }
    return JSON.stringify(value).length;
}

export function capResponsePayload(data: unknown, maxResponseBytes?: number): CappedResponsePayload {
    const size = serializedByteLength(data);

    if (maxResponseBytes === undefined || maxResponseBytes <= 0 || size <= maxResponseBytes) {
        return { data, size, truncated: false };
    }

    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return {
        data: serialized.slice(0, maxResponseBytes),
        size,
        truncated: true,
        maxResponseBytes,
    };
}

export function normalizeHeaders(headers: HeadersInput | undefined): Record<string, string> {
    const normalized: Record<string, string> = {};
    if (headers) {
        for (const [key, value] of Object.entries(headers)) {
            if (value !== null && value !== undefined) {
                normalized[key] = String(value);
            }
        }
    }
    return normalized;
}
