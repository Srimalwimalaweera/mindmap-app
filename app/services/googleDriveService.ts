'use client';

import {
    getCachedMedia,
    setCachedMedia,
    saveEncryptedDriveAuth,
    loadEncryptedDriveAuth,
    clearEncryptedDriveAuth,
} from '../utils/localDB';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER_NAME = 'VisualMindMapMedia';
const RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const STORAGE_INFO_CACHE_KEY = 'gdrive_storage_info_v1';
const STORAGE_INFO_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

interface TokenState {
    accessToken: string;
    expiresAt: number;
}

export interface DriveStorageInfo {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    appMediaBytes: number;
    cachedAt: number;
}

let tokenState: TokenState | null = null;
let driveLinkedPersisted = false;
let authHydratedPromise: Promise<boolean> | null = null;
let gsiScriptPromise: Promise<void> | null = null;

declare global {
    interface Window {
        google?: {
            accounts?: {
                oauth2?: {
                    initTokenClient: (config: {
                        client_id: string;
                        scope: string;
                        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
                    }) => {
                        requestAccessToken: (opts?: { prompt?: string }) => void;
                    };
                    revoke?: (token: string, done?: () => void) => void;
                };
            };
        };
    }
}

export function getGoogleDriveClientId(): string {
    return process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '';
}

export async function hydrateDriveAuth(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (tokenState && Date.now() < tokenState.expiresAt - 60_000) {
        driveLinkedPersisted = true;
        return true;
    }
    if (!authHydratedPromise) {
        authHydratedPromise = loadEncryptedDriveAuth()
            .then((saved) => {
                if (saved?.connected) {
                    driveLinkedPersisted = true;
                    if (saved.accessToken && Date.now() < saved.expiresAt - 60_000) {
                        tokenState = {
                            accessToken: saved.accessToken,
                            expiresAt: saved.expiresAt,
                        };
                    }
                    return true;
                }
                return false;
            })
            .catch(() => false);
    }
    return authHydratedPromise;
}

export function isDriveConnected(): boolean {
    return driveLinkedPersisted || !!(tokenState && Date.now() < tokenState.expiresAt - 60_000);
}

export function clearDriveToken(): void {
    tokenState = null;
}

export async function disconnectGoogleDrive(): Promise<void> {
    const token = tokenState?.accessToken;
    tokenState = null;
    driveLinkedPersisted = false;
    authHydratedPromise = null;
    if (typeof window !== 'undefined') {
        try {
            localStorage.removeItem(STORAGE_INFO_CACHE_KEY);
            await clearEncryptedDriveAuth();
        } catch {
            // ignore
        }
        if (token && window.google?.accounts?.oauth2?.revoke) {
            await new Promise<void>((resolve) => {
                window.google!.accounts!.oauth2!.revoke!(token, () => resolve());
            });
        }
    }
}

function loadGsiScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('Browser required'));
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gsiScriptPromise) return gsiScriptPromise;

    gsiScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
    return gsiScriptPromise;
}

function requestTokenWithPrompt(clientId: string, promptMode: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) return reject(new Error('Google OAuth2 client unavailable'));

        const client = oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_SCOPE,
            callback: async (resp) => {
                if (resp.error || !resp.access_token) {
                    return reject(new Error(resp.error || 'Google Drive authorization failed'));
                }
                const expiresInMs = (resp.expires_in || 3600) * 1000;
                const expiresAt = Date.now() + expiresInMs;
                tokenState = {
                    accessToken: resp.access_token,
                    expiresAt,
                };
                driveLinkedPersisted = true;
                try {
                    await saveEncryptedDriveAuth({
                        connected: true,
                        accessToken: resp.access_token,
                        expiresAt,
                        connectedAt: Date.now(),
                    });
                } catch {
                    // non-fatal if storage restricted
                }
                resolve(resp.access_token);
            },
        });

        client.requestAccessToken({ prompt: promptMode });
    });
}

export async function ensureDriveAccessToken(interactive: boolean = true): Promise<string> {
    await hydrateDriveAuth();

    if (tokenState && Date.now() < tokenState.expiresAt - 60_000) {
        return tokenState.accessToken;
    }

    const clientId = getGoogleDriveClientId();
    if (!clientId) {
        throw new Error('Google Drive Client ID is not configured (NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID).');
    }

    await loadGsiScript();

    // If user previously connected Drive, attempt silent refresh first with zero popup
    if (driveLinkedPersisted) {
        try {
            return await requestTokenWithPrompt(clientId, 'none');
        } catch {
            if (!interactive) {
                throw new Error('Google Drive silent refresh failed');
            }
        }
    }

    return requestTokenWithPrompt(clientId, interactive ? 'select_account' : 'none');
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
    let delay = 800;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url, init);
        if (res.status !== 403 && res.status !== 429 && res.status < 500) {
            return res;
        }
        if (attempt === retries) return res;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
    }
    throw new Error('Unreachable retry exit');
}

