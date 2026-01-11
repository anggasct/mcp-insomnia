import { collectionResources } from './collection.resource.js';
import { requestResources } from './request.resource.js';
import { environmentResources } from './environment.resource.js';
import { searchResources } from './search.resource.js';
import type { Resource } from '../types/resource.js';

export function createInsomniaResources(): Resource[] {
    return [...collectionResources, ...requestResources, ...environmentResources, ...searchResources];
}
