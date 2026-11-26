import { db, storage } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc, writeBatch, increment, getCountFromServer } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { CustomNode } from "../types/mindmap";

export interface MindMapData {
    id: string;
    userId: string;
    title: string;
    content: string | CustomNode;
    createdAt: string;
    updatedAt: string;
    type?: 'map';
    isPinned?: boolean;
    isTrashed?: boolean;
    trashedAt?: string;
    storageUrl?: string;
}

export async function createMindMap(userId: string, title: string, isLocal: boolean = false) {
    if (!userId) throw new Error("User ID is required");

    // Initial content is now a robust AST
    const content: CustomNode = {
        id: `root-${Date.now()}`,
        content: title,
        children: []
    };

    const docData = {
        userId,
        title,
        content,
        type: 'map',
        isPinned: false,
        isTrashed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (isLocal) {
        const localId = `local-${Date.now()}`;
        const { setLocalMap } = await import('../utils/localDB');
        await setLocalMap(localId, docData);
        return localId; // DO NOT increment Firestore projectCount for local maps
    }

    const docRef = await addDoc(collection(db, "markmaps"), docData);

    // Update User Stats (Only for Cloud maps)
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            projectCount: increment(1),
            totalMaps: increment(1)
        });
    } catch (e) {
        console.error("Error updating user stats", e);
    }

    return docRef.id;
}

export async function getUserMindMaps(userId: string): Promise<MindMapData[]> {
    if (!userId) return [];

    const q = query(collection(db, "markmaps"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    const cloudMaps = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as MindMapData[];

    let localMaps: MindMapData[] = [];
    if (typeof window !== 'undefined') {
        try {
            const { getAllLocalMaps } = await import('../utils/localDB');
            const allLocal = await getAllLocalMaps();
            localMaps = allLocal.filter(m => m.userId === userId) as MindMapData[];
        } catch (e) {
            console.error("Failed to load local maps", e);
        }
    }

    return [...cloudMaps, ...localMaps];
}

export async function saveMindMap(mapId: string, content: string | CustomNode) {
    if (!mapId) throw new Error("Map ID is required");

    if (mapId.startsWith('local-')) {
        const { getLocalMap, setLocalMap } = await import('../utils/localDB');
        const existing = await getLocalMap(mapId);
        if (existing) {
            existing.content = content;
            existing.updatedAt = new Date().toISOString();
            await setLocalMap(mapId, existing);
        }
        return;
    }

    const mapRef = doc(db, "markmaps", mapId);
    const nowIso = new Date().toISOString();
    const r2WorkerUrl = process.env.NEXT_PUBLIC_R2_WORKER_URL;

    // Phase 3: Hybrid Chunk-Based Saving via Cloudflare R2 Worker (when configured)
    if (r2WorkerUrl && typeof content !== 'string') {
        const { saveMapToR2 } = await import('./r2ChunkService');
        const { manifest } = await saveMapToR2(mapId, content, r2WorkerUrl);

        await updateDoc(mapRef, {
            content: null,
            storageUrl: null,
            storageProvider: 'cloudflare_r2',
            nodeCount: manifest.totalNodes,
            storageSize: manifest.totalBytes,
            updatedAt: nowIso
        });
    } else {
        // Fallback: Check if the content is too large (Firestore 1MB limit)
        const contentString = typeof content === 'string' ? content : JSON.stringify(content);
        
        if (contentString.length > 800000) {
            // Exceeds safe limit for Firestore, save to Firebase Storage
            const fileRef = ref(storage, `maps/${mapId}.json`);
            await uploadString(fileRef, contentString, 'raw', { contentType: 'application/json' });
            const downloadUrl = await getDownloadURL(fileRef);

            await updateDoc(mapRef, {
                content: null,
                storageUrl: downloadUrl,
                storageProvider: 'firebase_storage',
                updatedAt: nowIso
            });
        } else {
            // Save normally and clear storageUrl if it was previously set
            await updateDoc(mapRef, {
                content,
                storageUrl: null,
                storageProvider: 'firestore',
                updatedAt: nowIso
            });
        }
    }

    // Update IndexedDB Maps Cache (Always ON)
    if (typeof window !== 'undefined') {
        try {
            const { cacheCloudMap } = await import('../utils/localDB');
            await cacheCloudMap(mapId, content, nowIso);
        } catch (e) {
            console.warn("Failed to update local map cache", e);
        }
    }
}

export async function getMindMap(mapId: string): Promise<string | CustomNode | null> {
    if (!mapId) return null;

    if (mapId.startsWith('local-')) {
        const { getLocalMap } = await import('../utils/localDB');
        const existing = await getLocalMap(mapId);
        return existing ? (existing.content as string | CustomNode) : null;
    }

    const mapRef = doc(db, "markmaps", mapId);
    const snapshot = await getDoc(mapRef);

    if (snapshot.exists()) {
        const data = snapshot.data();

        // Check Smart Maps Cache first by comparing updatedAt
        if (typeof window !== 'undefined' && data.updatedAt) {
            try {
                const { getCachedCloudMap } = await import('../utils/localDB');
                const cached = await getCachedCloudMap(mapId, data.updatedAt);
                if (cached) {
                    return cached as string | CustomNode;
                }
            } catch (e) {
                console.warn("Cache read failed", e);
            }
        }

        // Check if stored in Cloudflare R2 (Chunked)
        const r2WorkerUrl = process.env.NEXT_PUBLIC_R2_WORKER_URL;
        if (data.storageProvider === 'cloudflare_r2' && r2WorkerUrl) {
            try {
                const { loadMapFromR2 } = await import('./r2ChunkService');
                const r2Content = await loadMapFromR2(mapId, r2WorkerUrl);
                if (r2Content) {
                    if (typeof window !== 'undefined') {
                        const { cacheCloudMap } = await import('../utils/localDB');
                        await cacheCloudMap(mapId, r2Content, data.updatedAt);
                    }
                    return r2Content;
                }
            } catch (error) {
                console.error("Failed to fetch mind map from Cloudflare R2:", error);
            }
        }
        
        // Check if data is in Firebase Storage
        if (data.storageUrl) {
            try {
                const response = await fetch(data.storageUrl);
                if (response.ok) {
                    const jsonContent = await response.json();
                    if (typeof window !== 'undefined') {
                        const { cacheCloudMap } = await import('../utils/localDB');
                        await cacheCloudMap(mapId, jsonContent, data.updatedAt);
                    }
                    return jsonContent as CustomNode;
                }
            } catch (error) {
                console.error("Failed to fetch large mind map from storage:", error);
            }
        }

        if (typeof window !== 'undefined' && data.content) {
            try {
                const { cacheCloudMap } = await import('../utils/localDB');
                await cacheCloudMap(mapId, data.content, data.updatedAt);
            } catch (e) {
                console.warn("Cache write failed", e);
            }
        }
        
        return data.content as string | CustomNode;
    }
    return null;
}

export async function togglePinMindMap(mapId: string, isPinned: boolean) {
    if (mapId.startsWith('local-')) {
        const { getLocalMap, setLocalMap } = await import('../utils/localDB');
        const existing = await getLocalMap(mapId);
        if (existing) {
            existing.isPinned = isPinned;
            await setLocalMap(mapId, existing);
        }
        return;
    }
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, { isPinned });
}

export async function softDeleteMindMap(mapId: string) {
    if (mapId.startsWith('local-')) {
        const { getLocalMap, setLocalMap } = await import('../utils/localDB');
        const existing = await getLocalMap(mapId);
        if (existing) {
            existing.isTrashed = true;
            existing.trashedAt = new Date().toISOString();
            await setLocalMap(mapId, existing);
        }
        return;
    }
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, {
        isTrashed: true,
        trashedAt: new Date().toISOString()
    });
}

