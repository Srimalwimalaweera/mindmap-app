/**
 * Sanitizes user-provided URLs to block javascript:, vbscript:, data:text/html, and other executable schemes.
 */
export function sanitizeUrl(rawUrl: string): string {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return '';

    // Allow safe app-internal schemes
    if (trimmed.startsWith('gdrive://') || trimmed.startsWith('/') || trimmed.startsWith('#')) {
        return trimmed;
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
        return '';
    } catch {
        return '';
    }
}

/**
 * Strips executable scripts, event handlers (onload, onerror, onclick...),
 * and dangerous tags from user-entered HTML/embed snippets.
 */
export function sanitizeHtml(html: string): string {
    if (!html) return '';
    return html
        // Remove <script>, <object>, <embed>, <applet>, <base>, <meta>, <link> tags
        .replace(/<\s*(script|object|embed|applet|base|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|object|embed|applet|base|meta|link)\b[^>]*\/?>/gi, '')
        // Strip inline event handlers like onclick="...", onerror='...', onload=...
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        // Neutralize javascript: / vbscript: / data:text/html in href/src attributes
        .replace(/(href|src|action|formaction)\s*=\s*(['"])\s*(?:javascript|vbscript|data\s*:\s*text\/html):[\s\S]*?\2/gi, '$1=$2#$2');
}

/**
 * Validates that an external URL is safe for server-side/edge proxy fetching (blocks SSRF to private networks).
 */
export function isSafeExternalFetchUrl(rawUrl: string, allowedHosts?: string[]): URL | null {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return null;
        }

        const host = parsed.hostname.toLowerCase();
        // Block localhost, loopback, link-local metadata, and private IPv4/IPv6 ranges
        if (
            host === 'localhost' ||
            host === '0.0.0.0' ||
            host.endsWith('.local') ||
            host.endsWith('.internal') ||
            host === '::1' ||
            host.startsWith('fe80:') ||
            host.startsWith('fc') ||
            host.startsWith('fd') ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        ) {
            return null;
        }

        if (allowedHosts && allowedHosts.length > 0) {
            const matched = allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
            if (!matched) return null;
        }

        return parsed;
    } catch {
        return null;
    }
}
