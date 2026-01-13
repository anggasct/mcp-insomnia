import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { CollectionStructure, InsomniaWorkspace, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';

export class InsomniaStorage {
    private readonly insomniaDir: string;

    constructor(customPath?: string) {
        this.insomniaDir = customPath || this.detectInsomniaPath();
    }

    private detectInsomniaPath(): string {
        const platform = process.platform;
        let basePath: string;

        if (platform === 'darwin') {
            basePath = path.join(os.homedir(), 'Library', 'Application Support', 'Insomnia');
        } else if (platform === 'linux') {
            basePath = path.join(os.homedir(), '.config', 'Insomnia');
        } else if (platform === 'win32') {
            basePath = path.join(process.env.APPDATA || '', 'Insomnia');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        return basePath;
    }

    isInsomniaInstalled(): boolean {
        return fs.existsSync(this.insomniaDir);
    }

    getInsomniaPath(): string {
        return this.insomniaDir;
    }

    private readNeDB<T>(filename: string): T[] {
        const filePath = path.join(this.insomniaDir, filename);
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        return lines
            .map((line) => {
                try {
                    return JSON.parse(line) as T;
                } catch {
                    return null;
                }
            })
            .filter((item): item is T => item !== null);
    }

    private writeNeDB(filename: string, records: unknown[]): void {
        const filePath = path.join(this.insomniaDir, filename);
        const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
        fs.writeFileSync(filePath, content, 'utf-8');
    }

    private appendNeDB(filename: string, record: unknown): void {
        const filePath = path.join(this.insomniaDir, filename);
        const line = JSON.stringify(record) + '\n';
        fs.appendFileSync(filePath, line, 'utf-8');
    }

    getAllWorkspaces(): InsomniaWorkspaceRaw[] {
        return this.readNeDB<InsomniaWorkspaceRaw>('insomnia.Workspace.db');
    }

    getAllRequests(): InsomniaRequestRaw[] {
        return this.readNeDB<InsomniaRequestRaw>('insomnia.Request.db');
    }

    getAllRequestGroups(): InsomniaRequestGroupRaw[] {
        return this.readNeDB<InsomniaRequestGroupRaw>('insomnia.RequestGroup.db');
    }

    getAllEnvironments(): InsomniaEnvironmentRaw[] {
        return this.readNeDB<InsomniaEnvironmentRaw>('insomnia.Environment.db');
    }

    getAllProjects(): InsomniaProjectRaw[] {
        return this.readNeDB<InsomniaProjectRaw>('insomnia.Project.db');
    }

    getCollection(workspaceId: string): CollectionStructure | null {
        const workspaces = this.getAllWorkspaces();
        const workspace = workspaces.find((w) => w._id === workspaceId);

        if (!workspace) {
            return null;
        }

        const allRequests = this.getAllRequests();
        const allFolders = this.getAllRequestGroups();
        const allEnvironments = this.getAllEnvironments();

        const workspaceFolderIds = new Set<string>();
        const processedIds = new Set<string>([workspaceId]);

        for (const folder of allFolders) {
            if (folder.parentId === workspaceId) {
                workspaceFolderIds.add(folder._id);
                processedIds.add(folder._id);
            }
        }

        let foundNew = true;
        while (foundNew) {
            foundNew = false;
            for (const folder of allFolders) {
                if (processedIds.has(folder.parentId) && !workspaceFolderIds.has(folder._id)) {
                    workspaceFolderIds.add(folder._id);
                    processedIds.add(folder._id);
                    foundNew = true;
                }
            }
        }

        const requests = allRequests
            .filter((r) => r.parentId === workspaceId || workspaceFolderIds.has(r.parentId))
            .map((r) => this.convertRequest(r));

        const folders = allFolders.filter((f) => workspaceFolderIds.has(f._id)).map((f) => this.convertRequestGroup(f));

        const environments = allEnvironments
            .filter((e) => e.parentId === workspaceId)
            .map((e) => this.convertEnvironment(e));

        return {
            workspace: this.convertWorkspace(workspace),
            folders,
            requests,
            environments,
        };
    }

    getAllCollections(): Map<string, CollectionStructure> {
        const collections = new Map<string, CollectionStructure>();
        const workspaces = this.getAllWorkspaces();

        for (const workspace of workspaces) {
            const collection = this.getCollection(workspace._id);
            if (collection) {
                collections.set(workspace._id, collection);
            }
        }

        return collections;
    }

    saveRequest(request: InsomniaRequest): void {
        const raw = this.convertToRawRequest(request);

        const existing = this.getAllRequests();
        const index = existing.findIndex((r) => r._id === request._id);

        if (index >= 0) {
            existing[index] = raw;
            this.writeNeDB('insomnia.Request.db', existing);
        } else {
            this.appendNeDB('insomnia.Request.db', raw);
        }
    }

    saveWorkspace(workspace: InsomniaWorkspace, projectId?: string): void {
        const raw: InsomniaWorkspaceRaw = {
            _id: workspace._id,
            type: 'Workspace',
            parentId: projectId || 'proj_default',
            modified: workspace.modified,
            created: workspace.created,
            name: workspace.name,
            description: workspace.description || '',
            scope: workspace.scope,
        };

        const existing = this.getAllWorkspaces();
        const index = existing.findIndex((w) => w._id === workspace._id);

        if (index >= 0) {
            existing[index] = raw;
            this.writeNeDB('insomnia.Workspace.db', existing);
        } else {
            this.appendNeDB('insomnia.Workspace.db', raw);
        }
    }

    saveRequestGroup(folder: InsomniaRequestGroup): void {
        const raw: InsomniaRequestGroupRaw = {
            _id: folder._id,
            type: 'RequestGroup',
            parentId: folder.parentId || '',
            modified: folder.modified,
            created: folder.created,
            name: folder.name,
            description: folder.description || '',
            environment: folder.environment || {},
            metaSortKey: -Date.now(),
        };

        const existing = this.getAllRequestGroups();
        const index = existing.findIndex((f) => f._id === folder._id);

        if (index >= 0) {
            existing[index] = raw;
            this.writeNeDB('insomnia.RequestGroup.db', existing);
        } else {
            this.appendNeDB('insomnia.RequestGroup.db', raw);
        }
    }

    saveEnvironment(env: InsomniaEnvironment): void {
        const raw: InsomniaEnvironmentRaw = {
            _id: env._id,
            type: 'Environment',
            parentId: env.parentId || '',
            modified: env.modified,
            created: env.created,
            name: env.name,
            data: env.data,
            isPrivate: env.isPrivate || false,
            metaSortKey: -Date.now(),
        };

        const existing = this.getAllEnvironments();
        const index = existing.findIndex((e) => e._id === env._id);

        if (index >= 0) {
            existing[index] = raw;
            this.writeNeDB('insomnia.Environment.db', existing);
        } else {
            this.appendNeDB('insomnia.Environment.db', raw);
        }
    }

    deleteRequest(requestId: string): boolean {
        const existing = this.getAllRequests();
        const filtered = existing.filter((r) => r._id !== requestId);

        if (filtered.length < existing.length) {
            this.writeNeDB('insomnia.Request.db', filtered);
            return true;
        }
        return false;
    }

    getWorkspaceProjectId(workspaceId: string): string | null {
        const workspaces = this.getAllWorkspaces();
        const workspace = workspaces.find((w) => w._id === workspaceId);
        return workspace?.parentId || null;
    }

    getGlobalEnvironment(projectId: string): InsomniaEnvironmentRaw | null {
        if (!projectId) return null;

        const workspaces = this.getAllWorkspaces();
        const globalWorkspace = workspaces.find((w) => w.parentId === projectId && w.scope === 'environment');

        if (!globalWorkspace) return null;

        const environments = this.getAllEnvironments();
        return environments.find((e) => e.parentId === globalWorkspace._id) || null;
    }

    getBaseEnvironment(workspaceId: string): InsomniaEnvironmentRaw | null {
        const environments = this.getAllEnvironments();
        return environments.find((e) => e.parentId === workspaceId) || null;
    }

    getAncestorChain(entityId: string): Array<{ id: string; type: 'workspace' | 'folder' }> {
        const chain: Array<{ id: string; type: 'workspace' | 'folder' }> = [];
        const allFolders = this.getAllRequestGroups();
        const allWorkspaces = this.getAllWorkspaces();

        let currentId = entityId;
        const visited = new Set<string>();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);

            if (currentId.startsWith('wrk_')) {
                const workspace = allWorkspaces.find((w) => w._id === currentId);
                if (workspace) {
                    chain.unshift({ id: currentId, type: 'workspace' });
                }
                break;
            }

            if (currentId.startsWith('fld_')) {
                const folder = allFolders.find((f) => f._id === currentId);
                if (folder) {
                    chain.unshift({ id: currentId, type: 'folder' });
                    currentId = folder.parentId;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return chain;
    }

    private convertWorkspace(raw: InsomniaWorkspaceRaw): InsomniaWorkspace {
        return {
            _id: raw._id,
            _type: 'workspace',
            name: raw.name,
            description: raw.description,
            scope: raw.scope as 'collection' | 'design',
            modified: raw.modified,
            created: raw.created,
        };
    }

    private convertRequest(raw: InsomniaRequestRaw): InsomniaRequest {
        return {
            _id: raw._id,
            _type: 'request',
            parentId: raw.parentId,
            name: raw.name,
            description: raw.description,
            url: raw.url,
            method: raw.method as InsomniaRequest['method'],
            headers: raw.headers.map((h) => ({
                name: h.name,
                value: h.value,
                description: h.description,
                disabled: h.disabled,
            })),
            parameters: raw.parameters.map((p) => ({
                name: p.name,
                value: p.value,
                disabled: p.disabled,
            })),
            body: {
                mimeType: raw.body.mimeType,
                text: raw.body.text,
            },
            authentication:
                Object.keys(raw.authentication).length > 0
                    ? (raw.authentication as unknown as InsomniaRequest['authentication'])
                    : undefined,
            modified: raw.modified,
            created: raw.created,
        };
    }

    private convertRequestGroup(raw: InsomniaRequestGroupRaw): InsomniaRequestGroup {
        return {
            _id: raw._id,
            _type: 'request_group',
            parentId: raw.parentId,
            name: raw.name,
            description: raw.description,
            environment: raw.environment,
            modified: raw.modified,
            created: raw.created,
        };
    }

    private convertEnvironment(raw: InsomniaEnvironmentRaw): InsomniaEnvironment {
        return {
            _id: raw._id,
            _type: 'environment',
            parentId: raw.parentId,
            name: raw.name,
            data: raw.data,
            isPrivate: raw.isPrivate,
            modified: raw.modified,
            created: raw.created,
        };
    }

    private convertToRawRequest(request: InsomniaRequest): InsomniaRequestRaw {
        return {
            _id: request._id,
            type: 'Request',
            parentId: request.parentId || '',
            modified: request.modified,
            created: request.created,
            url: request.url,
            name: request.name,
            description: request.description || '',
            method: request.method,
            body: request.body
                ? {
                      mimeType: request.body.mimeType || 'application/json',
                      text: request.body.text || '',
                  }
                : {},
            parameters: request.parameters.map((p) => ({
                name: p.name,
                value: p.value,
                disabled: p.disabled || false,
            })),
            headers: request.headers.map((h) => ({
                name: h.name,
                value: h.value,
                id: `pair_${String(Date.now())}`,
                disabled: h.disabled || false,
                description: h.description,
            })),
            authentication: (request.authentication || {}) as Record<string, unknown>,
            metaSortKey: -Date.now(),
            isPrivate: false,
            settingStoreCookies: true,
            settingSendCookies: true,
            settingDisableRenderRequestBody: false,
            settingEncodeUrl: true,
            settingRebuildPath: true,
            settingFollowRedirects: 'global',
        };
    }
}

interface InsomniaWorkspaceRaw {
    _id: string;
    type: 'Workspace';
    parentId: string;
    modified: number;
    created: number;
    name: string;
    description: string;
    scope: string;
}

interface InsomniaRequestRaw {
    _id: string;
    type: 'Request';
    parentId: string;
    modified: number;
    created: number;
    url: string;
    name: string;
    description: string;
    method: string;
    body: {
        mimeType?: string;
        text?: string;
    };
    parameters: Array<{
        name: string;
        value: string;
        disabled?: boolean;
    }>;
    headers: Array<{
        name: string;
        value: string;
        id?: string;
        disabled?: boolean;
        description?: string;
    }>;
    authentication: Record<string, unknown>;
    metaSortKey: number;
    isPrivate: boolean;
    settingStoreCookies: boolean;
    settingSendCookies: boolean;
    settingDisableRenderRequestBody: boolean;
    settingEncodeUrl: boolean;
    settingRebuildPath: boolean;
    settingFollowRedirects: string;
}

interface InsomniaRequestGroupRaw {
    _id: string;
    type: 'RequestGroup';
    parentId: string;
    modified: number;
    created: number;
    name: string;
    description: string;
    environment: Record<string, string | number | boolean>;
    metaSortKey: number;
}

interface InsomniaEnvironmentRaw {
    _id: string;
    type: 'Environment';
    parentId: string;
    modified: number;
    created: number;
    name: string;
    data: Record<string, string | number | boolean>;
    isPrivate: boolean;
    metaSortKey: number;
}

interface InsomniaProjectRaw {
    _id: string;
    type: 'Project';
    parentId: string;
    modified: number;
    created: number;
    name: string;
    remoteId: string | null;
    gitRepositoryId: string | null;
}

export const insomniaStorage = new InsomniaStorage();
