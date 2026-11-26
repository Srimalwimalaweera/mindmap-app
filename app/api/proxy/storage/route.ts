import { NextRequest, NextResponse } from 'next/server';
import { isSafeExternalFetchUrl } from '@/app/utils/sanitize';

export const runtime = 'edge';

const ALLOWED_STORAGE_HOSTS = [
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
];

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    const safeUrl = isSafeExternalFetchUrl(rawUrl, ALLOWED_STORAGE_HOSTS);
    if (!safeUrl) {
        return NextResponse.json({ error: 'Blocked: Untrusted storage URL' }, { status: 403 });
    }

    try {
        const response = await fetch(safeUrl.toString(), { redirect: 'error' });
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        const data = await response.json();
        return NextResponse.json(data, {
            headers: {
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'none'",
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
