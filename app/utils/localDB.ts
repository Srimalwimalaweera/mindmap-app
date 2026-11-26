const DB_NAME = 'MindMapDB';
const DB_VERSION = 2;
const STORE_MAPS = 'maps';
const STORE_MEDIA_CACHE = 'cache_media';
const STORE_SETTINGS = 'cache_settings';

const SETTINGS_KEY = 'user_cache_settings';
const CLOUD_CACHE_PREFIX = 'cloud-cache-';

export interface CacheSettings {
    mapsCache: true; // Always ON, cannot be disabled
    imagesCache: boolean; // Default ON
    videosCache: boolean; // Default OFF
    maxImageCacheMB: number;
    maxVideoCacheMB: number;
    updatedAt: number;
}

export interface CachedMediaRecord {
    key: string;
    blob: Blob;
    mimeType: string;
    size: number;
    mediaType: 'image' | 'video';
    version: string;
    lastAccessedAt: number;
    createdAt: number;
}

export interface CacheStats {
    mapsBytes: number;
    imagesBytes: number;
    videosBytes: number;
    totalBytes: number;
    mapsCount: number;
    imagesCount: number;
    videosCount: number;
}

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
    mapsCache: true,
    imagesCache: true,
    videosCache: false,
    maxImageCacheMB: 200,
    maxVideoCacheMB: 300,
    updatedAt: 0,
};

function getDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_MAPS)) {
                db.createObjectStore(STORE_MAPS);
            }
            if (!db.objectStoreNames.contains(STORE_MEDIA_CACHE)) {
                const mediaStore = db.createObjectStore(STORE_MEDIA_CACHE, { keyPath: 'key' });
                mediaStore.createIndex('mediaType', 'mediaType', { unique: false });
                mediaStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                db.createObjectStore(STORE_SETTINGS);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- Local Maps & Cloud Map Cache ---

export async function setLocalMap(id: string, data: any) {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MAPS, 'readwrite');
        const store = tx.objectStore(STORE_MAPS);
        const req = store.put(data, id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

export async function getLocalMap(id: string): Promise<any> {
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MAPS, 'readonly');
        const store = tx.objectStore(STORE_MAPS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getAllLocalMaps(): Promise<any[]> {
    const db = await getDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MAPS, 'readonly');
        const store = tx.objectStore(STORE_MAPS);
        const req = store.getAll();
        const keysReq = store.getAllKeys();

        req.onsuccess = () => {
            keysReq.onsuccess = () => {
                const vals = req.result || [];
                const keys = keysReq.result || [];
                const results = vals
                    .map((val: any, i: number) => ({ id: String(keys[i]), ...val }))
                    .filter((item) => !item.id.startsWith(CLOUD_CACHE_PREFIX));
                resolve(results);
            };
        };
        req.onerror = () => reject(req.error);
    });
}

export async function deleteLocalMap(id: string) {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MAPS, 'readwrite');
        const store = tx.objectStore(STORE_MAPS);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

export async function cacheCloudMap(mapId: string, content: any, updatedAt?: string) {
    if (!mapId || mapId.startsWith('local-')) return;
    await setLocalMap(`${CLOUD_CACHE_PREFIX}${mapId}`, {
        mapId,
        content,
        updatedAt: updatedAt || new Date().toISOString(),
        cachedAt: Date.now(),
    });
}

export async function getCachedCloudMap(mapId: string, expectedUpdatedAt?: string): Promise<any | null> {
    if (!mapId || mapId.startsWith('local-')) return null;
    const cached = await getLocalMap(`${CLOUD_CACHE_PREFIX}${mapId}`);
    if (!cached) return null;
    if (expectedUpdatedAt && cached.updatedAt !== expectedUpdatedAt) {
        return null; // Server has a newer version
    }
    return cached.content ?? null;
}

// --- Cache Settings ---

export async function getCacheSettings(): Promise<CacheSettings> {
    const db = await getDB();
    if (!db) return { ...DEFAULT_CACHE_SETTINGS };
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get(SETTINGS_KEY);
        req.onsuccess = () => {
            const saved = req.result as Partial<CacheSettings> | undefined;
            resolve({
                ...DEFAULT_CACHE_SETTINGS,
                ...saved,
                mapsCache: true, // Always enforced ON
            });
        };
        req.onerror = () => resolve({ ...DEFAULT_CACHE_SETTINGS });
    });
}

export async function saveCacheSettings(partial: Partial<CacheSettings>): Promise<CacheSettings> {
    const current = await getCacheSettings();
    const next: CacheSettings = {
        ...current,
        ...partial,
        maxImageCacheMB: Math.max(10, Math.min(5120, Number(partial.maxImageCacheMB ?? current.maxImageCacheMB) || DEFAULT_CACHE_SETTINGS.maxImageCacheMB)),
        maxVideoCacheMB: Math.max(10, Math.min(10240, Number(partial.maxVideoCacheMB ?? current.maxVideoCacheMB) || DEFAULT_CACHE_SETTINGS.maxVideoCacheMB)),
        mapsCache: true, // Never allow disabling Maps Cache
        updatedAt: Date.now(),
    };
    const db = await getDB();
    if (!db) return next;
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.put(next, SETTINGS_KEY);
        req.onsuccess = () => resolve(next);
        req.onerror = () => reject(req.error);
    });

    // Enforce updated limits immediately via LRU eviction
    if (partial.maxImageCacheMB !== undefined) {
        await evictLRUIfNeeded(db, 'image', next.maxImageCacheMB * 1024 * 1024, 0);
    }
    if (partial.maxVideoCacheMB !== undefined) {
        await evictLRUIfNeeded(db, 'video', next.maxVideoCacheMB * 1024 * 1024, 0);
    }

    return next;
}

