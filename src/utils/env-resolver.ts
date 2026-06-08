import type { CollectionStructure } from '../types/collection.js';
import type { EnvironmentValue } from '../types/environment.js';
import { InsomniaStorage } from '../storage/insomnia-storage.js';
import type { EnvironmentVariables } from './request-executor.js';

export interface EnvResolverWarning {
    type: string;
    folderId?: string;
    message: string;
}

export interface ResolvedEnvironment {
    variables: EnvironmentVariables;
    warnings?: EnvResolverWarning[];
}

export type AncestorChainEntry = { id: string; type: 'workspace' | 'folder' };

export function getCollectionAncestorChain(
    entityId: string,
    collection: CollectionStructure,
): AncestorChainEntry[] {
    const chain: AncestorChainEntry[] = [];
    const workspaceId = collection.workspace._id;
    let currentId = entityId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        if (currentId.startsWith('wrk_')) {
            if (currentId === workspaceId) {
                chain.unshift({ id: currentId, type: 'workspace' });
            }
            break;
        }

        if (currentId.startsWith('fld_')) {
            const folder = collection.folders.find((f) => f._id === currentId);
            if (folder) {
                chain.unshift({ id: currentId, type: 'folder' });
                currentId = folder.parentId || workspaceId;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    return chain;
}

function mergeEnvData(
    target: EnvironmentVariables,
    data: Record<string, EnvironmentValue> | undefined,
): void {
    if (!data) {
        return;
    }
    for (const [key, value] of Object.entries(data)) {
        target[key] = value;
    }
}

function mergeFolderEnvironment(
    target: EnvironmentVariables,
    environment: Record<string, string | number | boolean> | undefined,
): void {
    if (!environment) {
        return;
    }
    for (const [key, value] of Object.entries(environment)) {
        target[key] = value;
    }
}

export interface ResolveInternalEnvironmentOptions {
    collection: CollectionStructure;
    requestParentId: string;
    environmentId?: string;
    overrideVariables?: EnvironmentVariables;
    legacyEnvironmentVariables?: EnvironmentVariables;
}

export function resolveInternalEnvironmentVariables(
    options: ResolveInternalEnvironmentOptions,
): ResolvedEnvironment {
    const {
        collection,
        requestParentId,
        environmentId,
        overrideVariables,
        legacyEnvironmentVariables,
    } = options;

    const variables: EnvironmentVariables = {};
    const workspaceId = collection.workspace._id;

    for (const env of collection.environments) {
        if (env.parentId === workspaceId) {
            mergeEnvData(variables, env.data);
        }
    }

    if (environmentId) {
        const subEnv = collection.environments.find((e) => e._id === environmentId);
        if (subEnv) {
            mergeEnvData(variables, subEnv.data);
        }
    }

    const ancestors = getCollectionAncestorChain(requestParentId, collection);
    const folderIds = ancestors.filter((a) => a.type === 'folder').map((a) => a.id);

    for (const folderId of folderIds) {
        const folder = collection.folders.find((f) => f._id === folderId);
        if (folder) {
            mergeFolderEnvironment(variables, folder.environment);
        }
    }

    if (overrideVariables) {
        Object.assign(variables, overrideVariables);
    }

    if (legacyEnvironmentVariables) {
        Object.assign(variables, legacyEnvironmentVariables);
    }

    return { variables };
}

export interface ResolveInsomniaEnvironmentOptions {
    requestParentId: string;
    environmentId?: string;
    overrideVariables?: EnvironmentVariables;
}

export function resolveInsomniaEnvironmentVariables(
    insomniaStorage: InsomniaStorage,
    options: ResolveInsomniaEnvironmentOptions,
): ResolvedEnvironment {
    const { requestParentId, environmentId, overrideVariables } = options;
    const variables: EnvironmentVariables = {};
    const warnings: EnvResolverWarning[] = [];

    const ancestors = insomniaStorage.getAncestorChain(requestParentId);
    const workspaceAncestor = ancestors.find((a) => a.type === 'workspace');
    const workspaceId =
        workspaceAncestor?.id || (requestParentId.startsWith('wrk_') ? requestParentId : null);

    if (workspaceId) {
        const projectId = insomniaStorage.getWorkspaceProjectId(workspaceId);
        if (projectId) {
            const globalEnv = insomniaStorage.getGlobalEnvironment(projectId);
            if (globalEnv?.data) {
                mergeEnvData(variables, globalEnv.data as Record<string, EnvironmentValue>);
            }
        }

        const baseEnv = insomniaStorage.getBaseEnvironment(workspaceId);
        if (baseEnv?.data) {
            mergeEnvData(variables, baseEnv.data as Record<string, EnvironmentValue>);
        }
    }

    if (environmentId) {
        const allEnvs = insomniaStorage.getAllEnvironments();
        const subEnv = allEnvs.find((e) => e._id === environmentId);
        if (subEnv?.data) {
            mergeEnvData(variables, subEnv.data as Record<string, EnvironmentValue>);
        }
    }

    const folderIds = ancestors.filter((a) => a.type === 'folder').map((a) => a.id);
    const allFolders = insomniaStorage.getAllRequestGroups();

    for (const folderId of folderIds) {
        const folder = allFolders.find((f) => f._id === folderId);
        if (!folder) {
            warnings.push({
                type: 'FOLDER_NOT_FOUND',
                folderId,
                message: `Folder ${folderId} not found in hierarchy`,
            });
            continue;
        }
        if (Object.keys(folder.environment).length > 0) {
            mergeFolderEnvironment(variables, folder.environment);
        }
    }

    if (overrideVariables) {
        Object.assign(variables, overrideVariables);
    }

    return {
        variables,
        ...(warnings.length > 0 ? { warnings } : {}),
    };
}