async function findOrCreateFolder(
    accessToken: string,
    name: string,
    parentId?: string
): Promise<string | null> {
    const parentClause = parentId ? ` and '${parentId}' in parents` : '';
    const query = encodeURIComponent(
        `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`
    );
    const searchRes = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (searchRes.ok) {
        const data = (await searchRes.json()) as { files?: { id: string }[] };
        if (data.files && data.files.length > 0) {
            return data.files[0].id;
        }
    }

    const body: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) body.parents = [parentId];

    const createRes = await fetchWithRetry('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!createRes.ok) return null;
    const created = (await createRes.json()) as { id: string };
    return created.id;
}

async function getOrCreateMediaSubfolder(
    accessToken: string,
    mediaType: 'image' | 'video'
): Promise<string | null> {
    const rootId = await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME);
    if (!rootId) return null;
    const subId = await findOrCreateFolder(accessToken, mediaType, rootId);
    return subId || rootId;
}

export function getCachedDriveStorageInfo(): DriveStorageInfo | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_INFO_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as DriveStorageInfo;
        if (Date.now() - parsed.cachedAt > STORAGE_INFO_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCachedDriveStorageInfo(info: DriveStorageInfo) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_INFO_CACHE_KEY, JSON.stringify(info));
    } catch {
        // ignore
    }
}

export async function getDriveStorageInfo(forceRefresh = false): Promise<DriveStorageInfo | null> {
    if (!forceRefresh) {
        const cached = getCachedDriveStorageInfo();
        if (cached) return cached;
    }
    if (!isDriveConnected()) return null;

    try {
        const accessToken = await ensureDriveAccessToken(false);
        const aboutRes = await fetchWithRetry(
            'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!aboutRes.ok) return null;
        const aboutData = (await aboutRes.json()) as {
            storageQuota?: { limit?: string; usage?: string };
        };

        const totalBytes = Number(aboutData.storageQuota?.limit || 0);
        const usedBytes = Number(aboutData.storageQuota?.usage || 0);
        const freeBytes = Math.max(0, totalBytes - usedBytes);

        // Sum app-uploaded files (drive.file scope only lists files created by this app)
        let appMediaBytes = 0;
        const filesRes = await fetchWithRetry(
            "https://www.googleapis.com/drive/v3/files?q=trashed=false and mimeType!='application/vnd.google-apps.folder'&fields=files(size)&pageSize=1000",
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (filesRes.ok) {
            const filesData = (await filesRes.json()) as { files?: { size?: string }[] };
            appMediaBytes = (filesData.files || []).reduce((sum, f) => sum + Number(f.size || 0), 0);
        }

        const info: DriveStorageInfo = {
            totalBytes,
            usedBytes,
            freeBytes,
            appMediaBytes,
            cachedAt: Date.now(),
        };
        saveCachedDriveStorageInfo(info);
        return info;
    } catch {
        return getCachedDriveStorageInfo();
    }
}

export async function compressImageForDrive(file: File, quality = 0.8, maxDim = 1920): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context unavailable'));
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => {
                    if (!blob) return reject(new Error('Image compression failed'));
                    resolve(blob);
                },
                'image/webp',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image for compression'));
        };
        img.src = objectUrl;
    });
}

export interface DriveUploadResult {
    fileId: string;
    name: string;
    mimeType: string;
    size: number;
    version: string;
}

/**
 * Uploads media directly from user's browser to user's own Google Drive
 * inside VisualMindMapMedia/image or VisualMindMapMedia/video.
 * Immediately caches the uploaded Blob in IndexedDB so clicking Load works instantaneously.
 */