// --- Smart Media Cache (Images & Videos with Version Check + LRU Eviction) ---

export async function getCachedMedia(key: string, expectedVersion?: string): Promise<Blob | null> {
    const settings = await getCacheSettings();
    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
        const tx = db.transaction(STORE_MEDIA_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA_CACHE);
        const req = store.get(key);

        req.onsuccess = () => {
            const record = req.result as CachedMediaRecord | undefined;
            if (!record) return resolve(null);

            // Respect user cache toggles
            if (record.mediaType === 'image' && !settings.imagesCache) return resolve(null);
            if (record.mediaType === 'video' && !settings.videosCache) return resolve(null);

            // Version check: invalidate stale cached file
            if (expectedVersion && record.version !== expectedVersion) {
                store.delete(key);
                return resolve(null);
            }

            // Touch LRU timestamp
            record.lastAccessedAt = Date.now();
            store.put(record);
            resolve(record.blob);
        };
        req.onerror = () => resolve(null);
    });
}

async function evictLRUIfNeeded(
    db: IDBDatabase,
    mediaType: 'image' | 'video',
    maxBytes: number,
    incomingSize: number
): Promise<void> {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_MEDIA_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA_CACHE);
        const index = store.index('mediaType');
        const req = index.getAll(mediaType);

        req.onsuccess = () => {
            const records = (req.result as CachedMediaRecord[]) || [];
            let total = records.reduce((sum, r) => sum + (r.size || 0), 0);
            if (total + incomingSize <= maxBytes) {
                return resolve();
            }

            // Sort oldest accessed first
            records.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
            for (const rec of records) {
                if (total + incomingSize <= maxBytes) break;
                store.delete(rec.key);
                total -= rec.size || 0;
            }
            resolve();
        };
        req.onerror = () => resolve();
    });
}

export async function setCachedMedia(
    key: string,
    blob: Blob,
    mediaType: 'image' | 'video',
    version: string = '1'
): Promise<boolean> {
    const settings = await getCacheSettings();
    if (mediaType === 'image' && !settings.imagesCache) return false;
    if (mediaType === 'video' && !settings.videosCache) return false;

    const db = await getDB();
    if (!db) return false;

    const maxBytes = (mediaType === 'image' ? settings.maxImageCacheMB : settings.maxVideoCacheMB) * 1024 * 1024;
    if (blob.size > maxBytes) return false; // Single item larger than cap

    await evictLRUIfNeeded(db, mediaType, maxBytes, blob.size);

    const record: CachedMediaRecord = {
        key,
        blob,
        mimeType: blob.type || (mediaType === 'image' ? 'image/webp' : 'video/mp4'),
        size: blob.size,
        mediaType,
        version,
        lastAccessedAt: Date.now(),
        createdAt: Date.now(),
    };

    return new Promise((resolve) => {
        const tx = db.transaction(STORE_MEDIA_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA_CACHE);
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
    });
}

export async function clearMediaCache(mediaType: 'image' | 'video'): Promise<void> {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEDIA_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_MEDIA_CACHE);
        const index = store.index('mediaType');
        const req = index.getAllKeys(mediaType);
        req.onsuccess = () => {
            const keys = req.result || [];
            keys.forEach((k) => store.delete(k));
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

export async function getCacheStats(): Promise<CacheStats> {
    const stats: CacheStats = {
        mapsBytes: 0,
        imagesBytes: 0,
        videosBytes: 0,
        totalBytes: 0,
        mapsCount: 0,
        imagesCount: 0,
        videosCount: 0,
    };

    const db = await getDB();
    if (!db) return stats;

    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_MAPS, 'readonly');
        const store = tx.objectStore(STORE_MAPS);
        const req = store.getAll();
        req.onsuccess = () => {
            const items = req.result || [];
            stats.mapsCount = items.length;
            for (const item of items) {
                try {
                    stats.mapsBytes += new Blob([JSON.stringify(item)]).size;
                } catch {
                    // ignore sizing error
                }
            }
            resolve();
        };
        req.onerror = () => resolve();
    });

    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_MEDIA_CACHE, 'readonly');
        const store = tx.objectStore(STORE_MEDIA_CACHE);
        const req = store.getAll();
        req.onsuccess = () => {
            const items = (req.result as CachedMediaRecord[]) || [];
            for (const item of items) {
                if (item.mediaType === 'image') {
                    stats.imagesCount += 1;
                    stats.imagesBytes += item.size || 0;
                } else if (item.mediaType === 'video') {
                    stats.videosCount += 1;
                    stats.videosBytes += item.size || 0;
                }
            }
            resolve();
        };
        req.onerror = () => resolve();
    });

    stats.totalBytes = stats.mapsBytes + stats.imagesBytes + stats.videosBytes;
    return stats;
}
