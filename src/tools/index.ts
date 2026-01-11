import { collectionTools } from './collection.tools.js';
import { folderTools } from './folder.tools.js';
import { requestTools } from './request.tools.js';
import { environmentTools } from './environment.tools.js';
import { utilityTools } from './utility.tools.js';
import { insomniaTools } from './insomnia.tools.js';
import type { Tool } from '../types/tool.js';

export function createInsomniaTools(): Tool[] {
    return [
        ...collectionTools,
        ...folderTools,
        ...requestTools,
        ...environmentTools,
        ...utilityTools,
        ...insomniaTools,
    ];
}
