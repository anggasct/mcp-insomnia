import type { HttpMethod, InsomniaHeader, InsomniaParameter, InsomniaRequestBody } from '../types/request.js';

const DATA_FLAGS = ['--data-binary', '--data-raw', '--data', '-d'] as const;

/** Read a quoted or unquoted token starting at `start`. Supports \\ and \' / \" escapes inside quotes. */
function readQuotedOrUnquotedValue(command: string, start: number): string {
    if (start >= command.length) {
        return '';
    }

    const quote = command[start];
    if (quote === "'" || quote === '"') {
        let i = start + 1;
        let result = '';
        while (i < command.length) {
            if (command[i] === '\\' && i + 1 < command.length) {
                result += command[i + 1];
                i += 2;
                continue;
            }
            if (command[i] === quote) {
                return result;
            }
            result += command[i];
            i++;
        }
        return result;
    }

    let i = start;
    let result = '';
    while (i < command.length && !/\s/.test(command[i])) {
        result += command[i];
        i++;
    }
    return result;
}

/** Extract -d / --data* body value with quote-aware parsing. Header -H values still use the legacy regex. */
function extractDataFlagValue(command: string): string | undefined {
    let earliestIndex = Infinity;
    let valueStart = -1;

    for (const flag of DATA_FLAGS) {
        const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundary = flag === '--data' ? '(?=\\s|=|$)' : '';
        const regex = new RegExp(`(?:^|\\s)${escaped}${boundary}(?:\\s|=)`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(command)) !== null) {
            const flagIndex = match.index + (command[match.index] === ' ' ? 1 : 0);
            let pos = flagIndex + flag.length;
            while (pos < command.length && /\s/.test(command[pos])) {
                pos++;
            }
            if (command[pos] === '=') {
                pos++;
                while (pos < command.length && /\s/.test(command[pos])) {
                    pos++;
                }
            }
            if (command[pos] === '@') {
                continue;
            }
            if (flagIndex < earliestIndex) {
                earliestIndex = flagIndex;
                valueStart = pos;
            }
        }
    }

    if (valueStart === -1) {
        return undefined;
    }
    return readQuotedOrUnquotedValue(command, valueStart);
}

export interface ParsedCurlRequest {
    method: HttpMethod;
    url: string;
    headers: InsomniaHeader[];
    parameters: InsomniaParameter[];
    body?: InsomniaRequestBody;
}

export function parseCurlCommand(curlCommand: string): ParsedCurlRequest {
    const normalized = curlCommand
        .replace(/\\\n/g, ' ')
        .replace(/\\\r\n/g, ' ')
        .trim();

    let method: HttpMethod = 'GET';
    let url = '';
    const headers: InsomniaHeader[] = [];
    const parameters: InsomniaParameter[] = [];
    let body: InsomniaRequestBody | undefined;

    const urlMatch = normalized.match(/curl\s+(?:['"]([^'"]+)['"]|(\S+))/);
    if (urlMatch) {
        url = urlMatch[1] || urlMatch[2] || '';
    }

    const quotedUrlMatch = normalized.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
    if (quotedUrlMatch) {
        url = quotedUrlMatch[1];
    }

    const methodMatch = normalized.match(/(?:-X|--request)\s+['"]?(\w+)['"]?/i);
    if (methodMatch) {
        method = methodMatch[1].toUpperCase() as HttpMethod;
    }

    // Extract headers (-H or --header)
    const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/g;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(normalized)) !== null) {
        const headerStr = headerMatch[1];
        const colonIndex = headerStr.indexOf(':');
        if (colonIndex > 0) {
            const name = headerStr.substring(0, colonIndex).trim();
            const value = headerStr.substring(colonIndex + 1).trim();
            headers.push({ name, value });
        }
    }

    // Extract data (-d or --data or --data-raw or --data-binary)
    const bodyText = extractDataFlagValue(normalized);
    if (bodyText !== undefined) {
        method = method === 'GET' ? 'POST' : method; // Default to POST if data is present

        const contentTypeHeader = headers.find((h) => h.name.toLowerCase() === 'content-type');
        const mimeType = contentTypeHeader?.value || 'application/x-www-form-urlencoded';

        body = {
            mimeType,
            text: bodyText,
        };
    }

    // Extract data from @ file reference
    const dataFileMatch = normalized.match(/(?:-d|--data(?:-raw|-binary)?)\s+@['"]?([^\s'"]+)['"]?/);
    if (dataFileMatch) {
        method = method === 'GET' ? 'POST' : method;
        body = {
            mimeType: 'application/octet-stream',
            fileName: dataFileMatch[1],
        };
    }

    // Extract query parameters from URL
    if (url.includes('?')) {
        const urlObj = new URL(url);
        urlObj.searchParams.forEach((value, name) => {
            parameters.push({ name, value });
        });
        // Clean URL
        url = `${urlObj.origin}${urlObj.pathname}`;
    }

    // Extract user (-u or --user) for basic auth
    const userMatch = normalized.match(/(?:-u|--user)\s+['"]?([^:'"]+):([^\s'"]+)['"]?/);
    if (userMatch) {
        const [, username, password] = userMatch;
        const authValue = Buffer.from(`${username}:${password}`).toString('base64');
        headers.push({ name: 'Authorization', value: `Basic ${authValue}` });
    }

    if (!url) {
        throw new Error('Could not parse URL from cURL command');
    }

    return {
        method,
        url,
        headers,
        parameters,
        body,
    };
}
