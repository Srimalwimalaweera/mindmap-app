'use client';

import { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import * as d3 from 'd3';
import NodeInputControl from './mind-map/NodeInputControl';
import TableEditorModal from './mind-map/TableEditorModal';

const transformer = new Transformer();
const GHOST_SYMBOL = '@[[ADD_NEW]]';

interface EditorProps {
    markdown: string;
    onMarkdownChange: (newMarkdown: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onSave?: () => Promise<void>;
}

interface EditingState {
    id: string;
    x: number;
    y: number;
    text: string;
    isGhost: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
    depth: number;
    mode?: 'menu' | 'input';
    template?: 'text' | 'link' | 'image' | 'code' | 'task';
}

type ViewMode = 'visual' | 'note';

export default function MindMapEditor({ markdown, onMarkdownChange, onUndo, onRedo, canUndo = false, canRedo = false, onSave }: EditorProps) {
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
    const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

    // Refs for Gestures
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [longPressProgress, setLongPressProgress] = useState<{ x: number, y: number } | null>(null);
    const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
    const animationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const holdStartPos = useRef<{ x: number, y: number, clientX: number, clientY: number } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holdNodeInfo = useRef<{ nodeId: string, payload: any } | null>(null);
    const longPressHandledRef = useRef<boolean>(false);
    const contextMenuOpenedAtRef = useRef<number>(0);

    const handleBackgroundClick = () => {
        if (Date.now() - contextMenuOpenedAtRef.current < 500) return;
        setContextMenu(null);
        setButtonContextMenu(null);
        setEmbedContextMenu(null);
    };

    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [fullscreenEmbed, setFullscreenEmbed] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    const [buttonContextMenu, setButtonContextMenu] = useState<{ x: number; y: number; nodeId: string; url: string; exactContent: string } | null>(null);
    const [embedContextMenu, setEmbedContextMenu] = useState<{ x: number; y: number; nodeId: string; embedCode: string; exactContent: string } | null>(null);

    // Onboarding State
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        // Show onboarding only if map is basically empty (just title)
        const lines = markdown.split('\n').filter(l => l.trim().length > 0);
        if (lines.length <= 1) {
            setShowOnboarding(true);
        }
    }, [markdown]); // Updated to depend on markdown to detect new load

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
                    
                    // Disable double-click to zoom so that double-tap to edit works on mobile
                    d3.select(svgElement).on('dblclick.zoom', null);

                    // 2. Load Data
                    if (markdown) {
                        const { root } = transformer.transform(markdown);

                        // DATA-LEVEL FIX and FEATURE ENHANCEMENT
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const processNode = (node: any) => {
                            // 1. Ghost Node Logic
                            if (node.content && (node.content.includes(GHOST_SYMBOL) || node.content.includes('[[ADD_NEW]]'))) {
                                node.content = '<span class="ghost-node-placeholder" style="color: #9ca3af; font-style: italic; cursor: pointer;">+ Click to add</span>';
                                node.isGhost = true;
                            } else if (node.content) {
                                // 2. Link Handling (Open in new window) & Media Thumbnails
                                // Inject target="_blank" into existing <a> tags
                                // 2. Media Handling (Lazy Load)
                                // Standard Markdown Images
                                const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
                                node.content = node.content.replace(imgRegex, (match: string, alt: string, url: string) => {
                                    return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1);">
                                        <div class="media-preview" style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                            <span style="font-size:20px;">🖼️</span>
                                            <button class="load-media-btn" data-src="${url}" data-type="image" style="padding:2px 8px; font-size:10px; cursor:pointer; background:#3b82f6; color:white; border:none; border-radius:4px;">Load Image</button>
                                        </div>
                                    </div>`;
                                });

                                // Video Tags (from NodeInputControl)
                                const videoRegex = /<video[^>]*src=["'](.*?)["'][^>]*>.*?<\/video>/g;
                                node.content = node.content.replace(videoRegex, (match: string, url: string) => {
                                    return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1);">
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
                                    const lineIndex = node.payload?.lines?.[0];
                                    const isExpanded = lineIndex !== undefined && expandedLines.has(lineIndex);

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
                        if (longPressHandledRef.current) {
                            longPressHandledRef.current = false;
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                        }
                        dismissOnboarding(); // Dismiss on any click
                        const target = event.target as Element;

                        // MEDIA LOAD BUTTON CLICK
                        if (target.classList.contains('load-media-btn')) {
                            event.preventDefault();
                            event.stopPropagation();
                            const btn = target as HTMLElement;
                            const src = btn.getAttribute('data-src');
                            const type = btn.getAttribute('data-type');
                            const container = btn.closest('.media-placeholder-container');

                            if (container && src) {
                                if (type === 'image') {
                                    container.innerHTML = `<img src="${src}" style="max-width:200px; max-height:200px; border-radius:4px; display:block;" />`;
                                } else {
                                    container.innerHTML = `<div style="width:300px;"><video src="${src}" controls autoplay style="width:100%; border-radius:4px;"></video></div>`;
                                }
                                // Trigger update to refit if size changed significantly, though d3 zoom might not auto-adjust
                                // mmRef.current.fit(); // Optional: might be too jarring
                            }
                            return;
                        }

                        // EMBED FULLSCREEN BUTTON
                        const embedFsBtn = target.closest('.embed-fullscreen-btn') as HTMLElement;
                        if (embedFsBtn) {
                            event.preventDefault();
                            event.stopPropagation();
                            const encodedEmbed = embedFsBtn.getAttribute('data-code');
                            if (encodedEmbed) {
                                setFullscreenEmbed(decodeURIComponent(encodedEmbed));
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
                                        const nodeId = dataNode.state?.id || dataNode.id || 'unknown';

                                        // Extract exact node content WITHOUT HTML stripping
                                        let exactContent = '';
                                        const startIdx = dataNode.payload?.lines?.[0];
                                        if (startIdx !== undefined) {
                                            const mdLines = markdown.split('\n');
                                            const nodeLines = getNodeContentLines(mdLines, startIdx);
                                            exactContent = nodeLines.join('\n').replace(/^(\s*[-*+]|\s*\d+\.|#+)\s+/, '');
                                        } else {
                                            exactContent = dataNode.payload?.fullContent || dataNode.content;
                                        }

                                        if (exactContent?.includes('data-category="button"')) {
                                            const urlMatch = exactContent.match(/data-url="([^"]*)"/);
                                            const url = urlMatch ? urlMatch[1] : '';
                                            setButtonContextMenu({
                                                nodeId,
                                                x: rect.left - wrapperRect.left + (rect.width / 2),
                                                y: rect.top - wrapperRect.top + (rect.height / 2),
                                                url,
                                                exactContent
                                            });
                                            return;
                                        }
                                        
                                        if (exactContent?.includes('data-category="embed"')) {
                                            const embedMatch = exactContent.match(/data-embedcode="([^"]*)"/);
                                            const embedCode = embedMatch ? decodeURIComponent(embedMatch[1]) : '';
                                            setEmbedContextMenu({
                                                nodeId,
                                                x: rect.left - wrapperRect.left + (rect.width / 2),
                                                y: rect.top - wrapperRect.top + (rect.height / 2),
                                                embedCode,
                                                exactContent
                                            });
                                            return;
                                        }

                                        setEditing({
                                            id: nodeId,
                                            x: rect.left - wrapperRect.left,
                                            y: rect.top - wrapperRect.top,
                                            text: exactContent,
                                            isGhost: false,
                                            payload: dataNode.payload || {},
                                            depth: d?.depth || dataNode.depth || 0,
                                            mode: 'input'
                                        });

                                    } else {
                                        // SINGLE CLICK detected -> EXPAND (Delayed)
                                        clickTimerRef.current = setTimeout(() => {
                                            clickTimerRef.current = null;

                                            // Toggle Expansion logic
                                            const lineIndex = dataNode.payload?.lines?.[0];
                                            if (lineIndex !== undefined) {
                                                setExpandedLines(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(lineIndex)) {
                                                        next.delete(lineIndex);
                                                    } else {
                                                        next.add(lineIndex);
                                                    }
                                                    return next;
                                                });
                                            }
                                        }, 400);
                                    }
                                }
                            }
                            return;
                        }

                        // C. Background Click
                        // NodeInputControl handles auto-save on blur, so we don't need to force close editing here
                        // unless we specifically want to cancel.
                        // But clicking background IS a "blur" event usually.

                        handleBackgroundClick();
                        setDownloadMenuOpen(false);
                    });

                    // Custom Long Press Logic (Pointer Events)
                    const clearHold = () => {
                        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
                        if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
                        holdTimerRef.current = null;
                        animationTimerRef.current = null;
                        holdStartPos.current = null;
                        setLongPressProgress(null);
                    };

                    svg.on('pointerdown', function (event: PointerEvent) {
                        longPressHandledRef.current = false;
                        if (event.pointerType !== 'touch' && event.button !== 0) return;
                        const target = event.target as Element;
                        const textEl = target.closest('text, foreignObject');
                        if (textEl && wrapperRef.current) {
                            const nodeGroup = target.closest('g.markmap-node');
                            if (nodeGroup) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const d = d3.select(nodeGroup).datum() as any;
                                const dataNode = d?.data || d;
                                const nodeId = dataNode.state?.id || dataNode.id || 'unknown';
                                
                                // Disable context menu for Root Node (Depth 0)
                                if ((d?.depth === 0) || (dataNode?.depth === 0)) {
                                    return;
                                }

                                const [bx, by] = d3.pointer(event, wrapperRef.current);
                                holdStartPos.current = { x: bx, y: by, clientX: event.clientX, clientY: event.clientY };
                                holdNodeInfo.current = { nodeId, payload: dataNode.payload || {} };
                                
                                // Delay the animation by 200ms to avoid flashes on short taps
                                animationTimerRef.current = setTimeout(() => {
                                    setLongPressProgress({ x: bx, y: by });
                                }, 200);
                                
                                holdTimerRef.current = setTimeout(() => {
                                    if (holdStartPos.current) {
                                        let adjustedX = holdStartPos.current.x;
                                        let adjustedY = holdStartPos.current.y;
                                        const menuWidth = 200;
                                        const menuHeight = 280;
                                        if (holdStartPos.current.clientX + menuWidth > window.innerWidth) adjustedX -= menuWidth;
                                        if (holdStartPos.current.clientY + menuHeight > window.innerHeight) adjustedY -= menuHeight;
                                        
                                        contextMenuOpenedAtRef.current = Date.now();
                                        setContextMenu({
                                            x: adjustedX,
                                            y: adjustedY,
                                            nodeId: holdNodeInfo.current!.nodeId,
                                            payload: holdNodeInfo.current!.payload
                                        });
                                        
                                        longPressHandledRef.current = true;
                                        clearHold();
                                        
                                        // Vibrate if supported
                                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                                            navigator.vibrate(50);
                                        }
                                    }
                                }, 600);
                            }
                        }
                    });

                    svg.on('pointermove', function (event: PointerEvent) {
                        if (holdStartPos.current) {
                            const dx = event.clientX - holdStartPos.current.clientX;
                            const dy = event.clientY - holdStartPos.current.clientY;
                            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearHold();
                        }
                    });

                    svg.on('pointerup', clearHold);
                    svg.on('pointercancel', clearHold);

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
                                const nodeId = dataNode.state?.id || dataNode.id || 'unknown';

                                // Disable context menu for Root Node (Depth 0)
                                if ((d?.depth === 0) || (dataNode?.depth === 0)) {
                                    return;
                                }

                                const [bx, by] = d3.pointer(event, wrapperRef.current);
                                
                                const menuWidth = 200;
                                const menuHeight = 280;
                                let adjustedX = bx;
                                let adjustedY = by;
                                
                                if (event.clientX + menuWidth > window.innerWidth) {
                                    adjustedX = bx - menuWidth;
                                }
                                if (event.clientY + menuHeight > window.innerHeight) {
                                    adjustedY = by - menuHeight;
                                }

                                setContextMenu({
                                    x: adjustedX,
                                    y: adjustedY,
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
    }, [viewMode, expandedLines]); // Re-run if viewMode or expandedLines changes

    // Sync Markdown
    useEffect(() => {
        if (viewMode === 'visual' && mmRef.current && markdown) {
            const { root } = transformer.transform(markdown);

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

                    // 2. Media Handling (Lazy Load) - SYNCED
                    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
                    node.content = node.content.replace(imgRegex, (match: string, alt: string, url: string) => {
                        return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1);">
                            <div class="media-preview" style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:20px;">🖼️</span>
                                <button class="load-media-btn" data-src="${url}" data-type="image" style="padding:2px 8px; font-size:10px; cursor:pointer; background:#3b82f6; color:white; border:none; border-radius:4px;">Load Image</button>
                            </div>
                        </div>`;
                    });

                    const videoRegex = /<video[^>]*src=["'](.*?)["'][^>]*>.*?<\/video>/g;
                    node.content = node.content.replace(videoRegex, (match: string, url: string) => {
                        return `<div class="media-placeholder-container" style="display:inline-block; border:1px solid #ccc; padding:4px; border-radius:4px; background:rgba(255,255,255,0.1);">
                            <div class="media-preview" style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:20px;">🎥</span>
                                <button class="load-media-btn" data-src="${url}" data-type="video" style="padding:2px 8px; font-size:10px; cursor:pointer; background:#8b5cf6; color:white; border:none; border-radius:4px;">Load Video</button>
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

                        const lineIndex = node.payload?.lines?.[0];
                        const isExpanded = lineIndex !== undefined && expandedLines.has(lineIndex);

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
    }, [markdown, viewMode, expandedLines]);



    // Helper to find the end line of a node INCLUDING its children
    const findNodeRange = (lines: string[], startLineIndex: number): { endLineIndex: number } => {
        const startLine = lines[startLineIndex];
        const headerMatch = startLine.match(/^(#+)\s/);
        const listMatch = startLine.match(/^(\s*)([-*+]|\d+\.)/);
        let endLineIndex = startLineIndex;

        for (let i = startLineIndex + 1; i < lines.length; i++) {
            const currentLine = lines[i];
            if (currentLine.trim() === '') continue; // Skip empty lines

            if (headerMatch) {
                const currentHeader = currentLine.match(/^(#+)\s/);
                if (currentHeader && currentHeader[1].length <= headerMatch[1].length) break;
                endLineIndex = i;
            } else if (listMatch) {
                if (currentLine.match(/^(#+)\s/)) break;
                const currentListMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)/);
                if (currentListMatch && currentListMatch[1].length <= listMatch[1].length) break;
                endLineIndex = i;
            } else {
                break;
            }
        }
        return { endLineIndex };
    };

    // Helper to extract a node's OWN content (excluding its children)
    const getNodeContentLines = (lines: string[], startLineIndex: number): string[] => {
        const startLine = lines[startLineIndex];
        const headerMatch = startLine.match(/^(#+)\s/);
        const listMatch = startLine.match(/^(\s*)([-*+]|\d+\.)/);
        let endIdx = startLineIndex;

        for (let i = startLineIndex + 1; i < lines.length; i++) {
            const currentLine = lines[i];
            
            if (currentLine.trim() === '') {
                endIdx = i;
                continue;
            }

            if (currentLine.match(/^(#+)\s/)) break; // Any header starts a new node

            const currentListMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)/);
            if (currentListMatch) break; // Any list item (even deeper) starts a new child node in markmap

            endIdx = i;
        }
        return lines.slice(startLineIndex, endIdx + 1);
    };

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

        const lines = markdown.split('\n');

        // Determine target line index
        let rawLineIndex = editing.payload?.lines?.[0];
        if (editing.id === 'NEW_CHILD') {
            rawLineIndex = editing.payload?.parentLineIndex;
        } else if (editing.id === 'INSERT_PARENT') {
            rawLineIndex = editing.payload?.childLineIndex;
        } else if (editing.id === 'INSERT_SIBLING') {
            rawLineIndex = editing.payload?.siblingLineIndex;
        }

        const lineIndex = Number(rawLineIndex);
        if (isNaN(lineIndex)) return;

        // --- Template Wrappers ---
        let finalContent = newText;
        if (editing.template) {
            switch (editing.template) {
                case 'link':
                    finalContent = `[${newText}](https://)`;
                    break;
                case 'image':
                    finalContent = `![${newText}]()`;
                    break;
                case 'code':
                    finalContent = `\`\`\`\n${newText}\n\`\`\``;
                    break;
                case 'task':
                    finalContent = `- [ ] ${newText}`;
                    break;
                case 'text':
                default:
                    finalContent = newText;
            }
        }

        // --- Multi-line Formatting Helper ---
        const formatMultiLineContent = (prefix: string, content: string): string[] => {
            const match = prefix.match(/^(\s*)([-*+]|\d+\.)/);
            let continuationIndent = '';
            if (match) {
                continuationIndent = match[1] + ' '.repeat(match[2].length + 1);
            }
            const linesToFormat = content.split('\n');
            return linesToFormat.map((line, idx) => 
                idx === 0 ? `${prefix}${line}` : `${continuationIndent}${line}`
            );
        };

        if (editing.id === 'INSERT_PARENT') {
            const childLineIndex = lineIndex;
            const childLine = lines[childLineIndex];
            const headerMatch = childLine.match(/^(#+)\s/);
            const listMatch = childLine.match(/^(\s*)([-*+]|\d+\.)/);

            let newParentPrefix = '';
            let indentIncrement = '';

            if (headerMatch) {
                newParentPrefix = `${headerMatch[1]} `;
                indentIncrement = '#';
            } else if (listMatch) {
                newParentPrefix = `${listMatch[1]}${listMatch[2]} `;
                indentIncrement = '  ';
            } else {
                newParentPrefix = `- `;
                indentIncrement = '  ';
            }

            const { endLineIndex } = findNodeRange(lines, childLineIndex);
            for (let i = childLineIndex; i <= endLineIndex; i++) {
                const current = lines[i];
                if (headerMatch) {
                    if (current.trim().startsWith('#')) {
                        lines[i] = '#' + current;
                    }
                } else {
                    if (current.trim().length > 0) {
                        lines[i] = indentIncrement + current;
                    }
                }
            }

            const newParentLines = formatMultiLineContent(newParentPrefix, finalContent);
            lines.splice(childLineIndex, 0, ...newParentLines);

        } else if (editing.id === 'INSERT_SIBLING') {
            const siblingLine = lines[lineIndex];
            const headerMatch = siblingLine.match(/^(#+)\s/);
            const listMatch = siblingLine.match(/^(\s*)([-*+]|\d+\.)/);
            
            let newSiblingPrefix = '';
            if (headerMatch) {
                newSiblingPrefix = `${headerMatch[1]} `;
            } else if (listMatch) {
                newSiblingPrefix = `${listMatch[1]}${listMatch[2]} `;
            } else {
                newSiblingPrefix = `- `;
            }

            const newSiblingLines = formatMultiLineContent(newSiblingPrefix, finalContent);
            const { endLineIndex } = findNodeRange(lines, lineIndex);
            lines.splice(endLineIndex + 1, 0, ...newSiblingLines);

        } else if (editing.id === 'NEW_CHILD') {
            const parentLine = lines[lineIndex];
            const headerMatch = parentLine.match(/^(#+)\s/);

            let newChildPrefix = '';
            if (headerMatch) {
                const level = headerMatch[1].length;
                newChildPrefix = `${'#'.repeat(level + 1)} `;
            } else {
                const match = parentLine.match(/^(\s*)/);
                const parentIndent = match ? match[0] : '';
                const childIndent = parentIndent + '  ';
                newChildPrefix = `${childIndent}- `;
            }

            const newChildLines = formatMultiLineContent(newChildPrefix, finalContent);
            const nodeOwnContent = getNodeContentLines(lines, lineIndex);
            const insertIndex = lineIndex + nodeOwnContent.length;
            
            lines.splice(insertIndex, 0, ...newChildLines);

        } else if (editing.isGhost) {
            const originalLine = lines[lineIndex];
            const match = originalLine.match(/^(\s*)([-*+]|#+)(\s+)/);
            let indent = '';
            let marker = '-';
            let prefix = '- ';
            if (match) {
                indent = match[1];
                marker = match[2];
                prefix = `${indent}${marker} `;
            }

            const formattedLines = formatMultiLineContent(prefix, finalContent);
            lines.splice(lineIndex, 1, ...formattedLines);

            const newGhostLine = `${indent}${marker} ${GHOST_SYMBOL}`;
            lines.splice(lineIndex + formattedLines.length, 0, newGhostLine);

        } else {
            // Edit Local - Ensure entire previous block is wiped!
            const originalLine = lines[lineIndex];
            const match = originalLine.match(/^(\s*[-*+]|\s*\d+\.|#+)\s/);
            const prefix = match ? match[0] : '';
            
            const nodeOwnContent = getNodeContentLines(lines, lineIndex);
            const formattedLines = formatMultiLineContent(prefix, finalContent);
            
            lines.splice(lineIndex, nodeOwnContent.length, ...formattedLines);
        }

        onMarkdownChange(lines.join('\n'));
        setEditing(null);
    };

    const [deleteConfirmation, setDeleteConfirmation] = useState<{ count: number; startLineIndex: number } | null>(null);

    const handleDelete = () => {
        // Handle deletion from either Edit Mode or Context Menu
        const targetPayload = editing?.payload || contextMenu?.payload;
        const isGhost = editing?.isGhost || false;

        if (!targetPayload) return;
        if (isGhost) return; // Cannot delete ghost

        const lines = markdown.split('\n');
        const rawStartLineIndex = targetPayload.lines?.[0];
        if (rawStartLineIndex === undefined) return;
        const startLineIndex = Number(rawStartLineIndex);

        const { endLineIndex } = findNodeRange(lines, startLineIndex);
        const countToDelete = endLineIndex - startLineIndex + 1;

        if (countToDelete > 1) {
            // Use Custom Modal instead of window.confirm
            setDeleteConfirmation({ count: countToDelete, startLineIndex });
            setContextMenu(null); // Close context menu
            return;
        }

        // Single node deletion (immediate)
        lines.splice(startLineIndex, countToDelete);
        const newMarkdown = lines.join('\n');
        onMarkdownChange(newMarkdown);
        setEditing(null);
        setContextMenu(null);
    };

    const confirmDelete = () => {
        if (!deleteConfirmation) return;

        const lines = markdown.split('\n');
        lines.splice(deleteConfirmation.startLineIndex, deleteConfirmation.count);
        const newMarkdown = lines.join('\n');
        onMarkdownChange(newMarkdown);

        setDeleteConfirmation(null);
        setEditing(null);
    };

    const cancelDelete = () => {
        setDeleteConfirmation(null);
    };

    // Edit from Context Menu
    const handleEditFromContext = () => {
        if (!contextMenu) return;

        const lineIndices = contextMenu.payload?.lines;
        let currentText = "";

        if (lineIndices && lineIndices.length > 0) {
            const lines = markdown.split('\n');
            const startIdx = lineIndices[0];
            
            // Extract ONLY the node's own content, not its children
            const nodeLines = getNodeContentLines(lines, startIdx);

            let rawContent = nodeLines.join('\n');
            // Remove leading list/header marker from first line if present
            rawContent = rawContent.replace(/^(\s*[-*+]|\s*\d+\.|#+)\s+/, '');

            currentText = rawContent;
        } else if (contextMenu.payload?.content) {
            currentText = contextMenu.payload.content;
        }

        setEditing({
            id: contextMenu.nodeId,
            x: contextMenu.x,
            y: contextMenu.y,
            text: currentText,
            isGhost: false,
            payload: contextMenu.payload,
            depth: 0,
            mode: 'input'
        });
        setContextMenu(null);
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
        const blob = new Blob([markdown], { type: 'text/markdown' });
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
        const markdown = \`${markdown.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
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

    return (
        <div ref={wrapperRef} onContextMenu={(e) => e.preventDefault()} className="w-full h-full relative overflow-hidden bg-transparent group select-none text-white">
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
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                                    Are you sure you want to delete this node and its <span className="font-medium text-zinc-900 dark:text-zinc-200">{deleteConfirmation.count - 1} children</span>?
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
                    {/* Long Press Indicator */}
                    {longPressProgress && (
                        <div
                            className="loader"
                            style={{
                                left: longPressProgress.x,
                                top: longPressProgress.y,
                            }}
                        >
                            <div className="inner one"></div>
                            <div className="inner two"></div>
                            <div className="inner three"></div>
                        </div>
                    )}

                    {/* Context Menu */}
                    {contextMenu && (
                        <>
                            <div 
                                className="fixed inset-0 z-[9999]"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleBackgroundClick();
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleBackgroundClick();
                                }}
                            />
                            {(() => {
                                const isRootNode = contextMenu.payload?.lines?.[0] === 0 || contextMenu.payload?.depth === 0;

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
                                            payload: {
                                                parentLineIndex: contextMenu.payload?.lines?.[0],
                                                parentDepth: contextMenu.payload?.depth || 0
                                            },
                                            depth: 0,
                                            mode: 'input'
                                        });
                                        setContextMenu(null);
                                    }}
                                    className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-blue-600/20 text-blue-300 hover:text-white flex items-center justify-between group transition-colors"
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
                                                    payload: {
                                                        siblingLineIndex: contextMenu.payload?.lines?.[0],
                                                    },
                                                    depth: 0,
                                                    mode: 'input'
                                                });
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-emerald-600/20 text-emerald-300 hover:text-white flex items-center justify-between group transition-colors"
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
                                                    payload: {
                                                        childLineIndex: contextMenu.payload?.lines?.[0],
                                                    },
                                                    depth: 0,
                                                    mode: 'input'
                                                });
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-purple-600/20 text-purple-300 hover:text-white flex items-center justify-between group transition-colors"
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
                                    className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-amber-600/20 text-amber-300 hover:text-white flex items-center gap-2 group transition-colors"
                                >
                                    <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </span>
                                    Edit Node Content
                                </button>

                                <button
                                    onClick={handleDelete}
                                    className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-rose-600/20 text-rose-300 hover:text-rose-200 flex items-center gap-2 group transition-colors"
                                >
                                    <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </span>
                                    Delete Node
                                </button>
                            </div>
                        );
                    })()}
                    </>
                    )}

                    {editing && (() => {
                        const isExistingTableNode = editing.id !== 'NEW_CHILD' &&
                            editing.id !== 'INSERT_PARENT' &&
                            editing.id !== 'GHOST' &&
                            (editing.text.includes('<table') || editing.text.includes('<table>') || (editing.text.includes('|') && editing.text.includes('---')));

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

                        return (
                            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
                                <div className="pointer-events-auto">
                                    <NodeInputControl
                                        initialValue={editing.text}
                                        nodeId={editing.id}
                                        onSubmit={(val) => {
                                            handleSave(val);
                                        }}
                                        onCancel={() => setEditing(null)}
                                    />
                                </div>
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
                            value={markdown}
                            onChange={(e) => onMarkdownChange(e.target.value)}
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

            {/* Button Double Click Context Menu */}
            {buttonContextMenu && (
                <>
                    <div className="fixed inset-0 z-[9997]" onClick={() => setButtonContextMenu(null)} />
                    <div
                        className="absolute z-[9998] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl p-2 w-[180px] sm:w-[220px] flex flex-col gap-1 context-menu-enter"
                        style={{
                            left: buttonContextMenu.x,
                            top: buttonContextMenu.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    >
                        <button
                            onClick={() => {
                                window.open(buttonContextMenu.url, '_blank');
                                setButtonContextMenu(null);
                            }}
                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-blue-600/20 text-blue-300 hover:text-white flex items-center gap-2 group transition-colors"
                        >
                            <span className="p-1 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </span>
                            Click Button
                        </button>
                        <button
                            onClick={() => {
                                setEditing({
                                    id: buttonContextMenu.nodeId,
                                    x: buttonContextMenu.x,
                                    y: buttonContextMenu.y,
                                    text: buttonContextMenu.exactContent,
                                    isGhost: false,
                                    payload: {},
                                    depth: 0,
                                    mode: 'input'
                                });
                                setButtonContextMenu(null);
                            }}
                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-amber-600/20 text-amber-300 hover:text-white flex items-center gap-2 group transition-colors"
                        >
                            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </span>
                            Edit Node
                        </button>
                    </div>
                </>
            )}

            {/* Embed Double Click Context Menu */}
            {embedContextMenu && (
                <>
                    <div className="fixed inset-0 z-[9997]" onClick={() => setEmbedContextMenu(null)} />
                    <div
                        className="absolute z-[9998] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl p-2 w-[200px] sm:w-[240px] flex flex-col gap-1 context-menu-enter"
                        style={{
                            left: embedContextMenu.x,
                            top: embedContextMenu.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    >
                        <button
                            onClick={() => {
                                const match = embedContextMenu.embedCode.match(/src="([^"]+)"/);
                                if (match) {
                                    window.open(match[1], '_blank');
                                } else {
                                    alert("No URL found in this embed.");
                                }
                                setEmbedContextMenu(null);
                            }}
                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-emerald-600/20 text-emerald-300 hover:text-white flex items-center gap-2 group transition-colors"
                        >
                            <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </span>
                            Open in New Window
                        </button>
                        <button
                            onClick={() => {
                                setFullscreenEmbed(embedContextMenu.embedCode);
                                setEmbedContextMenu(null);
                            }}
                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-blue-600/20 text-blue-300 hover:text-white flex items-center gap-2 group transition-colors"
                        >
                            <span className="p-1 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                            </span>
                            Show Here
                        </button>
                        <button
                            onClick={() => {
                                setEditing({
                                    id: embedContextMenu.nodeId,
                                    x: embedContextMenu.x,
                                    y: embedContextMenu.y,
                                    text: embedContextMenu.exactContent,
                                    isGhost: false,
                                    payload: {},
                                    depth: 0,
                                    mode: 'input'
                                });
                                setEmbedContextMenu(null);
                            }}
                            className="w-full text-left px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-medium rounded-xl hover:bg-amber-600/20 text-amber-300 hover:text-white flex items-center gap-2 group transition-colors"
                        >
                            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </span>
                            Edit Node
                        </button>
                    </div>
                </>
            )}

            {/* Fullscreen Embed Modal */}
            {fullscreenEmbed && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px'
                    }}
                    onClick={() => setFullscreenEmbed(null)}
                >
                    <button
                        onClick={() => setFullscreenEmbed(null)}
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
                            transition: '0.2s',
                            zIndex: 100000
                        }}
                        onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'}
                        onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    
                    <div 
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '90vw',
                            height: '80vh',
                            maxWidth: '1400px',
                            background: '#0f172a',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: fullscreenEmbed }} />
                    </div>
                </div>
            )}
        </div >
    );
}
