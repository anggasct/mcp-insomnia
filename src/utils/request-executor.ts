import axios, { AxiosError } from 'axios';
import type { InsomniaRequest } from '../types/request.js';
import type { ResponseData } from '../types/request.js';
import {
    capResponsePayload,
    createExecutionAbortSignal,
    getAbortErrorInfo,
    normalizeHeaders,
    resolveExecutionTimeoutMs,
    type CappedResponsePayload,
    type CancelReason,
    type HeadersInput,
} from './http.js';

export type EnvironmentVariables = Record<string, string | number | boolean>;

export interface ProcessedRequestParts {
    url: string;
    headers: Record<string, string>;
    body: string | Record<string, unknown> | undefined;
}

function substituteTemplate(value: string, environmentVariables: EnvironmentVariables): string {
    let result = value;
    for (const [key, envValue] of Object.entries(environmentVariables)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(envValue));
    }
    return result;
}

function applyAuthentication(
    headers: Record<string, string>,
    authentication: InsomniaRequest['authentication'],
): void {
    if (!authentication) {
        return;
    }

    switch (authentication.type) {
        case 'bearer':
            headers['Authorization'] = `Bearer ${authentication.token ?? ''}`;
            break;
        case 'basic': {
            const credentials = Buffer.from(
                `${authentication.username ?? ''}:${authentication.password ?? ''}`,
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
            break;
        }
    }
}

export function buildProcessedRequest(
    request: InsomniaRequest,
    environmentVariables: EnvironmentVariables,
    jsonMimeTypes: string[] = ['application/json'],
): ProcessedRequestParts {
    const processedUrl = substituteTemplate(request.url, environmentVariables);

    const processedHeaders: Record<string, string> = {};
    request.headers.forEach((header) => {
        if (!header.disabled) {
            processedHeaders[header.name] = substituteTemplate(header.value, environmentVariables);
        }
    });

    applyAuthentication(processedHeaders, request.authentication);

    let processedBody: string | Record<string, unknown> | undefined = undefined;
    if (request.body) {
        if (request.body.graphql) {
            const gql = request.body.graphql;
            let variablesStr = gql.variables || '{}';
            variablesStr = substituteTemplate(variablesStr, environmentVariables);

            let variables: unknown = {};
            try {
                variables = JSON.parse(variablesStr);
            } catch {
                // keep {}
            }

            const query = substituteTemplate(gql.query, environmentVariables);
            processedBody = { query, variables };
        } else if (request.body.text) {
            processedBody = substituteTemplate(request.body.text, environmentVariables);

            if (request.body.mimeType && jsonMimeTypes.includes(request.body.mimeType)) {
                try {
                    processedBody = JSON.parse(processedBody) as Record<string, unknown>;
                } catch {
                    // keep string
                }
            }
        }
    }

    return { url: processedUrl, headers: processedHeaders, body: processedBody };
}

export interface HttpExecutionSuccess {
    kind: 'success';
    processed: ProcessedRequestParts;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
    rawData: unknown;
    duration: number;
    capped: CappedResponsePayload;
}

export interface HttpExecutionCancelled {
    kind: 'cancelled';
    processed: ProcessedRequestParts;
    cancelReason: CancelReason;
    message: string;
    duration: number;
}

export interface HttpExecutionError {
    kind: 'error';
    processed: ProcessedRequestParts;
    message: string;
    code?: string;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: unknown;
    duration: number;
    capped: CappedResponsePayload;
}

export type HttpExecutionResult = HttpExecutionSuccess | HttpExecutionCancelled | HttpExecutionError;

export interface ExecuteHttpRequestOptions {
    request: InsomniaRequest;
    environmentVariables: EnvironmentVariables;
    mcpSignal?: AbortSignal;
    timeoutMs?: number;
    maxResponseBytes?: number;
    validateStatus?: (status: number) => boolean;
    jsonMimeTypes?: string[];
}

export async function executeHttpRequest(options: ExecuteHttpRequestOptions): Promise<HttpExecutionResult> {
    const {
        request,
        environmentVariables,
        mcpSignal,
        timeoutMs,
        maxResponseBytes,
        validateStatus,
        jsonMimeTypes = ['application/json'],
    } = options;

    const processed = buildProcessedRequest(request, environmentVariables, jsonMimeTypes);
    const resolvedTimeoutMs = resolveExecutionTimeoutMs(timeoutMs);
    const executionSignal = createExecutionAbortSignal({ mcpSignal, timeoutMs });
    const startTime = Date.now();

    try {
        const response = await axios({
            method: request.method.toLowerCase() as
                | 'get'
                | 'post'
                | 'put'
                | 'delete'
                | 'patch'
                | 'head'
                | 'options',
            url: processed.url,
            headers: processed.headers,
            data: processed.body,
            signal: executionSignal,
            ...(validateStatus !== undefined ? { validateStatus } : {}),
        });

        const duration = Date.now() - startTime;
        const capped = capResponsePayload(response.data, maxResponseBytes);

        return {
            kind: 'success',
            processed,
            status: response.status,
            statusText: response.statusText,
            headers: normalizeHeaders(response.headers as HeadersInput),
            data: capped.data,
            rawData: response.data,
            duration,
            capped,
        };
    } catch (err) {
        const duration = Date.now() - startTime;
        const abortInfo = getAbortErrorInfo(err, {
            mcpSignal,
            executionSignal,
            timeoutMs: resolvedTimeoutMs,
        });

        if (abortInfo) {
            return {
                kind: 'cancelled',
                processed,
                cancelReason: abortInfo.cancelReason,
                message: abortInfo.message,
                duration,
            };
        }

        const error = err as AxiosError<ResponseData> & { code?: string };
        const responseData = error.response?.data;
        const capped = capResponsePayload(responseData, maxResponseBytes);

        return {
            kind: 'error',
            processed,
            message: error.message || 'Unknown error',
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            headers: error.response?.headers
                ? normalizeHeaders(error.response.headers as HeadersInput)
                : undefined,
            data: capped.data,
            duration,
            capped,
        };
    }
}
