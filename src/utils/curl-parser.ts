import type { HttpMethod, InsomniaHeader, InsomniaParameter, InsomniaRequestBody } from '../types/request.js';

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
    const dataMatch = normalized.match(/(?:-d|--data(?:-raw|-binary)?)\s+['"]([^'"]*)['"]/);
    if (dataMatch) {
        const bodyText = dataMatch[1];
        method = method === 'GET' ? 'POST' : method; // Default to POST if data is present

        // Determine content type from headers
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
