import { auth } from '@/lib/firebase';
import { CustomNode } from '../types/mindmap';

export interface ChunkMeta {
    hash: string;
    bytes: number;
    nodeCount: number;
}

export interface MapManifest {
    version: 1;
    mapId: string;
    totalNodes: number;
    totalBytes: number;
    rootChunkId: string;
    chunks: Record<string, ChunkMeta>;
    updatedAt: string;
}

interface ChunkedNode extends CustomNode {
    __chunkRef?: string;
}

export function countAstNodes(node: CustomNode): number {
    let count = 1;
    if (node.children) {
        for (const child of node.children) {
            count += countAstNodes(child);
        }
    }
    return count;
}

async function sha256Hex(text: string): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
    // Lightweight fallback hash
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Splits a CustomNode AST into logical chunks (max ~250 nodes per chunk).
 * Large subtrees become separate chunk files referenced via __chunkRef stubs.
 */
export async function splitAstIntoChunks(
    mapId: string,
    root: CustomNode,
    maxNodesPerChunk: number = 250
): Promise<{ manifest: MapManifest; chunkPayloads: Record<string, string> }> {
    const chunkPayloads: Record<string, string> = {};
    const chunkMeta: Record<string, ChunkMeta> = {};
    let totalNodes = 0;
    let totalBytes = 0;

    function extractSubtree(node: CustomNode, chunkId: string): { stub: ChunkedNode; extracted: boolean } {
        const size = countAstNodes(node);
        if (size <= maxNodesPerChunk) {
            return { stub: node, extracted: false };
        }

        // Recursively extract large children into their own chunks first
        const nextChildren: ChunkedNode[] = [];
        for (const child of node.children || []) {
            const childSize = countAstNodes(child);
            if (childSize >= Math.floor(maxNodesPerChunk * 0.6)) {
                const childChunkId = `c_${child.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}`;
                const { stub: childStub } = extractSubtree(child, childChunkId);
                nextChildren.push({
                    id: child.id,
                    content: '',
                    children: [],
                    __chunkRef: childChunkId,
                });
                // Store extracted child chunk
                pendingChunks.push({ id: childChunkId, node: childStub });
            } else {
                nextChildren.push(child);
            }
        }

        return {
            stub: {
                ...node,
                children: nextChildren,
            },
            extracted: true,
        };
    }

    const pendingChunks: { id: string; node: ChunkedNode }[] = [];
    const { stub: rootStub } = extractSubtree(root, 'root');
    pendingChunks.unshift({ id: 'root', node: rootStub });

    for (const item of pendingChunks) {
        const json = JSON.stringify(item.node);
        const hash = await sha256Hex(json);
        const bytes = new Blob([json]).size;
        const nodeCount = countAstNodes(item.node);

        chunkPayloads[item.id] = json;
        chunkMeta[item.id] = { hash, bytes, nodeCount };
        totalNodes += nodeCount;
        totalBytes += bytes;
    }

    const manifest: MapManifest = {
        version: 1,
        mapId,
        totalNodes,
        totalBytes,
        rootChunkId: 'root',
        chunks: chunkMeta,
        updatedAt: new Date().toISOString(),
    };

    return { manifest, chunkPayloads };
}

export async function reassembleAstFromChunks(
    manifest: MapManifest,
    fetchChunk: (chunkId: string) => Promise<ChunkedNode>
): Promise<CustomNode> {
    const cache = new Map<string, ChunkedNode>();

    const loadChunk = async (chunkId: string): Promise<ChunkedNode> => {
        if (cache.has(chunkId)) return cache.get(chunkId)!;
        const data = await fetchChunk(chunkId);
        cache.set(chunkId, data);
        return data;
    };

    const resolveNode = async (node: ChunkedNode): Promise<CustomNode> => {
        if (node.__chunkRef) {
            const target = await loadChunk(node.__chunkRef);
            return resolveNode(target);
        }
        const resolvedChildren = await Promise.all((node.children || []).map(resolveNode));
        const { __chunkRef: _, ...cleanNode } = node;
        return {
            ...cleanNode,
            children: resolvedChildren,
        };
    };

    const rootChunk = await loadChunk(manifest.rootChunkId || 'root');
    return resolveNode(rootChunk);
}

export async function saveMapToR2(
    mapId: string,
    root: CustomNode,
    r2WorkerUrl: string
): Promise<{
    manifest: MapManifest;
    uploadedChunks: number;
    totalChunks: number;
}> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('User must be authenticated to save to R2');

    const baseUrl = r2WorkerUrl.replace(/\/+$/, '');
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    // 1. Fetch existing manifest to detect unchanged chunks
    let prevChunks: Record<string, ChunkMeta> = {};
    try {
        const prevRes = await fetch(`${baseUrl}/maps/${encodeURIComponent(mapId)}/manifest`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (prevRes.ok) {
            const prevManifest = (await prevRes.json()) as MapManifest;
            prevChunks = prevManifest.chunks || {};
        }
    } catch {
        // First upload or unreachable previous manifest -> upload all chunks
    }

    // 2. Split into logical chunks & hash
    const { manifest, chunkPayloads } = await splitAstIntoChunks(mapId, root);

    // 3. Upload ONLY changed or new chunks
    const chunkIds = Object.keys(chunkPayloads);
    let uploadedChunks = 0;

    await Promise.all(
        chunkIds.map(async (chunkId) => {
            const nextHash = manifest.chunks[chunkId].hash;
            if (prevChunks[chunkId]?.hash === nextHash) {
                return; // Unchanged chunk -> skip upload!
            }
            const res = await fetch(
                `${baseUrl}/maps/${encodeURIComponent(mapId)}/chunks/${encodeURIComponent(chunkId)}`,
                {
                    method: 'PUT',
                    headers,
                    body: chunkPayloads[chunkId],
                }
            );
            if (!res.ok) {
                throw new Error(`Failed to upload chunk ${chunkId}: ${res.status}`);
            }
            uploadedChunks += 1;
        })
    );

    // 4. Upload updated manifest
    const manifestRes = await fetch(`${baseUrl}/maps/${encodeURIComponent(mapId)}/manifest`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(manifest),
    });
    if (!manifestRes.ok) {
        throw new Error(`Failed to upload manifest: ${manifestRes.status}`);
    }

    return {
        manifest,
        uploadedChunks,
        totalChunks: chunkIds.length,
    };
}

export async function loadMapFromR2(mapId: string, r2WorkerUrl: string): Promise<CustomNode | null> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;

    const baseUrl = r2WorkerUrl.replace(/\/+$/, '');
    const headers = { Authorization: `Bearer ${token}` };

    const manifestRes = await fetch(`${baseUrl}/maps/${encodeURIComponent(mapId)}/manifest`, {
        headers,
    });
    if (!manifestRes.ok) return null;

    const manifest = (await manifestRes.json()) as MapManifest;

    return reassembleAstFromChunks(manifest, async (chunkId) => {
        const chunkRes = await fetch(
            `${baseUrl}/maps/${encodeURIComponent(mapId)}/chunks/${encodeURIComponent(chunkId)}`,
            { headers }
        );
        if (!chunkRes.ok) {
            throw new Error(`Failed to fetch chunk ${chunkId}: ${chunkRes.status}`);
        }
        return (await chunkRes.json()) as ChunkedNode;
    });
}
