import type { InsomniaResource } from './collection.js';

export type EnvironmentValue = string | number | boolean;

export interface InsomniaEnvironment extends InsomniaResource {
    _type: 'environment';
    data: Record<string, EnvironmentValue>;
    dataPropertyOrder?: Record<string, number>;
    color?: string;
    isPrivate?: boolean;
}

export interface SetEnvironmentVariableParams {
    collectionId: string;
    environmentId?: string;
    key: string;
    value: EnvironmentValue;
    description?: string;
}
