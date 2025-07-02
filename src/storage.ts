import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CollectionStructure, InsomniaExecution } from './types.js';

const MAX_HISTORY_LENGTH = 20;

export class PersistentStorage {
  private readonly storageDir: string;
  private readonly collectionsFile: string;


  constructor(customDir?: string) {
    this.storageDir = customDir ?? path.join(os.homedir(), '.mcp-insomnia');
    this.collectionsFile = path.join(this.storageDir, 'collections.json');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private readCollectionsFromFile(): Map<string, CollectionStructure> {
    try {
      if (!fs.existsSync(this.collectionsFile)) {
        return new Map();
      }

      const data = fs.readFileSync(this.collectionsFile, 'utf-8');
      const collectionsData = JSON.parse(data);

      const collections = new Map<string, CollectionStructure>();
      for (const [id, structure] of Object.entries(collectionsData)) {
        collections.set(id, structure as CollectionStructure);
      }

      return collections;
    } catch (error) {
      console.error('Error reading collections from file:', error);
      return new Map();
    }
  }

  private writeCollectionsToFile(collections: Map<string, CollectionStructure>): void {
    try {
      const collectionsData: Record<string, CollectionStructure> = {};
      for (const [id, structure] of collections.entries()) {
        collectionsData[id] = structure;
      }

      fs.writeFileSync(
        this.collectionsFile,
        JSON.stringify(collectionsData, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error writing collections to file:', error);
      throw error;
    }
  }

  public getAllCollections(): Map<string, CollectionStructure> {
    return this.readCollectionsFromFile();
  }

  public getCollection(id: string): CollectionStructure | undefined {
    const collections = this.readCollectionsFromFile();
    return collections.get(id);
  }

  public saveCollection(id: string, structure: CollectionStructure): void {
    const collections = this.readCollectionsFromFile();
    collections.set(id, structure);
    this.writeCollectionsToFile(collections);
  }

  public deleteCollection(id: string): boolean {
    const collections = this.readCollectionsFromFile();
    const deleted = collections.delete(id);
    if (deleted) {
      this.writeCollectionsToFile(collections);
    }
    return deleted;
  }

  public updateCollection(id: string, updateFn: (structure: CollectionStructure) => CollectionStructure): boolean {
    const collections = this.readCollectionsFromFile();
    const existing = collections.get(id);

    if (!existing) {
      return false;
    }

    const updated = updateFn(existing);
    collections.set(id, updated);
    this.writeCollectionsToFile(collections);
    return true;
  }

  public addExecution(collectionId: string, requestId: string, execution: InsomniaExecution): boolean {
    const collections = this.readCollectionsFromFile();
    const collection = collections.get(collectionId);

    if (!collection) {
      return false;
    }

    const request = collection.requests.find(r => r._id === requestId);
    if (!request) {
      return false;
    }

    if (!request.history) {
      request.history = [];
    }

    request.history.unshift(execution);

    if (request.history.length > MAX_HISTORY_LENGTH) {
      request.history = request.history.slice(0, MAX_HISTORY_LENGTH);
    }

    collections.set(collectionId, collection);
    this.writeCollectionsToFile(collections);
    return true;
  }

  public collectionExists(id: string): boolean {
    const collections = this.readCollectionsFromFile();
    return collections.has(id);
  }

  public listCollectionIds(): string[] {
    const collections = this.readCollectionsFromFile();
    return Array.from(collections.keys());
  }

  public getStorageInfo(): {
    storageDir: string;
    collectionsFile: string;
    collectionsCount: number;
    fileSize: number;
    lastModified: Date | null;
  } {
    const collections = this.readCollectionsFromFile();
    let fileSize = 0;
    let lastModified: Date | null = null;

    try {
      if (fs.existsSync(this.collectionsFile)) {
        const stats = fs.statSync(this.collectionsFile);
        fileSize = stats.size;
        lastModified = stats.mtime;
      }
    } catch (error) {
      console.error('Error getting file stats:', error);
    }

    return {
      storageDir: this.storageDir,
      collectionsFile: this.collectionsFile,
      collectionsCount: collections.size,
      fileSize,
      lastModified,
    };
  }

  public exportToFile(filePath: string): void {
    const collections = this.readCollectionsFromFile();
    const exportData = {
      _type: 'mcp-insomnia-export',
      __export_format: 1,
      __export_date: new Date().toISOString(),
      __export_source: 'mcp-insomnia-server',
      collections: Object.fromEntries(collections.entries()),
    };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
  }

  public importFromFile(filePath: string): number {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const importData = JSON.parse(data);

      if (importData._type !== 'mcp-insomnia-export') {
        throw new Error('Invalid import file format');
      }

      const collections = this.readCollectionsFromFile();
      let importedCount = 0;

      for (const [id, structure] of Object.entries(importData.collections)) {
        collections.set(id, structure as CollectionStructure);
        importedCount++;
      }

      this.writeCollectionsToFile(collections);
      return importedCount;
    } catch (error) {
      console.error('Error importing from file:', error);
      throw error;
    }
  }

  public clearAllCollections(): void {
    const emptyCollections = new Map<string, CollectionStructure>();
    this.writeCollectionsToFile(emptyCollections);
  }

  public getCollectionStats(): {
    totalCollections: number;
    totalRequests: number;
    totalFolders: number;
    totalEnvironments: number;
    totalEnvironmentVariables: number;
  } {
    const collections = this.readCollectionsFromFile();

    let totalRequests = 0;
    let totalFolders = 0;
    let totalEnvironments = 0;
    let totalEnvironmentVariables = 0;

    for (const structure of collections.values()) {
      totalRequests += structure.requests.length;
      totalFolders += structure.folders.length;
      totalEnvironments += structure.environments.length;

      structure.environments.forEach(env => {
        totalEnvironmentVariables += Object.keys(env.data || {}).length;
      });
    }

    return {
      totalCollections: collections.size,
      totalRequests,
      totalFolders,
      totalEnvironments,
      totalEnvironmentVariables,
    };
  }

  public backupCollections(backupPath?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `collections-backup-${timestamp}.json`;
    const fullPath = backupPath ?? path.join(this.storageDir, 'backups', fileName);

    const backupDir = path.dirname(fullPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    this.exportToFile(fullPath);
    return fullPath;
  }

  public restoreFromBackup(backupPath: string): number {
    return this.importFromFile(backupPath);
  }
}

export const storage = new PersistentStorage();