export async function restoreMindMap(mapId: string) {
    if (mapId.startsWith('local-')) {
        const { getLocalMap, setLocalMap } = await import('../utils/localDB');
        const existing = await getLocalMap(mapId);
        if (existing) {
            existing.isTrashed = false;
            existing.trashedAt = null;
            await setLocalMap(mapId, existing);
        }
        return;
    }
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, {
        isTrashed: false,
        trashedAt: null
    });
}

export async function permanentDeleteMindMap(mapId: string) {
    if (mapId.startsWith('local-')) {
        const { deleteLocalMap } = await import('../utils/localDB');
        await deleteLocalMap(mapId);
        return; // Don't decrement cloud stats for local maps
    }
    const mapRef = doc(db, "markmaps", mapId);

    // Attempt to get doc to find userId for decrementing stats
    // Note: If doc is already deleted (race condition), this might fail to decrement.
    // For strict consistency, cloud functions are better, but client-side is acceptable here.
    try {
        const snap = await getDoc(mapRef);
        if (snap.exists()) {
            const data = snap.data();
            const userId = data.userId;
            if (userId) {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    projectCount: increment(-1)
                });
            }
        }
    } catch (e) {
        console.error("Error updating stats on delete", e);
    }

    await deleteDoc(mapRef);
}

export async function emptyTrash(userId: string) {
    const q = query(
        collection(db, "markmaps"),
        where("userId", "==", userId),
        where("isTrashed", "==", true)
    );
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
}

export async function getUserRealtimeCounts(userId: string) {
    if (!userId) return { maps: 0 };

    try {
        const coll = collection(db, "markmaps");

        const qMaps = query(
            coll,
            where("userId", "==", userId),
            where("isTrashed", "==", false)
        );
        const snapMaps = await getCountFromServer(qMaps);

        return {
            maps: snapMaps.data().count
        };
    } catch (e) {
        console.error("Error fetching counts", e);
        return { maps: 0 };
    }
}
