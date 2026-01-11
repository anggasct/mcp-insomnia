export interface InsomniaAuthentication {
    type: 'basic' | 'bearer' | 'oauth1' | 'oauth2' | 'digest' | 'ntlm' | 'aws-iam-v4' | 'hawk';
    username?: string;
    password?: string;
    token?: string;
    prefix?: string;
    disabled?: boolean;
    consumerKey?: string;
    consumerSecret?: string;
    tokenKey?: string;
    tokenSecret?: string;
    signatureMethod?: string;
    grantType?: string;
    accessTokenUrl?: string;
    authorizationUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    region?: string;
    service?: string;
}
