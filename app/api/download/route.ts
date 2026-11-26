import { NextResponse } from 'next/server';
import { isSafeExternalFetchUrl } from '@/app/utils/sanitize';

export const runtime = 'edge';

const ALLOWED_DOWNLOAD_HOSTS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
    'lh3.googleusercontent.com',
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
        return new NextResponse('Missing url parameter', { status: 400 });
    }

    const safeUrl = isSafeExternalFetchUrl(rawUrl, ALLOWED_DOWNLOAD_HOSTS);
    if (!safeUrl) {
        return new NextResponse('Blocked: Untrusted or unsafe URL', { status: 403 });
    }

    try {
        const response = await fetch(safeUrl.toString(), { redirect: 'error' });
        if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        if (contentType.includes('text/html') || contentType.includes('javascript')) {
            return new NextResponse('Blocked: Executable content type not allowed', { status: 403 });
        }

        const segments = safeUrl.pathname.split('/');
        const rawName = decodeURIComponent((segments[segments.length - 1] || 'downloaded-media').split('?')[0]);
        const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'downloaded-media';

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Content-Security-Policy', "default-src 'none'; sandbox");

        return new NextResponse(response.body, {
            status: 200,
            headers,
        });
    } catch (error: any) {
        console.error('Download proxy error:', error);
        return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
    }
}
