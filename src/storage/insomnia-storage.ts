import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'node:crypto';
import type { CollectionStructure, InsomniaWorkspace, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';

function newPairId(): string {
    return `pair_${randomUUID().replace(/-/g, '')}`;
}

function isValidPairId(id: unknown): id is string {
    return typeof id === 'string' && id.trim().length > 0;
}

/** Keep an existing pair id only when it is valid and unused in this list. */
function ensureUniquePairId(id: unknown, used: Set<string>): string {
    if (isValidPairId(id) && !used.has(id)) {
        used.add(id);
        return id;
    }

    let next = newPairId();
    while (used.has(next)) {
        next = newPairId();
    }
    used.add(next);
    return next;
}

export class InsomniaStorage {
    private readonly insomniaDir: string;
    private readonly checkedPaths: string[];

    constructor(customPath?: string) {
        const envPath = process.env.INSOMNIA_DATA_DIR;
        if (customPath) {
            this.insomniaDir = customPath;
            this.checkedPaths = [customPath];
        } else if (envPath) {
            this.insomniaDir = envPath;
            this.checkedPaths = [envPath];
        } else {
            const { selected, candidates } = this.detectInsomniaPath();
            this.insomniaDir = selected;
            this.checkedPaths = candidates;
        }
    }

    private detectInsomniaPath(): { selected: string; candidates: string[] } {
        const platform = process.platform;
        const candidates: string[] = [];

        if (platform === 'darwin') {
            candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Insomnia'));
        } else if (platform === 'linux') {
            candidates.push(
                path.join(os.homedir(), '.config', 'Insomnia'),
                path.join(os.homedir(), '.var', 'app', 'rest.insomnia.Insomnia', 'config', 'Insomnia'),
            );
        } else if (platform === 'win32') {
            candidates.push(path.join(process.env.APPDATA || '', 'Insomnia'));
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        const selected = candidates.find((p) => fs.existsSync(p)) || candidates[0];
        return { selected, candidates };
    }

    isInsomniaInstalled(): boolean {
        return fs.existsSync(this.insomniaDir);
    }

    getInsomniaPath(): string {
        return this.insomniaDir;
    }

    getNotInstalledMessage(): string {
        const pathsList = this.checkedPaths.map((p) => `  - ${p}`).join('\n');
        return `Insomnia data directory not found. Checked:\n${pathsList}\n\nSet INSOMNIA_DATA_DIR environment variable to specify a custom path.`;
    }

    private readNeDB<T extends { _id?: string; modified?: number; $$deleted?: boolean }>(
        filename: string,
    ): T[] {
        const filePath = path.join(this.insomniaDir, filename);
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        // NeDB append-only stores: multiple revisions per _id, and soft-deletes via $$deleted.
        // Replay in file order — later live rows replace earlier ones for the same _id,
        // and $$deleted removes the id (even if modified is missing or clock-skewed).
        const latestById = new Map<string, T>();

        for (const line of lines) {
            let item: T;
            try {
                item = JSON.parse(line) as T;
            } catch {
                continue;
            }

            if (!item || typeof item !== 'object' || !item._id) {
                continue;
            }

            if (item.$$deleted) {
                latestById.delete(item._id);
                continue;
            }

            latestById.set(item._id, item);
        }

        return Array.from(latestById.values());
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

        const collectedEnvIds = new Set<string>();
        for (const env of allEnvironments) {
            if (env.parentId === workspaceId) {
                collectedEnvIds.add(env._id);
            }
        }

        let foundNewEnv = true;
        while (foundNewEnv) {
            foundNewEnv = false;
            for (const env of allEnvironments) {
                if (!collectedEnvIds.has(env._id) && collectedEnvIds.has(env.parentId)) {
                    collectedEnvIds.add(env._id);
                    foundNewEnv = true;
                }
            }
        }

        const environments = allEnvironments
            .filter((e) => collectedEnvIds.has(e._id))
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

    convertRequest(raw: InsomniaRequestRaw): InsomniaRequest {
        // Real Insomnia NeDB rows often store null for these fields.
        const headers = Array.isArray(raw.headers) ? raw.headers : [];
        const parameters = Array.isArray(raw.parameters) ? raw.parameters : [];
        const body = raw.body && typeof raw.body === 'object' ? raw.body : {};
        const authentication =
            raw.authentication && typeof raw.authentication === 'object' ? raw.authentication : {};

        return {
            _id: raw._id,
            _type: 'request',
            parentId: raw.parentId,
            name: raw.name,
            description: raw.description,
            url: raw.url,
            method: raw.method as InsomniaRequest['method'],
            headers: headers.map((h) => ({
                id: h.id,
                name: h.name,
                value: h.value,
                description: h.description,
                disabled: h.disabled,
            })),
            parameters: parameters.map((p) => ({
                id: p.id,
                name: p.name,
                value: p.value,
                disabled: p.disabled,
            })),
            body: {
                mimeType: body.mimeType,
                text: body.text,
            },
            authentication:
                Object.keys(authentication).length > 0
                    ? (authentication as unknown as InsomniaRequest['authentication'])
                    : undefined,
            modified: raw.modified,
            created: raw.created,
        };
    }

    getRequestById(requestId: string): InsomniaRequest | null {
        const raw = this.getAllRequests().find((r) => r._id === requestId);
        return raw ? this.convertRequest(raw) : null;
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
            data: raw.data && typeof raw.data === 'object' ? raw.data : {},
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
            // Insomnia React keys pair rows by `id`. Missing/duplicate/invalid ids
            // break the UI with "Render Failure: Invalid array length".
            parameters: (() => {
                const used = new Set<string>();
                return request.parameters.map((p) => ({
                    id: ensureUniquePairId(p.id, used),
                    name: p.name,
                    value: p.value,
                    disabled: p.disabled || false,
                }));
            })(),
            headers: (() => {
                const used = new Set<string>();
                return request.headers.map((h) => ({
                    name: h.name,
                    value: h.value,
                    id: ensureUniquePairId(h.id, used),
                    disabled: h.disabled || false,
                    description: h.description,
                }));
            })(),
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

export interface InsomniaRequestRaw {
    _id: string;
    type: 'Request';
    parentId: string;
    modified: number;
    created: number;
    url: string;
    name: string;
    description: string;
    method: string;
    body?: {
        mimeType?: string;
        text?: string;
    } | null;
    parameters?: Array<{
        name: string;
        value: string;
        id?: string;
        disabled?: boolean;
    }> | null;
    headers?: Array<{
        name: string;
        value: string;
        id?: string;
        disabled?: boolean;
        description?: string;
    }> | null;
    authentication?: Record<string, unknown> | null;
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
    data?: Record<string, string | number | boolean> | null;
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
