import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing url parameter', { status: 400 });
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.statusText}`);
        }

        // We create a new response from the fetch response
        const headers = new Headers(response.headers);
        
        // Extract a filename from the URL, or use a default
        let filename = 'downloaded-media';
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const segments = pathname.split('/');
            const lastSegment = segments[segments.length - 1];
            if (lastSegment) {
                // Remove query strings if any got into the segment (unlikely in pathname, but safe)
                filename = decodeURIComponent(lastSegment.split('?')[0]);
            }
        } catch (e) {
            // Ignore URL parsing errors and stick to default filename
        }

        // Force download by setting Content-Disposition
        headers.set('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Ensure CORS headers if necessary, though this is a direct browser download
        headers.set('Access-Control-Allow-Origin', '*');

        return new NextResponse(response.body, {
            status: 200,
            headers,
        });
    } catch (error: any) {
        console.error('Download proxy error:', error);
        return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
    }
}
