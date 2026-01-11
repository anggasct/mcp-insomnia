import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage/index.js';
import type { Tool } from '../types/tool.js';
import type { CreateFolderParams, InsomniaRequestGroup } from '../types/collection.js';

export const folderTools: Tool[] = [
    {
        name: 'create_folder',
        description: 'Create a folder to group requests within a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'ID collection' },
                parentId: { type: 'string', description: 'ID parent folder (optional)' },
                name: { type: 'string', description: 'Folder name' },
                description: { type: 'string', description: 'Folder description' },
            },
            required: ['collectionId', 'name'],
        },
        handler: async (request) => {
            const params = request.params.arguments as unknown as CreateFolderParams;
            const collection = storage.getCollection(params.collectionId);

            if (!collection) {
                throw new Error(`Collection with ID ${params.collectionId} not found`);
            }

            const folderId = `fld_${uuidv4().replace(/-/g, '')}`;
            const folder: InsomniaRequestGroup = {
                _id: folderId,
                _type: 'request_group',
                parentId: params.parentId || params.collectionId,
                name: params.name,
                description: params.description || '',
                modified: Date.now(),
                created: Date.now(),
            };

            collection.folders.push(folder);
            storage.saveCollection(params.collectionId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Folder "${params.name}" created successfully with ID: ${folderId}`,
                    },
                ],
            };
        },
    },
];
