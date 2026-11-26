export interface Env {
    MINDMAP_BUCKET: R2Bucket;
    FIREBASE_PROJECT_ID: string;
    ALLOWED_ORIGINS?: string;
}

interface JwkKey {
    kid: string;
    kty: string;
    alg: string;
    use: string;
    n: string;
    e: string;
}

let cachedJwks: { keys: JwkKey[]; expiresAt: number } | null = null;

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        arr[i] = raw.charCodeAt(i);
    }
    return arr;
}

async function getFirebasePublicKeys(): Promise<JwkKey[]> {
    if (cachedJwks && Date.now() < cachedJwks.expiresAt) {
        return cachedJwks.keys;
    }
    const res = await fetch(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    );
    if (!res.ok) throw new Error('Failed to fetch Firebase JWKS');
    const data = (await res.json()) as { keys: JwkKey[] };
    cachedJwks = {
        keys: data.keys || [],
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour cache
    };
    return cachedJwks.keys;
}

async function verifyFirebaseToken(token: string, projectId: string): Promise<string | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, sigB64] = parts;
        const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
        const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));

        const nowSec = Math.floor(Date.now() / 1000);
        if (!payload.sub || typeof payload.sub !== 'string') return null;
        if (payload.exp && payload.exp < nowSec) return null;
        if (payload.aud !== projectId) return null;
        if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;

        const keys = await getFirebasePublicKeys();
        const jwk = keys.find((k) => k.kid === header.kid);
        if (!jwk) return null;

        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
        const signature = base64UrlToUint8Array(sigB64);
        const valid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            cryptoKey,
            signature as unknown as BufferSource,
            signedData as unknown as BufferSource
        );

        return valid ? payload.sub : null;
    } catch {
        return null;
    }
}

function corsHeaders(origin: string | null, allowedOrigins?: string): Record<string, string> {
    const allowedList = (allowedOrigins || '*').split(',').map((s) => s.trim());
    const allowOrigin =
        origin && (allowedList.includes('*') || allowedList.includes(origin) || origin.endsWith('.pages.dev'))
            ? origin
            : allowedList[0] || '*';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
    };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const origin = request.headers.get('Origin');
        const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return jsonResponse({ ok: true, service: 'mindmap-r2-storage' }, 200, cors);
        }

        // Authenticate every map request with Firebase ID Token
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token) {
            return jsonResponse({ error: 'Missing Authorization Bearer token' }, 401, cors);
        }

        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (!uid) {
            return jsonResponse({ error: 'Invalid or expired Firebase token' }, 401, cors);
        }

        // Route matching:
        // /maps/:mapId/manifest
        // /maps/:mapId/chunks/:chunkId
        // /maps/:mapId
        const manifestMatch = url.pathname.match(/^\/maps\/([^/]+)\/manifest$/);
        const chunkMatch = url.pathname.match(/^\/maps\/([^/]+)\/chunks\/([^/]+)$/);
        const mapRootMatch = url.pathname.match(/^\/maps\/([^/]+)$/);

        const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');

        if (manifestMatch) {
            const mapId = safeId(manifestMatch[1]);
            const key = `users/${uid}/maps/${mapId}/manifest.json`;

            if (request.method === 'GET') {
                const obj = await env.MINDMAP_BUCKET.get(key);
                if (!obj) return jsonResponse({ error: 'Manifest not found' }, 404, cors);
                return new Response(obj.body, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...cors },
                });
            }

            if (request.method === 'PUT') {
                const textBody = await request.text();
                if (textBody.length > 2 * 1024 * 1024) {
                    return jsonResponse({ error: 'Manifest exceeds 2MB limit' }, 413, cors);
                }
                try {
                    JSON.parse(textBody);
                } catch {
                    return jsonResponse({ error: 'Invalid JSON payload' }, 400, cors);
                }
                await env.MINDMAP_BUCKET.put(key, textBody, {
                    httpMetadata: { contentType: 'application/json' },
                });
                return jsonResponse({ ok: true, key, bytes: textBody.length }, 200, cors);
            }
        }

        if (chunkMatch) {
            const mapId = safeId(chunkMatch[1]);
            const chunkId = safeId(chunkMatch[2]);
            const key = `users/${uid}/maps/${mapId}/chunks/${chunkId}.json`;

            if (request.method === 'GET') {
                const obj = await env.MINDMAP_BUCKET.get(key);
                if (!obj) return jsonResponse({ error: 'Chunk not found' }, 404, cors);
                return new Response(obj.body, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...cors },
                });
            }

            if (request.method === 'PUT') {
                const textBody = await request.text();
                if (textBody.length > 5 * 1024 * 1024) {
                    return jsonResponse({ error: 'Chunk exceeds 5MB limit' }, 413, cors);
                }
                try {
                    JSON.parse(textBody);
                } catch {
                    return jsonResponse({ error: 'Invalid JSON payload' }, 400, cors);
                }
                await env.MINDMAP_BUCKET.put(key, textBody, {
                    httpMetadata: { contentType: 'application/json' },
                });
                return jsonResponse({ ok: true, key, bytes: textBody.length }, 200, cors);
            }
        }

        if (mapRootMatch && request.method === 'DELETE') {
            const mapId = safeId(mapRootMatch[1]);
            const prefix = `users/${uid}/maps/${mapId}/`;
            let cursor: string | undefined;
            let deleted = 0;

            do {
                const listed = await env.MINDMAP_BUCKET.list({ prefix, cursor });
                if (listed.objects.length > 0) {
                    await env.MINDMAP_BUCKET.delete(listed.objects.map((o: R2Object) => o.key));
                    deleted += listed.objects.length;
                }
                cursor = listed.truncated ? listed.cursor : undefined;
            } while (cursor);

            return jsonResponse({ ok: true, deleted }, 200, cors);
        }

        return jsonResponse({ error: 'Not found' }, 404, cors);
    },
};
