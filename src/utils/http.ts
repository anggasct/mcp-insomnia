export type HeadersInput = Record<string, string | string[] | number | boolean | null | undefined>;

export function serializedByteLength(value: unknown): number {
    if (value === undefined) {
        return 0;
    }
    return JSON.stringify(value).length;
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
