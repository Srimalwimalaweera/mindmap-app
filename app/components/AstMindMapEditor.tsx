'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import * as d3 from 'd3';
import NodeInputControl from './mind-map/NodeInputControl';
import TableEditorModal from './mind-map/TableEditorModal';
import CodeEditorModal from './mind-map/CodeEditorModal';
import { useAuth } from '../context/AuthProvider';
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

const transformer = new Transformer();
const GHOST_SYMBOL = '@[[ADD_NEW]]';
import { CustomNode } from '@/app/types/mindmap';

// Session cache to handle immediate fallback for deleted media before undo/cache flush
const deletedMediaSessionCache = new Set<string>();

// --- AST Helpers ---
const generateId = () => `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function findNode(root: CustomNode, id: string): CustomNode | null {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
}

function findParent(root: CustomNode, id: string): CustomNode | null {
    for (const child of root.children) {
        if (child.id === id) return root;
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

function customNodeToINode(node: CustomNode): any {
    return {
        content: node.content,
        payload: { id: node.id },
        children: node.children.map(customNodeToINode)
    };
}

function customNodeToMarkdown(node: CustomNode, depth: number = 0): string {
    const indent = '  '.repeat(Math.max(0, depth - 1));
    const prefix = depth === 0 ? '# ' : `${indent}- `;
    
    const contentStr = typeof node.content === 'string' ? node.content : String(node.content || '');
    const lines = contentStr.split('\n');
    const continuationIndent = depth === 0 ? '' : indent + '  ';
    const formattedContent = lines.map((line, idx) => idx === 0 ? `${prefix}${line}` : `${continuationIndent}${line}`).join('\n');
    
    let md = formattedContent + '\n';
    for (const child of node.children) {
        md += customNodeToMarkdown(child, depth + 1);
    }
    return md;
}

function markdownToCustomNode(md: string): CustomNode {
    const { root } = transformer.transform(md);
    const convert = (inode: any): CustomNode => ({
        id: generateId(),
        content: inode.content || '',
        children: (inode.children || []).map(convert)
    });
    return convert(root);
}

interface EditorProps {
    mapData: CustomNode;
    onMapDataChange: (newData: CustomNode) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onSave?: (data?: CustomNode) => Promise<void>;
}

interface EditingState {
    id: string;
    text: string;
    isGhost: boolean;
    x: number;
    y: number;
    mode?: 'menu' | 'input';
    template?: 'text' | 'link' | 'image' | 'code' | 'task';
    // AST Specific
    action?: 'EDIT' | 'NEW_CHILD' | 'INSERT_SIBLING' | 'INSERT_PARENT';
    targetNodeId?: string;
    payload?: any;
    depth?: number;
}

type ViewMode = 'visual' | 'note';

const forceDownloadMedia = async (src: string) => {
    try {
        const proxyUrl = `/api/download?url=${encodeURIComponent(src)}`;
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = proxyUrl;
        a.download = String(src || '').split('/').pop()?.split('?')[0] || 'mindmap-media';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        console.error('Forced download proxy failed, falling back to new tab', err);
        window.open(src, '_blank');
    }
};

export default function AstMindMapEditor({ mapData, onMapDataChange, onUndo, onRedo, canUndo = false, canRedo = false, onSave }: EditorProps) {
    const { userData } = useAuth();
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const [editing, setEditing] = useState<EditingState | null>(null);
    const editingRef = useRef<EditingState | null>(null);

    // New States for Advanced Interaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; payload: any } | null>(null);
    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const downloadBtnRef = useRef<HTMLButtonElement>(null);
    // Track expanded lines (Visual only, resets on reload)
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // Refs for Gestures
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [fullscreenCode, setFullscreenCode] = useState<string | null>(null);
    const [fullscreenMedia, setFullscreenMedia] = useState<{ src: string; type: 'image' | 'video' } | null>(null);
    const [fullscreenZoom, setFullscreenZoom] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Onboarding State
    const [showOnboarding, setShowOnboarding] = useState(false);

    const [refreshCount, setRefreshCount] = useState(0);

    useEffect(() => {
        const handleMediaLoad = () => {
            setRefreshCount(c => c + 1);
        };
        window.addEventListener('media-loaded', handleMediaLoad);
        return () => window.removeEventListener('media-loaded', handleMediaLoad);
    }, []);

    useEffect(() => {
        // Show onboarding only if map is basically empty (just title)
        if (mapData && mapData.children.length === 0) {
            setShowOnboarding(true);
        } else {
            setShowOnboarding(false);
        }
    }, [mapData]);

    // Use ref to access state inside event listener without re-binding
    const showOnboardingRef = useRef(false);
    useEffect(() => { showOnboardingRef.current = showOnboarding; }, [showOnboarding]);

    const dismissOnboarding = () => {
        if (showOnboardingRef.current) setShowOnboarding(false);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showOnboardingRef.current) dismissOnboarding();

            // Check for Ctrl+Z / Cmd+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    onRedo?.();
                } else {
                    onUndo?.();
                }
                e.preventDefault();
            }

            // Check for Ctrl+Y / Cmd+Y
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                onRedo?.();
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUndo, onRedo]);

    useEffect(() => {
        editingRef.current = editing;
    }, [editing]);

    // --- Lifecycle Logic ---

    // Initial Load & Markdown Updates
    useEffect(() => {
        let mounted = true;
        let initialTimer: NodeJS.Timeout | null = null;
        let resizeObserver: ResizeObserver | null = null;

        // Capture ref value for cleanup
        const svgElement = svgRef.current;

        if (viewMode === 'visual') {
            if (svgElement) {
                // Clear existing
                svgElement.innerHTML = '';
                // Remove any residual listeners to be safe
                d3.select(svgElement).on('click', null).on('.zoom', null);
            }

            requestAnimationFrame(() => {
                if (!mounted || !svgElement || !wrapperRef.current) return;

                // FIX: D3 Zoom fails with relative sizes (NotSupportedError).
                // We must use explicit pixel dimensions and update them on resize.
                const updateDimensions = () => {
                    if (wrapperRef.current && svgElement) {
                        const { width, height } = wrapperRef.current.getBoundingClientRect();
                        svgElement.setAttribute('width', width.toString());
                        svgElement.setAttribute('height', height.toString());
                        mmRef.current?.fit();
                    }
                };

                // Initial sizing
                updateDimensions();

                // Observe for resizing
                resizeObserver = new ResizeObserver(() => {
                    updateDimensions();
                });
                resizeObserver.observe(wrapperRef.current);

                try {
                    // 1. Create Instance
                    mmRef.current = Markmap.create(svgElement, {
                        autoFit: true,
                        zoom: true,
                        pan: true,
                    });

                    // 2. Load Data
                    if (mapData) {
                        const root = customNodeToINode(mapData);

                        // DATA-LEVEL FIX and FEATURE ENHANCEMENT
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const processNode = (node: any) => {
                            // 1. Ghost Node Logic
                            if (node.content && (node.content.includes(GHOST_SYMBOL) || node.content.includes('[[ADD_NEW]]'))) {
                                node.content = '<span class="ghost-node-placeholder" style="color: #9ca3af; font-style: italic; cursor: pointer;">+ Click to add</span>';
                                node.isGhost = true;
                            } else if (node.content) {
                                // 2. Media Handling (Lazy Load)
                                // Standard Markdown Images
                                const imgRegex = /!\[(.*?)\]\((.*?)\)(?:<!--(.*?)-->)?/g;
                                node.content = node.content.replace(imgRegex, (match: string, alt: string, url: string, comment: string) => {
                                    let renderWidth = 200;
                                    let renderHeight = 120;
                                    if (comment) {
                                        const widthMatch = comment.match(/width=(\d+)/);
                                        const heightMatch = comment.match(/height=(\d+)/);
                                        if (widthMatch && heightMatch) {
                                            const origWidth = parseInt(widthMatch[1]);
                                            const origHeight = parseInt(heightMatch[1]);
                                            const maxWidth = 320;
                                            const maxHeight = 320;
                                            renderWidth = origWidth;
                                            renderHeight = origHeight;
                                            if (renderWidth > maxWidth) {
                                                renderHeight = renderHeight * (maxWidth / renderWidth);
                                                renderWidth = maxWidth;
                                            }
                                            if (renderHeight > maxHeight) {
                                                renderWidth = renderWidth * (maxHeight / renderHeight);
                                                renderHeight = maxHeight;
                                            }
                                        }
                                    }
                                    return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1); width:${Math.round(renderWidth)}px; height:${Math.round(renderHeight)}px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                        <div class="media-preview" style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                            <span style="font-size:20px;">🖼️</span>
                                            <button class="load-media-btn" data-src="${url}" data-type="image" style="padding:2px 8px; font-size:10px; cursor:pointer; background:#3b82f6; color:white; border:none; border-radius:4px;">Load Image</button>
                                        </div>
                                    </div>`;
                                });

                                // Video Tags (from NodeInputControl)
                                const videoRegex = /<video[^>]*src=["'](.*?)["'][^>]*>.*?<\/video>/g;
                                node.content = node.content.replace(videoRegex, (match: string, url: string) => {
                                    const widthMatch = match.match(/width=["'](\d+)["']/);
                                    const heightMatch = match.match(/height=["'](\d+)["']/);
                                    let renderWidth = 220;
                                    let renderHeight = 130;
                                    if (widthMatch && heightMatch) {
                                        const origWidth = parseInt(widthMatch[1]);
                                        const origHeight = parseInt(heightMatch[1]);
                                        const maxWidth = 320;
                                        const maxHeight = 320;
                                        renderWidth = origWidth;
                                        renderHeight = origHeight;
                                        if (renderWidth > maxWidth) {
                                            renderHeight = renderHeight * (maxWidth / renderWidth);
                                            renderWidth = maxWidth;
                                        }
                                        if (renderHeight > maxHeight) {
                                            renderWidth = renderWidth * (maxHeight / renderHeight);
                                            renderHeight = maxHeight;
                                        }
                                    }
                                    return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1); width:${Math.round(renderWidth)}px; height:${Math.round(renderHeight)}px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                        <div class="media-preview" style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                            <span style="font-size:20px;">🎥</span>
                                            <button class="load-media-btn" data-src="${url}" data-type="video" style="padding:2px 8px; font-size:10px; cursor:pointer; background:#8b5cf6; color:white; border:none; border-radius:4px;">Load Video</button>
                                        </div>
                                    </div>`;
                                });

                                // Checkboxes (Visual Replacement)
                                // Replace "- [ ] " or "- [x] " at start or inline
                                node.content = node.content.replace(/- \[( |x)\]/g, (match: string, checkState: string) => {
                                    const isChecked = checkState === 'x';
                                    return `<input type="checkbox" ${isChecked ? 'checked' : ''} onclick="return false;" style="cursor: default; pointer-events: none; margin-right: 4px; vertical-align: middle;">`;
                                });

                                // Link Handling (Target Blank)
                                node.content = node.content.replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g, '<a href="$2" target="_blank"');

                                // 3. Truncation Logic (> 47 chars)
                                const strippedText = node.content.replace(/<[^>]+>/g, '');
                                if (strippedText.length > 47) {
                                    if (!node.payload) node.payload = {};

                                    // Check if expanded in React state
                                    const nodeId = node.payload?.id;
                                    const isExpanded = nodeId !== undefined && expandedNodes.has(nodeId);

                                    if (!isExpanded) {
                                        // Plain text truncation for safety
                                        if (!node.content.includes('<')) {
                                            node.payload.fullContent = node.content;
                                            node.content = node.content.substring(0, 47) + '...';
                                            node.payload.isTruncated = true;
                                        }
                                    }
                                }
                            }

                            if (node.children) {
                                node.children.forEach(processNode);
                            }
                        };
                        processNode(root);

                        mmRef.current.setData(root);
                        mmRef.current.fit();
                    }

                    // 3. Global Event Delegation (Robust Interaction)
                    // Instead of attaching listeners to transient nodes, we listen on the static SVG
                    const svg = d3.select(svgElement);

                    // Remove any existing click handlers to prevent duplicates
                    svg.on('click', null); // Clear prev
                    svg.on('contextmenu', null);

                    svg.on('click', function (event) {
                        dismissOnboarding(); // Dismiss on any click
                        const target = event.target as HTMLElement;

                        // MEDIA LOAD BUTTON CLICK
                        const loadMediaBtn = target.closest('.load-media-btn') as HTMLElement;
                        if (loadMediaBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const btn = loadMediaBtn;
                            const src = btn.getAttribute('data-src');
                            const type = btn.getAttribute('data-type');
                            const container = btn.closest('.media-placeholder-container');

                            if (container && src) {
                                if (type === 'image') {
                                    const isDeleted = deletedMediaSessionCache.has(src);
                                    
                                    if (isDeleted) {
                                        container.innerHTML = `<div style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px dashed rgba(239,68,68,0.4); border-radius:8px; color:#ef4444; font-size:12px; font-weight:600;">🖼️ Media Deleted</div>`;
                                        mmRef.current?.fit();
                                        return;
                                    }

                                    container.innerHTML = `
                                        <div style="position:relative; width:100%; height:100%; border-radius:8px; overflow:hidden;">
                                            <img src="${src}" onload="window.dispatchEvent(new Event('media-loaded'))" onerror="this.onerror=null; this.outerHTML='<div style=\\'display:inline-flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px dashed rgba(239,68,68,0.4); border-radius:8px; color:#ef4444; font-size:12px; font-weight:600;\\'>🖼️ Media Deleted</div>'" style="width:100%; height:100%; object-fit:contain; display:block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);" />
                                            <button class="media-download-btn" data-src="${src}" title="Download Image" style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 10;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.background='rgba(0,0,0,0.6)'">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                            </button>
                                            <button class="media-fullscreen-btn" data-src="${src}" data-type="image" title="Full Screen" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 10;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.background='rgba(0,0,0,0.6)'">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                                            </button>
                                        </div>
                                    `;
                                } else {
                                    const isDeleted = deletedMediaSessionCache.has(src);
                                    
                                    if (isDeleted) {
                                        container.innerHTML = `<div style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px dashed rgba(239,68,68,0.4); border-radius:8px; color:#ef4444; font-size:12px; font-weight:600;">🎞️ Media Deleted</div>`;
                                        mmRef.current?.fit();
                                        return;
                                    }

                                    container.innerHTML = `
                                        <div class="media-video-container" style="position:relative; width:100%; height:100%; border-radius:8px; overflow:hidden;">
                                            <video src="${src}" onloadedmetadata="window.dispatchEvent(new Event('media-loaded'))" onerror="this.onerror=null; this.outerHTML='<div style=\\'display:inline-flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px dashed rgba(239,68,68,0.4); border-radius:8px; color:#ef4444; font-size:12px; font-weight:600;\\'>🎞️ Media Deleted</div>'" controls autoplay style="width:100%; height:100%; object-fit:contain; display:block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);"></video>
                                            <button class="media-fullscreen-btn" data-src="${src}" data-type="video" title="Full Screen" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 10;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.9)'" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.background='rgba(0,0,0,0.6)'">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                                            </button>
                                        </div>
                                    `;
                                }
                                mmRef.current?.fit();
                            }
                            return;
                        }

                        // MEDIA DOWNLOAD BUTTON
                        const mediaDlBtn = target.closest('.media-download-btn') as HTMLElement;
                        if (mediaDlBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const src = mediaDlBtn.getAttribute('data-src');
                            if (src) forceDownloadMedia(src);
                            return;
                        }

                        // MEDIA FULLSCREEN BUTTON
                        const mediaFsBtn = target.closest('.media-fullscreen-btn') as HTMLElement;
                        if (mediaFsBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const src = mediaFsBtn.getAttribute('data-src');
                            const type = mediaFsBtn.getAttribute('data-type') as 'image' | 'video';
                            if (src) {
                                setFullscreenMedia({ src, type });
                                setFullscreenZoom(1);
                            }
                            return;
                        }

                        // CODE COPY BUTTON
                        const codeCopyBtn = target.closest('.code-copy-btn') as HTMLElement;
                        if (codeCopyBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const encodedCode = codeCopyBtn.getAttribute('data-code');
                            if (encodedCode) {
                                const codeToCopy = decodeURIComponent(encodedCode);
                                navigator.clipboard.writeText(codeToCopy).then(() => {
                                    // Visual feedback
                                    const originalHtml = codeCopyBtn.innerHTML;
                                    codeCopyBtn.innerHTML = `<span style="font-size: 10px; font-weight: bold; color: #22c55e;">COPIED</span>`;
                                    setTimeout(() => {
                                        codeCopyBtn.innerHTML = originalHtml;
                                    }, 2000);
                                });
                            }
                            return;
                        }

                        // CODE FULLSCREEN BUTTON
                        const codeFsBtn = target.closest('.code-fullscreen-btn') as HTMLElement;
                        if (codeFsBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const encodedCode = codeFsBtn.getAttribute('data-code');
                            if (encodedCode) {
                                setFullscreenCode(decodeURIComponent(encodedCode));
                            }
                            return;
                        }

                        // A. Check for Ghost Node Click
                        const ghostPlaceholder = target.closest('.ghost-node-placeholder');
                        if (ghostPlaceholder) {
                            event.preventDefault();
                            event.stopPropagation();
                            const nodeGroup = target.closest('g.markmap-node');
                            if (nodeGroup) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = d3.select(nodeGroup).datum() as any;
                                const wrapper = wrapperRef.current;
                                const dataNode = d?.data || d;
                                if (wrapper && dataNode) {
                                    const wrapperRect = wrapper.getBoundingClientRect();
                                    const rect = nodeGroup.getBoundingClientRect();
                                    const nodeId = dataNode.state?.id || dataNode.id || 'unknown';
                                    setEditing({
                                        id: nodeId,
                                        x: rect.left - wrapperRect.left + (rect.width / 2),
                                        y: rect.top - wrapperRect.top + (rect.height / 2),
                                        text: '',
                                        isGhost: true,
                                        payload: dataNode.payload || {},
                                        depth: d?.depth || dataNode.depth || 0,
                                        mode: 'input'
                                    });
                                }
                            }
                            return;
                        }

                        // B. Check for Regular Node Click
                        const textEl = target.closest('text, foreignObject');
                        if (textEl) {
                            const nodeGroup = target.closest('g.markmap-node');
                            if (nodeGroup) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = d3.select(nodeGroup).datum() as any;
                                const dataNode = d?.data || d;
                                if (dataNode?.content?.includes('ghost-node-placeholder')) return;

                                if (wrapperRef.current && dataNode) {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    // --- GESTURE LOGIC ---
                                    if (clickTimerRef.current) {
                                        // DOUBLE CLICK detected -> EDIT
                                        clearTimeout(clickTimerRef.current);
                                        clickTimerRef.current = null;

                                        const wrapper = wrapperRef.current;
                                        const wrapperRect = wrapper.getBoundingClientRect();
                                        const rect = textEl.getBoundingClientRect();
                                        const nodeId = dataNode.payload?.id || dataNode.id || 'unknown';

                                        // AST driven extraction
                                        const exactContent = dataNode.payload?.fullContent || dataNode.content;

                                        setEditing({
                                            id: nodeId,
                                            x: rect.left - wrapperRect.left,
                                            y: rect.top - wrapperRect.top,
                                            text: exactContent,
                                            isGhost: dataNode.isGhost || false,
                                            mode: 'input'
                                        });

                                    } else {
                                        // SINGLE CLICK detected -> EXPAND (Delayed)
                                        clickTimerRef.current = setTimeout(() => {
                                            clickTimerRef.current = null;

                                            // Toggle Expansion logic
                                            const nodeId = dataNode.payload?.id;
                                            if (nodeId !== undefined) {
                                                if (dataNode.payload?.isTruncated) {
                                                    setExpandedNodes(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(nodeId)) next.delete(nodeId);
                                                        else next.add(nodeId);
                                                        return next;
                                                    });
                                                } else {
                                                    const circle = nodeGroup.querySelector('circle');
                                                    if (circle) {
                                                        const clickEvent = new MouseEvent('click', {
                                                            view: window,
                                                            bubbles: true,
                                                            cancelable: true
                                                        });
                                                        circle.dispatchEvent(clickEvent);
                                                    }
                                                }
                                            }
                                        }, 250);
                                    }
                                }
                            }
                            return;
                        }

                        // C. Background Click
                        // NodeInputControl handles auto-save on blur, so we don't need to force close editing here
                        // unless we specifically want to cancel.
                        // But clicking background IS a "blur" event usually.

                        setContextMenu(null);
                        setDownloadMenuOpen(false);
                    });

                    // D. Context Menu (Right Click)
                    svg.on('contextmenu', function (event) {
                        event.preventDefault(); // Disable browser menu
                        const target = event.target as Element;

                        // Check if node
                        const textEl = target.closest('text, foreignObject');
                        if (textEl && wrapperRef.current) {
                            const nodeGroup = target.closest('g.markmap-node');
                            if (nodeGroup) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = d3.select(nodeGroup).datum() as any;
                                const dataNode = d?.data || d;
                                const nodeId = dataNode.payload?.id || dataNode.id || 'unknown';

                                const [bx, by] = d3.pointer(event, wrapperRef.current);
                                setContextMenu({
                                    x: bx,
                                    y: by,
                                    nodeId: nodeId,
                                    payload: dataNode.payload || {}
                                });
                                return;
                            }
                        }
                        // Close if background right click
                        setContextMenu(null);
                    });

                    // (Optional) Visual Reinforcement
                    const updateStyles = () => {
                        if (!svgElement) return;
                        const s = d3.select(svgElement);
                        s.selectAll('.ghost-node-placeholder').style('cursor', 'pointer');
                    };

                    // Clear any previous timer
                    if (initialTimer) clearInterval(initialTimer);
                    initialTimer = setInterval(updateStyles, 500);

                } catch (err) {
                    console.error("Markmap init error", err);
                }
            });
        }

        return () => {
            mounted = false;
            if (resizeObserver) resizeObserver.disconnect();
            if (initialTimer) clearInterval(initialTimer);

            // Critical Fix for D3 Zoom Error
            if (svgElement) {
                const svg = d3.select(svgElement);
                svg.on('click', null);
                svg.on('.zoom', null);
                svg.on('contextmenu', null);
                svgElement.innerHTML = '';
            }

            if (mmRef.current) {
                mmRef.current.destroy();
                mmRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, expandedNodes]); // Re-run if viewMode or expandedNodes changes

    // Sync MapData
    useEffect(() => {
        if (viewMode === 'visual' && mmRef.current && mapData) {
            const root = customNodeToINode(mapData);

            // Re-apply Data Transformation on updates
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const processNode = (node: any) => {
                // 1. Ghost Node Logic
                if (node.content && (node.content.includes(GHOST_SYMBOL) || node.content.includes('[[ADD_NEW]]'))) {
                    node.content = '<span class="ghost-node-placeholder" style="color: #9ca3af; font-style: italic; cursor: pointer;">+ Click to add</span>';
                    node.isGhost = true;
                } else if (node.content) {
                    // 2. Link Handling (Open in new window) & Media Thumbnails
                    node.content = node.content.replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g, '<a href="$2" target="_blank"');

                    // 2.1 Code Block Custom Styling
                    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
                    node.content = node.content.replace(codeBlockRegex, (match: string, lang: string, code: string) => {
                        const encodedCode = encodeURIComponent(code);
                        return `
                        <div class="code-node-container" style="background:#1e1e2e; border:1px solid rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; font-family:monospace; font-size:12px; margin-top:4px; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);">
                            <div style="background:rgba(0,0,0,0.3); padding:4px 8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05);">
                                <span style="color:rgba(255,255,255,0.5); font-size:10px;">${lang || 'CODE'}</span>
                                <div style="display:flex; gap:4px;">
                                    <button class="code-copy-btn" data-code="${encodedCode}" style="background:rgba(255,255,255,0.1); border:none; border-radius:4px; color:white; cursor:pointer; padding:2px 6px; font-size:10px; display:flex; align-items:center; transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                                        COPY
                                    </button>
                                    <button class="code-fullscreen-btn" data-code="${encodedCode}" style="background:rgba(255,255,255,0.1); border:none; border-radius:4px; color:white; cursor:pointer; padding:2px 6px; font-size:10px; display:flex; align-items:center; transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                                    </button>
                                </div>
                            </div>
                            <div style="max-height: 250px; overflow-y: auto; padding:8px;">
                                <pre style="margin:0; color:#e2e8f0; white-space:pre-wrap; word-wrap:break-word;">${code.trim()}</pre>
                            </div>
                        </div>`;
                    });

                    // 2. Media Handling (Lazy Load) - SYNCED
                    const imgRegex = /!\[(.*?)\]\((.*?)\)(?:<!--(.*?)-->)?/g;
                    node.content = node.content.replace(imgRegex, (match: string, alt: string, url: string, comment: string) => {
                        let renderWidth = 200;
                        let renderHeight = 120;
                        if (comment) {
                            const widthMatch = comment.match(/width=(\d+)/);
                            const heightMatch = comment.match(/height=(\d+)/);
                            if (widthMatch && heightMatch) {
                                const origWidth = parseInt(widthMatch[1]);
                                const origHeight = parseInt(heightMatch[1]);
                                const maxWidth = 224;
                                const maxHeight = 224;
                                renderWidth = origWidth;
                                renderHeight = origHeight;
                                if (renderWidth > maxWidth) {
                                    renderHeight = renderHeight * (maxWidth / renderWidth);
                                    renderWidth = maxWidth;
                                }
                                if (renderHeight > maxHeight) {
                                    renderWidth = renderWidth * (maxHeight / renderHeight);
                                    renderHeight = maxHeight;
                                }
                            }
                        }
                        return `<div class="media-placeholder-container image-node" style="display:inline-block; position:relative; width:${Math.round(renderWidth)}px; height:${Math.round(renderHeight)}px; border-radius:8px; overflow:hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);">
                            <div style="position:absolute; inset:0; background-image:url('${url}'); background-size:cover; background-position:center; filter:blur(10px); opacity:0.6;"></div>
                            <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                                <span style="font-size:24px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🖼️</span>
                                <button class="load-media-btn" data-src="${url}" data-type="image" style="padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer; background:rgba(255,255,255,0.2); backdrop-filter:blur(4px); color:white; border:1px solid rgba(255,255,255,0.4); border-radius:20px; transition:all 0.2s; box-shadow:0 4px 6px rgba(0,0,0,0.3);" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">Load Image</button>
                            </div>
                        </div>`;
                    });

                    const videoRegex = /<video[^>]*src=["'](.*?)["'][^>]*>.*?<\/video>/g;
                    node.content = node.content.replace(videoRegex, (match: string, url: string) => {
                        const widthMatch = match.match(/width=["'](\d+)["']/);
                        const heightMatch = match.match(/height=["'](\d+)["']/);
                        let renderWidth = 220;
                        let renderHeight = 130;
                        if (widthMatch && heightMatch) {
                            const origWidth = parseInt(widthMatch[1]);
                            const origHeight = parseInt(heightMatch[1]);
                            const maxWidth = 224;
                            const maxHeight = 224;
                            renderWidth = origWidth;
                            renderHeight = origHeight;
                            if (renderWidth > maxWidth) {
                                renderHeight = renderHeight * (maxWidth / renderWidth);
                                renderWidth = maxWidth;
                            }
                            if (renderHeight > maxHeight) {
                                renderWidth = renderWidth * (maxHeight / renderHeight);
                                renderHeight = maxHeight;
                            }
                        }
                        return `<div class="media-placeholder-container video-node" style="display:inline-block; position:relative; width:${Math.round(renderWidth)}px; height:${Math.round(renderHeight)}px; border-radius:8px; overflow:hidden; background:linear-gradient(135deg, #1e1e2e, #2d2b42); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1);">
                            <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                                <div style="width:40px; height:40px; border-radius:50%; background:rgba(139, 92, 246, 0.2); display:flex; align-items:center; justify-content:center; border:1px solid rgba(139, 92, 246, 0.5);">
                                    <span style="font-size:20px;">🎥</span>
                                </div>
                                <button class="load-media-btn" data-src="${url}" data-type="video" style="padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer; background:rgba(139, 92, 246, 0.8); color:white; border:none; border-radius:20px; transition:all 0.2s; box-shadow:0 4px 6px rgba(0,0,0,0.3);" onmouseover="this.style.background='rgba(139, 92, 246, 1)'" onmouseout="this.style.background='rgba(139, 92, 246, 0.8)'">Play Video</button>
                            </div>
                        </div>`;
                    });

                    // Checkboxes (Visual Replacement) - SYNCED
                    node.content = node.content.replace(/- \[( |x)\]/g, (match: string, checkState: string) => {
                        const isChecked = checkState === 'x';
                        return `<input type="checkbox" ${isChecked ? 'checked' : ''} onclick="return false;" style="cursor: default; pointer-events: none; margin-right: 4px; vertical-align: middle;">`;
                    });

                    const mediaMatch = node.content.match(/\.(jpeg|jpg|gif|png|mp4|webm|webp)/i);
                    if (mediaMatch) {
                        const icon = mediaMatch[0].match(/mp4|webm/i) ? '🎥' : '🖼️';
                        node.content += ` <span style="font-size: 0.8em; margin-left: 4px;" title="Media Content">${icon}</span>`;
                    }

                    // 3. Truncation Logic (> 47 chars)
                    const strippedText = node.content.replace(/<[^>]+>/g, '');
                    if (strippedText.length > 47) {
                        if (!node.payload) node.payload = {};

                        const nodeId = node.payload?.id;
                        const isExpanded = nodeId !== undefined && expandedNodes.has(nodeId);

                        if (!isExpanded) {
                            if (!node.content.includes('<')) {
                                node.payload.fullContent = node.content;
                                node.content = node.content.substring(0, 47) + '...';
                                node.payload.isTruncated = true;
                            }
                        }
                    }
                }

                if (node.children) {
                    node.children.forEach(processNode);
                }
            };
            processNode(root);

            try {
                mmRef.current.setData(root);
                mmRef.current.fit();
            } catch (e) {
                console.error("Update error:", e);
            }
        }
    }, [mapData, viewMode, expandedNodes, refreshCount]);

    const handleSave = (newText: string) => {
        if (!editing) return;
        
        // If ghost AND empty -> Cancel (Keep as ghost)
        if (editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        // If regular node OR NEW_CHILD OR INSERT_PARENT AND empty -> Cancel
        if (!editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        let finalContent = newText;
        if (editing.template) {
            switch (editing.template) {
                case 'link': finalContent = `[${newText}](https://)`; break;
                case 'image': finalContent = `![${newText}]()`; break;
                case 'code': finalContent = `\`\`\`\n${newText}\n\`\`\``; break;
                case 'task': finalContent = `- [ ] ${newText}`; break;
                case 'text': default: finalContent = newText;
            }
        }

        const newData = structuredClone(mapData);
        
        if (editing.action === 'NEW_CHILD') {
            const parent = findNode(newData, editing.targetNodeId!);
            if (parent) {
                parent.children.push({ id: generateId(), content: finalContent, children: [] });
            }
        } else if (editing.action === 'INSERT_SIBLING') {
            const parent = findParent(newData, editing.targetNodeId!);
            if (parent) {
                const idx = parent.children.findIndex(c => c.id === editing.targetNodeId);
                parent.children.splice(idx + 1, 0, { id: generateId(), content: finalContent, children: [] });
            } else if (newData.id === editing.targetNodeId) {
                // If targeting root, can't add sibling
            }
        } else if (editing.action === 'INSERT_PARENT') {
            const parent = findParent(newData, editing.targetNodeId!);
            if (parent) {
                const idx = parent.children.findIndex(c => c.id === editing.targetNodeId);
                const oldChild = parent.children[idx];
                const newParentNode: CustomNode = {
                    id: generateId(),
                    content: finalContent,
                    children: [oldChild]
                };
                parent.children[idx] = newParentNode;
            }
        } else if (editing.isGhost) {
            const node = findNode(newData, editing.id);
            if (node) {
                node.content = finalContent; // no longer ghost
                // Append new ghost for rapid entry
                const parent = findParent(newData, editing.id);
                if (parent) {
                    parent.children.push({ id: generateId(), content: GHOST_SYMBOL, children: [] });
                }
            }
        } else {
            const node = findNode(newData, editing.id);
            if (node) {
                node.content = finalContent;
            }
        }

        onMapDataChange(newData);
        if ((newText.includes('![Media]') || newText.includes('<video')) && onSave) {
            onSave(newData);
        }
        setEditing(null);
    };

    const handleEditFromContext = () => {
        if (!contextMenu) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const wrapperRect = wrapper.getBoundingClientRect();
        
        const node = findNode(mapData, contextMenu.nodeId);
        if (node) {
            setEditing({
                id: node.id,
                x: contextMenu.x,
                y: contextMenu.y,
                text: node.content,
                isGhost: node.isGhost || false,
                mode: 'input'
            });
        }
        setContextMenu(null);
    };

    const [deleteConfirmation, setDeleteConfirmation] = useState<{ count: number; targetId: string; hasMedia?: boolean } | null>(null);

    const extractMediaUrls = (node: CustomNode): string[] => {
        const urls: string[] = [];
        
        const extractFromContent = (content: string) => {
            const imgRegex = /!\[.*?\]\((.*?)\)/g;
            let match;
            while ((match = imgRegex.exec(content)) !== null) {
                if (match[1] && match[1].includes('firebasestorage.googleapis.com')) {
                    urls.push(match[1]);
                }
            }
            const videoRegex = /<video[^>]*src=["'](.*?)["']/g;
            while ((match = videoRegex.exec(content)) !== null) {
                if (match[1] && match[1].includes('firebasestorage.googleapis.com')) {
                    urls.push(match[1]);
                }
            }
        };
        
        extractFromContent(node.content);
        node.children.forEach(child => {
            urls.push(...extractMediaUrls(child));
        });
        
        return urls;
    };

    const extractMediaQuotas = (node: CustomNode): { imagesBytes: number, videosBytes: number } => {
        let imagesBytes = 0;
        let videosBytes = 0;
        
        const extractFromContent = (content: string) => {
            const imgRegex = /!\[.*?\]\(.*?\).*?<!--\s*size=(\d+).*?-->/g;
            let match;
            while ((match = imgRegex.exec(content)) !== null) {
                imagesBytes += parseInt(match[1] || '0', 10);
            }
            const videoRegex = /<video[^>]*data-size=["'](\d+)["'][^>]*>/g;
            while ((match = videoRegex.exec(content)) !== null) {
                videosBytes += parseInt(match[1] || '0', 10);
            }
        };
        
        extractFromContent(node.content);
        node.children.forEach(child => {
            const childQuotas = extractMediaQuotas(child);
            imagesBytes += childQuotas.imagesBytes;
            videosBytes += childQuotas.videosBytes;
        });
        
        return { imagesBytes, videosBytes };
    };

    const processDeletedMedia = async (node: CustomNode) => {
        const urls = extractMediaUrls(node);
        if (urls.length > 0) {
            try {
                for (const url of urls) {
                    deletedMediaSessionCache.add(url);
                    // Decode URL to get storage ref and delete immediately
                    const matches = url.match(/\/o\/(.*?)\?alt=media/);
                    if (matches && matches[1]) {
                        const filePath = decodeURIComponent(matches[1]);
                        const fileRef = ref(storage, filePath);
                        await deleteObject(fileRef).catch(e => console.error("Error deleting from storage:", e));
                    }
                }
            } catch (error) {
                console.error("Error logging/deleting media", error);
            }
        }
    };

    const handleDelete = () => {
        const targetId = editing?.id || contextMenu?.nodeId;
        const isGhost = editing?.isGhost || false;

        if (!targetId || isGhost) return;

        const node = findNode(mapData, targetId);
        if (!node) return;
        if (node.id === mapData.id) return; // Can't delete root

        const mediaUrls = extractMediaUrls(node);
        // If it has children OR media, confirm deletion
        if (node.children.length > 0 || mediaUrls.length > 0) {
            setDeleteConfirmation({ 
                count: node.children.length + 1, 
                targetId,
                hasMedia: mediaUrls.length > 0
            });
            setContextMenu(null);
            return;
        }

        processDeletedMedia(node);

        const newData = structuredClone(mapData);
        // Helper deleteNode
        const parent = findParent(newData, targetId);
        if (parent) {
            parent.children = parent.children.filter(c => c.id !== targetId);
        }
        
        onMapDataChange(newData);
        setEditing(null);
        setContextMenu(null);
    };

    const confirmDelete = () => {
        if (!deleteConfirmation) return;
        const node = findNode(mapData, deleteConfirmation.targetId);
        if (node) {
            processDeletedMedia(node);
        }
        
        const newData = structuredClone(mapData);
        const parent = findParent(newData, deleteConfirmation.targetId);
        if (parent) {
            parent.children = parent.children.filter(c => c.id !== deleteConfirmation.targetId);
        }
        onMapDataChange(newData);
        setDeleteConfirmation(null);
        setEditing(null);
    };

    const cancelDelete = () => {
        setDeleteConfirmation(null);
    };

    // --- Toolbar Actions ---
    const handleZoomIn = () => { if (mmRef.current) mmRef.current.rescale(1.2); };
    const handleZoomOut = () => { if (mmRef.current) mmRef.current.rescale(0.8); };
    const handleFit = () => { if (mmRef.current) mmRef.current.fit(); };

    // --- Download Actions ---
    const prepareDownload = async () => {
        if (onSave) {
            await onSave();
        }
    };

    const handleDownloadText = async () => {
        await prepareDownload();
        const mdText = customNodeToMarkdown(mapData);
        const blob = new Blob([mdText], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mindmap.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadMenuOpen(false);
    };

    const handleDownloadSVG = async () => {
        await prepareDownload();
        if (!svgRef.current) return;

        let svgData = new XMLSerializer().serializeToString(svgRef.current);

        // Inject styles for Dark Theme (App Theme)
        // Background: #1e1e2e (Dark Purple/Blue)
        // Text: White

        const styleBlock = '<style>text { fill: white !important; } .markmap-node > path { fill: none; stroke: white !important; }</style>';

        // Prepend a background rectangle
        // We need to get the width/height to make the rect cover the whole area
        // If not explicit, we use 100%
        const bgRect = '<rect width="100%" height="100%" fill="#1e1e2e"></rect>';

        // Insert styleblock
        svgData = svgData.replace(/>/, `>${styleBlock}`);
        // Insert background rect immediately after (so it's behind everything)
        // Note: SVG order matters, first child is back-most.
        svgData = svgData.replace(/>/, `>${bgRect}`);

        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mindmap.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadMenuOpen(false);
    };

    const handleDownloadHTML = async () => {
        await prepareDownload();

        const mdText = customNodeToMarkdown(mapData);

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mind Map Export</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        /* White Background, Black Text */
        body { margin: 0; padding: 0; overflow: hidden; background-color: #ffffff; color: #000; font-family: sans-serif; }
        #app { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
        #svg-container { flex: 1; width: 100%; height: 100%; position: relative; }
        svg { width: 100%; height: 100%; }
        
        /* Enforce Black Text for HTML Viewer (White Mode) */
        .markmap-node text { fill: black !important; }
        /* Ensure paths/lines are visible against white */
        .markmap-node > path { stroke: #555 !important; }
        
        .controls {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            background: rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            padding: 8px;
            border-radius: 50px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        button {
            background: transparent;
            border: none;
            color: #333;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        
        button:hover {
            background: rgba(0, 0, 0, 0.1);
            color: #000;
        }

        .hidden { display: none !important; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib"></script>
</head>
<body>
    <div id="app">
        <div id="svg-container">
            <svg id="mindmap"></svg>
        </div>
        
        <div class="controls">
             <button onclick="handleZoomOut()" title="Zoom Out">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button onclick="handleFit()" title="Fit to Screen">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button> 
            <button onclick="handleZoomIn()" title="Zoom In">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button onclick="toggleFullscreen()" title="Fullscreen">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            </button>
        </div>
    </div>

    <script>
        const markdown = \`\` + decodeURIComponent("` + encodeURIComponent(mdText) + `");
        const transformer = new markmap.Transformer();
        const { root } = transformer.transform(markdown);
        let mm;

        function init() {
            mm = markmap.Markmap.create('#mindmap', {
                autoFit: true,
                zoom: true,
                pan: true,
            }, root);
        }

        function handleZoomIn() { mm.rescale(1.2); }
        function handleZoomOut() { mm.rescale(0.8); }
        function handleFit() { mm.fit(); }
        function toggleFullscreen() {
             if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        init();
    </script>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mindmap.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadMenuOpen(false);
    };


    // Keyboard Shortcuts (Ctrl+S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.code === 'KeyS')) {
                e.preventDefault();
                e.stopPropagation();
                if (onSave) {
                    onSave();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onSave]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            wrapperRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const userPlan = userData?.plan || 'free';
    const quotas = useMemo(() => extractMediaQuotas(mapData), [mapData]);

    // Plan limits in bytes
    const imageLimitBytes = userPlan === 'ultra' ? 50 * 1024 * 1024 : userPlan === 'pro' ? 20 * 1024 * 1024 : 0;
    const videoLimitBytes = userPlan === 'ultra' ? 150 * 1024 * 1024 : 0;

    return (
        <div ref={wrapperRef} onClick={() => setContextMenu(null)} className="w-full h-full relative overflow-hidden bg-transparent group select-none text-white">
            
            {/* Quota Display */}
            {userPlan !== 'free' && (
                <div className="absolute top-20 right-4 z-40 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 rounded-xl text-[10px] text-slate-300 shadow-xl flex flex-col gap-1 pointer-events-none">
                    <div className="font-semibold text-xs text-white mb-1 border-b border-slate-700 pb-1 flex items-center justify-between">
                        Media Quotas
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded ml-2">{userPlan.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>Images:</span>
                        <span className={quotas.imagesBytes > imageLimitBytes ? 'text-red-400' : 'text-slate-100'}>
                            {(quotas.imagesBytes / (1024 * 1024)).toFixed(1)}MB / {(imageLimitBytes / (1024 * 1024)).toFixed(0)}MB
                        </span>
                    </div>
                    {userPlan === 'ultra' && (
                        <div className="flex justify-between gap-4">
                            <span>Videos:</span>
                            <span className={quotas.videosBytes > videoLimitBytes ? 'text-red-400' : 'text-slate-100'}>
                                {(quotas.videosBytes / (1024 * 1024)).toFixed(1)}MB / {(videoLimitBytes / (1024 * 1024)).toFixed(0)}MB
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Visual Mode */}
            {viewMode === 'visual' && (
                <div className="w-full h-full animate-in fade-in duration-300">
                    <svg ref={svgRef} className="w-full h-full opacity-0 highlight-none markmap-svg text-white" style={{ opacity: 1, color: 'white' }} />

                    {/* Custom Deletion Confirmation Modal */}
                    {deleteConfirmation && (
                        <div className="absolute inset-0 z-[10001] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-6 max-w-sm w-full mx-4 transform transition-all scale-100 animate-in zoom-in-95 duration-200">
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                                    Confirm Deletion
                                </h3>
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-sm leading-relaxed">
                                    Are you sure you want to delete this node{deleteConfirmation.count > 1 ? ` and its ${deleteConfirmation.count - 1} children` : ''}?
                                    {deleteConfirmation.hasMedia && (
                                        <span className="block mt-3 font-semibold text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20 shadow-sm">
                                            ⚠️ This action permanently deletes the media from storage. Undo will leave a missing media placeholder.
                                        </span>
                                    )}
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={cancelDelete}
                                        className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Context Menu */}
                    {contextMenu && (() => {
                        const isRootNode = contextMenu.nodeId === mapData.id;

                        return (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: contextMenu.x,
                                    top: contextMenu.y,
                                    zIndex: 10000,
                                }}
                                className="bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-700/60 p-1.5 min-w-[170px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1 ring-1 ring-white/10"
                            >
                                <button
                                    onClick={() => {
                                        if (!contextMenu) return;
                                        setEditing({
                                            id: 'NEW_CHILD',
                                            x: contextMenu.x,
                                            y: contextMenu.y,
                                            text: '',
                                            isGhost: false,
                                            action: 'NEW_CHILD',
                                            targetNodeId: contextMenu.nodeId,
                                            mode: 'input'
                                        });
                                        setContextMenu(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium rounded-xl hover:bg-blue-600/20 text-blue-300 hover:text-white flex items-center justify-between group transition-colors"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="p-1 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                        </span>
                                        Add Child Node
                                    </span>
                                    <span className="text-[9px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded font-mono">Child ➔</span>
                                </button>

                                {/* ROOT NODE RULE: Block Sibling/Parent for Root (Project Name) Node */}
                                {!isRootNode && (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (!contextMenu) return;
                                                setEditing({
                                                    id: 'INSERT_SIBLING',
                                                    x: contextMenu.x,
                                                    y: contextMenu.y,
                                                    text: '',
                                                    isGhost: false,
                                                    action: 'INSERT_SIBLING',
                                                    targetNodeId: contextMenu.nodeId,
                                                    mode: 'input'
                                                });
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium rounded-xl hover:bg-emerald-600/20 text-emerald-300 hover:text-white flex items-center justify-between group transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5v14" /></svg>
                                                </span>
                                                Add Sibling Node
                                            </span>
                                            <span className="text-[9px] bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 rounded font-mono">⬇ Sibling</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (!contextMenu) return;
                                                setEditing({
                                                    id: 'INSERT_PARENT',
                                                    x: contextMenu.x,
                                                    y: contextMenu.y,
                                                    text: '',
                                                    isGhost: false,
                                                    action: 'INSERT_PARENT',
                                                    targetNodeId: contextMenu.nodeId,
                                                    mode: 'input'
                                                });
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium rounded-xl hover:bg-purple-600/20 text-purple-300 hover:text-white flex items-center justify-between group transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="p-1 rounded-lg bg-purple-500/20 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                                </span>
                                                Insert Parent Node
                                            </span>
                                            <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded font-mono">⬆ Parent</span>
                                        </button>
                                    </>
                                )}

                                <div className="h-[1px] bg-slate-800 my-0.5" />

                                <button
                                    onClick={handleEditFromContext}
                                    className="w-full text-left px-3 py-2 text-xs font-medium rounded-xl hover:bg-amber-600/20 text-amber-300 hover:text-white flex items-center gap-2 group transition-colors"
                                >
                                    <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </span>
                                    Edit Node Content
                                </button>

                                <button
                                    onClick={handleDelete}
                                    className="w-full text-left px-3 py-2 text-xs font-medium rounded-xl hover:bg-rose-600/20 text-rose-300 hover:text-rose-200 flex items-center gap-2 group transition-colors"
                                >
                                    <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </span>
                                    Delete Node
                                </button>
                            </div>
                        );
                    })()}

                    {editing && (() => {
                        const isExistingTableNode = editing.id !== 'NEW_CHILD' &&
                            editing.id !== 'INSERT_PARENT' &&
                            editing.id !== 'GHOST' &&
                            (editing.text.includes('<table') || editing.text.includes('<table>') || (editing.text.includes('|') && editing.text.includes('---')));

                        const isExistingCodeNode = editing.id !== 'NEW_CHILD' &&
                            editing.id !== 'INSERT_PARENT' &&
                            editing.id !== 'GHOST' &&
                            (editing.text.includes('<div class="code-node-container"') || editing.text.startsWith('```'));

                        if (isExistingTableNode) {
                            return (
                                <TableEditorModal
                                    isOpen={true}
                                    onClose={() => setEditing(null)}
                                    initialData={editing.text}
                                    onSubmit={(tableHtml) => {
                                        handleSave(tableHtml);
                                    }}
                                />
                            );
                        }

                        if (isExistingCodeNode) {
                            return (
                                <CodeEditorModal
                                    isOpen={true}
                                    onClose={() => setEditing(null)}
                                    initialData={editing.text}
                                    onSubmit={(codeHtml) => {
                                        handleSave(codeHtml);
                                    }}
                                />
                            );
                        }

                        return (
                            <div
                                style={{
                                    position: 'fixed',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 9999,
                                }}
                            >
                                <NodeInputControl
                                    initialValue={editing.text}
                                    nodeId={editing.id}
                                    onSubmit={(val) => {
                                        handleSave(val);
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Note Mode */}
            {viewMode === 'note' && (
                <div className="w-full h-full flex flex-col p-8 animate-in fade-in duration-300 bg-transparent">
                    <div className="max-w-3xl mx-auto w-full h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                Note Editor
                            </h2>
                            <span className="text-xs text-zinc-400">Markdown Mode</span>
                        </div>

                        <textarea
                            className="flex-1 w-full bg-white/5 backdrop-blur-md p-6 rounded-lg shadow-sm border border-white/10 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm leading-relaxed text-white placeholder-gray-400"
                            value={customNodeToMarkdown(mapData)}
                            onChange={(e) => {
                                const newMapData = markdownToCustomNode(e.target.value);
                                // Inherit the original root ID so it doesn't break everything
                                newMapData.id = mapData.id;
                                onMapDataChange(newMapData);
                            }}
                            placeholder="Start typing your mind map..."
                        />
                        <p className="mt-3 text-xs text-zinc-500 text-center">
                            Tip: Use <code className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">@{GHOST_SYMBOL}</code> to place ghost nodes manually.
                        </p>
                    </div>
                </div>
            )}

            {/* Floating Control Bar */}
            <div className="fixed bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-1 md:gap-3 bg-white/5 backdrop-blur-md p-1.5 px-3 md:p-2 md:px-4 rounded-full shadow-2xl border border-white/10 z-[50] max-w-[95vw] overflow-x-auto no-scrollbar">
                {viewMode === 'visual' && (
                    <div className="flex items-center gap-1 pr-3 border-r border-white/10">
                        <div className="flex items-center gap-0.5 mr-2 pr-2 border-r border-white/10">
                            <button
                                onClick={onUndo}
                                disabled={!canUndo}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Undo (Ctrl+Z)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 7v6h6" />
                                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                                </svg>
                            </button>
                            <button
                                onClick={onRedo}
                                disabled={!canRedo}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Redo (Ctrl+Shift+Z)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 7v6h-6" />
                                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                                </svg>
                            </button>
                        </div>
                        <button onClick={handleZoomOut} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Zoom Out">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>

                        {/* Download Button */}
                        <div className="relative">
                            <button
                                ref={downloadBtnRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!downloadMenuOpen && downloadBtnRef.current) {
                                        const rect = downloadBtnRef.current.getBoundingClientRect();
                                        // Position above the button, aligned to the left (or right)
                                        // Since the button is in a centered bar, fixed coord is safest.
                                        setMenuPosition({
                                            x: rect.left,
                                            y: window.innerHeight - rect.top + 8 // 8px padding from bottom of rect top? No, we want it ABOVE the button.
                                        });
                                        // Actually, bottom property for fixed pos is distance from bottom edge.
                                        // If we use top/left:
                                        // top: rect.top - menuHeight. We don't know menu height easily.
                                        // bottom: window.innerHeight - rect.top + margin.
                                        // Yes, using `bottom` is better if we want it to grow upwards.
                                        // The style below uses `left` and `bottom`.
                                    }
                                    setDownloadMenuOpen(!downloadMenuOpen);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                                title="Download"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </button>
                        </div>

                        <button onClick={handleFit} className="px-3 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium transition-colors" title="Fit to Screen">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            </svg>
                        </button>
                        <button onClick={handleZoomIn} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Zoom In">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>
                    </div>
                )}

                <button onClick={toggleFullscreen} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Toggle Fullscreen">
                    {isFullscreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                    )}
                </button>

                <div className="flex bg-white/5 rounded-full p-1 relative ml-1 border border-white/10">
                    <button
                        onClick={() => setViewMode('visual')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'visual' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        Visual
                    </button>
                    <button
                        onClick={() => setViewMode('note')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'note' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Note
                    </button>
                </div>
            </div>

            {/* Download Menu (Fixed Position) */}
            {downloadMenuOpen && (
                <div
                    style={{
                        position: 'fixed',
                        left: menuPosition.x,
                        bottom: menuPosition.y,
                        zIndex: 100,
                    }}
                    className="min-w-[180px] bg-zinc-900 rounded-lg shadow-xl border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col"
                >
                    <button onClick={handleDownloadHTML} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 text-gray-200 flex items-center gap-2">
                        <span className="text-orange-500 font-bold">HTML</span> Download as HTML
                    </button>
                    <button onClick={handleDownloadSVG} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 text-gray-200 flex items-center gap-2">
                        <span className="text-blue-500 font-bold">SVG</span> Download as SVG
                    </button>
                    <button onClick={handleDownloadText} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 text-gray-200 flex items-center gap-2">
                        <span className="text-gray-500 font-bold">TXT</span> Download as Note
                    </button>
                </div>
            )}

            {/* Onboarding Tooltip */}
            {showOnboarding && viewMode === 'visual' && (
                <div className="absolute top-[55%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
                    <div className="animate-bounce">
                        <div className="relative bg-blue-600/90 text-white px-4 py-3 rounded-xl shadow-2xl border border-blue-400/30 backdrop-blur-md">
                            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-8 border-b-blue-600/90"></div>
                            <div className="flex flex-col items-center gap-1 text-center">
                                <span className="font-bold text-sm">Right-click center node</span>
                                <span className="text-[10px] opacity-80">to start creating your map!</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Fullscreen Code Modal */}
            {fullscreenCode && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px'
                    }}
                    onClick={() => setFullscreenCode(null)}
                >
                    <button
                        onClick={() => setFullscreenCode(null)}
                        style={{
                            position: 'absolute',
                            top: '24px',
                            right: '24px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            cursor: 'pointer',
                            zIndex: 100000,
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <div 
                        onClick={e => e.stopPropagation()}
                        style={{ 
                            width: '100%', 
                            maxWidth: '1200px',
                            height: '100%',
                            maxHeight: '800px',
                            position: 'relative',
                            background: '#1e1e2e',
                            borderRadius: '16px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        <div style={{
                            padding: '12px 20px',
                            background: 'rgba(0,0,0,0.3)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }}></div>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }}></div>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginLeft: 'auto', fontFamily: 'monospace' }}>FULLSCREEN CODE</span>
                        </div>
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '24px'
                        }}>
                            <pre style={{
                                margin: 0,
                                fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                                fontSize: '14px',
                                lineHeight: '1.6',
                                color: '#e2e8f0',
                                whiteSpace: 'pre-wrap',
                                wordWrap: 'break-word'
                            }}>
                                {fullscreenCode}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
            {/* Fullscreen Media Modal */}
            {fullscreenMedia && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onClick={() => setFullscreenMedia(null)}
                >
                    <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', gap: '12px', zIndex: 100000 }} onClick={e => e.stopPropagation()}>
                        {fullscreenMedia.type === 'image' && (
                            <>
                                <button onClick={() => setFullscreenZoom(z => Math.max(0.5, z - 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: '0.2s' }} title="Zoom Out" onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
                                <button onClick={() => setFullscreenZoom(z => Math.min(5, z + 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: '0.2s' }} title="Zoom In" onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
                                <button onClick={() => forceDownloadMedia(fullscreenMedia.src)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', textDecoration: 'none', transition: '0.2s' }} title="Download Image" onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => setFullscreenMedia(null)}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '50%',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                cursor: 'pointer',
                                transition: '0.2s'
                            }}
                            title="Close"
                            onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'} 
                            onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div 
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
                    >
                        {fullscreenMedia.type === 'image' ? (
                            <img src={fullscreenMedia.src} alt="Fullscreen Media" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', transform: `scale(${fullscreenZoom})`, transition: 'transform 0.2s ease-out' }} />
                        ) : (
                            <video src={fullscreenMedia.src} controls autoPlay style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} />
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
