export interface HarRequest {
    method: string;
    url: string;
    headers: HarHeader[];
    queryString: HarQueryString[];
    httpVersion: string;
    cookies: HarCookie[];
    headersSize: number;
    bodySize: number;
    postData?: HarPostData;
}

export interface HarHeader {
    name: string;
    value: string;
}

export interface HarQueryString {
    name: string;
    value: string;
}

export interface HarCookie {
    name: string;
    value: string;
}

export interface HarPostData {
    mimeType: string;
    text: string;
}

export type HttpSnippetTarget =
    | 'c'
    | 'clojure'
    | 'csharp'
    | 'go'
    | 'http'
    | 'java'
    | 'javascript'
    | 'kotlin'
    | 'node'
    | 'objc'
    | 'ocaml'
    | 'php'
    | 'powershell'
    | 'python'
    | 'ruby'
    | 'shell'
    | 'swift'
    | 'crystal'
    | 'r'
    | 'rust';