export async function uploadMediaToGoogleDrive(
    file: Blob,
    fileName: string,
    mimeType: string,
    mediaType: 'image' | 'video',
    onProgress?: (percent: number) => void
): Promise<DriveUploadResult> {
    const accessToken = await ensureDriveAccessToken(true);
    const folderId = await getOrCreateMediaSubfolder(accessToken, mediaType);

    const metadata: Record<string, unknown> = {
        name: fileName,
        mimeType,
    };
    if (folderId) metadata.parents = [folderId];

    let result: DriveUploadResult;

    // Small files (<= 5MB): Multipart Upload (single request)
    if (file.size <= 5 * 1024 * 1024) {
        onProgress?.(25);
        const boundary = `-------mindmap_${Date.now()}`;
        const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const endPart = `\r\n--${boundary}--`;
        const bodyBlob = new Blob([metaPart, file, endPart]);

        const res = await fetchWithRetry(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,version',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body: bodyBlob,
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Drive upload failed (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; version?: string };
        onProgress?.(100);
        result = {
            fileId: data.id,
            name: data.name || fileName,
            mimeType: data.mimeType || mimeType,
            size: Number(data.size || file.size),
            version: data.version || '1',
        };
    } else {
        // Large files (> 5MB): Resumable Upload in 8MB chunks
        const initRes = await fetchWithRetry(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,version',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': mimeType,
                    'X-Upload-Content-Length': String(file.size),
                },
                body: JSON.stringify(metadata),
            }
        );

        if (!initRes.ok) {
            throw new Error(`Failed to initiate resumable upload (${initRes.status})`);
        }

        const sessionUri = initRes.headers.get('Location');
        if (!sessionUri) throw new Error('Missing Google Drive resumable upload session URI');

        let offset = 0;
        let finalData: { id: string; name: string; mimeType: string; size?: string; version?: string } | null = null;

        while (offset < file.size) {
            const end = Math.min(offset + RESUMABLE_CHUNK_SIZE, file.size);
            const chunk = file.slice(offset, end);

            const chunkRes = await fetch(sessionUri, {
                method: 'PUT',
                headers: {
                    'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
                    'Content-Type': mimeType,
                },
                body: chunk,
            });

            if (chunkRes.status === 308) {
                const rangeHeader = chunkRes.headers.get('Range');
                if (rangeHeader) {
                    const match = rangeHeader.match(/bytes=0-(\d+)/);
                    offset = match ? parseInt(match[1], 10) + 1 : end;
                } else {
                    offset = end;
                }
                onProgress?.(Math.min(99, Math.round((offset / file.size) * 100)));
            } else if (chunkRes.ok) {
                finalData = (await chunkRes.json()) as { id: string; name: string; mimeType: string; size?: string; version?: string };
                onProgress?.(100);
                break;
            } else {
                throw new Error(`Resumable upload chunk failed (${chunkRes.status})`);
            }
        }

        if (!finalData) throw new Error('Resumable upload ended unexpectedly');

        result = {
            fileId: finalData.id,
            name: finalData.name || fileName,
            mimeType: finalData.mimeType || mimeType,
            size: Number(finalData.size || file.size),
            version: finalData.version || '1',
        };
    }

    // Cache the freshly uploaded Blob directly in IndexedDB so immediate Load works in 0ms!
    try {
        await setCachedMedia(`gdrive:${result.fileId}`, file, mediaType, result.version);
    } catch (e) {
        console.warn('Failed to pre-cache uploaded Drive media', e);
    }

    // Update cached storage stats locally without an extra API call
    const existingInfo = getCachedDriveStorageInfo();
    if (existingInfo) {
        saveCachedDriveStorageInfo({
            ...existingInfo,
            usedBytes: existingInfo.usedBytes + result.size,
            freeBytes: Math.max(0, existingInfo.freeBytes - result.size),
            appMediaBytes: existingInfo.appMediaBytes + result.size,
        });
    }

    return result;
}

/**
 * On-demand media loader: checks IndexedDB Smart Cache first, then downloads from Google Drive.
 */
export async function loadDriveMediaObjectUrl(
    fileId: string,
    mediaType: 'image' | 'video',
    version: string = '1'
): Promise<{ objectUrl: string; fromCache: boolean }> {
    const cacheKey = `gdrive:${fileId}`;
    const cachedBlob = await getCachedMedia(cacheKey, version);
    if (cachedBlob) {
        return {
            objectUrl: URL.createObjectURL(cachedBlob),
            fromCache: true,
        };
    }

    const accessToken = await ensureDriveAccessToken(true);
    const res = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    if (!res.ok) {
        throw new Error(`Failed to download media from Google Drive (${res.status})`);
    }

    const blob = await res.blob();
    await setCachedMedia(cacheKey, blob, mediaType, version);

    return {
        objectUrl: URL.createObjectURL(blob),
        fromCache: false,
    };
}

export async function trashDriveFile(fileId: string, trashed: boolean = true): Promise<boolean> {
    try {
        const accessToken = await ensureDriveAccessToken(false);
        const res = await fetchWithRetry(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ trashed }),
            }
        );
        return res.ok;
    } catch {
        return false;
    }
}
