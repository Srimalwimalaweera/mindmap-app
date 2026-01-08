'use client';

import { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import * as d3 from 'd3';

const transformer = new Transformer();
const GHOST_SYMBOL = '@[[ADD_NEW]]';

interface EditorProps {
    markdown: string;
    onMarkdownChange: (newMarkdown: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
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

export default function MindMapEditor({ markdown, onMarkdownChange, onUndo, onRedo, canUndo = false, canRedo = false }: EditorProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const [editing, setEditing] = useState<EditingState | null>(null);
    const editingRef = useRef<EditingState | null>(null);

    // New States for Advanced Interaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; payload: any } | null>(null);
    // Track expanded lines (Visual only, resets on reload)
    const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

    // Refs for Gestures
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Ctrl+Z / Cmd+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    // Redo (Ctrl+Shift+Z)
                    e.preventDefault();
                    onRedo?.();
                } else {
                    // Undo (Ctrl+Z)
                    e.preventDefault();
                    onUndo?.();
                }
            }
            // Check for Ctrl+Y / Cmd+Y (Redo alternate)
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                onRedo?.();
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
                                node.content = node.content.replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g, '<a href="$2" target="_blank"');

                                // Check for Media URLs in the content to add thumbnails
                                const mediaMatch = node.content.match(/\.(jpeg|jpg|gif|png|mp4|webm|webp)/i);
                                if (mediaMatch) {
                                    // Append a small icon
                                    const icon = mediaMatch[0].match(/mp4|webm/i) ? '🎥' : '🖼️';
                                    node.content += ` <span style="font-size: 0.8em; margin-left: 4px;" title="Media Content">${icon}</span>`;
                                }

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
                        const target = event.target as Element;

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
                                        mode: 'menu'
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

                                        // Edit FULL content (not truncated)
                                        const fullText = dataNode.payload?.fullContent || dataNode.content.replace(/<[^>]+>/g, '');

                                        setEditing({
                                            id: nodeId,
                                            x: rect.left - wrapperRect.left,
                                            y: rect.top - wrapperRect.top,
                                            text: fullText,
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
                                        }, 250);
                                    }
                                }
                            }
                            return;
                        }

                        // C. Background Click
                        if (editingRef.current?.mode === 'menu') {
                            setEditing(null);
                        }
                        setContextMenu(null);
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
                                const nodeId = dataNode.state?.id || dataNode.id || 'unknown';

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


    const handleSave = (newText: string) => {
        if (!editing) return;

        // If ghost AND empty -> Cancel (Keep as ghost)
        if (editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        // If regular node OR NEW_CHILD AND empty -> Cancel
        if (!editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        const lines = markdown.split('\n');
        // Determine target line index
        // For NEW_CHILD, we use parentLineIndex from payload
        // For others, we use payload.lines[0]
        const rawLineIndex = editing.id === 'NEW_CHILD'
            ? editing.payload?.parentLineIndex
            : editing.payload?.lines?.[0];

        const lineIndex = Number(rawLineIndex);
        console.log('[DEBUG] Line Index Type:', typeof lineIndex, lineIndex);

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

        if (editing.id === 'NEW_CHILD') {
            const parentLineIndex = editing.payload?.parentLineIndex;
            console.log('[DEBUG] NEW_CHILD:', {
                parentLineIndex,
                lineIndex,
                editingPayload: editing.payload,
                linesLength: lines.length
            });

            // Logic: Insert New Child
            const parentLine = lines[lineIndex];
            console.log('[DEBUG] Parent Line:', parentLine);

            // Check if parent is a header
            const headerMatch = parentLine.match(/^(#+)\s/);

            let newLine = '';

            if (headerMatch) {
                // Parent is a header -> Child is a deeper header
                const level = headerMatch[1].length;
                newLine = `${'#'.repeat(level + 1)} ${finalContent}`;
            } else {
                // Parent is likely a list item
                const match = parentLine.match(/^(\s*)/);
                const parentIndent = match ? match[0] : '';
                // Child indent = parent + 2 spaces
                const childIndent = parentIndent + '  ';
                newLine = `${childIndent}- ${finalContent}`;
            }

            // Insert AFTER parent (First child)
            lines.splice(lineIndex + 1, 0, newLine);
            console.log('[DEBUG] After Splice:', lines);

        } else if (editing.isGhost) {
            // Logic: Convert Ghost -> Real
            const originalLine = lines[lineIndex];
            const match = originalLine.match(/^(\s*)([-*+]|#+)(\s+)/);
            let indent = '';
            let marker = '-';
            if (match) {
                indent = match[1];
                marker = match[2];
            }

            // Use the constructed content
            lines[lineIndex] = `${indent}${marker} ${finalContent}`;

            // Append NEW Ghost Node Sibling
            const newGhostLine = `${indent}${marker} ${GHOST_SYMBOL}`;
            lines.splice(lineIndex + 1, 0, newGhostLine);

        } else {
            // Edit Local
            const originalLine = lines[lineIndex];
            const match = originalLine.match(/^(\s*[-*+]|\s*\d+\.|#+)\s/);
            const prefix = match ? match[0] : '';
            lines[lineIndex] = `${prefix}${newText}`;
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

        // Determine how many lines to delete (Recursive Logic)
        let endLineIndex = startLineIndex;
        const startLine = lines[startLineIndex];

        // Check indentation or header level
        const headerMatch = startLine.match(/^(#+)\s/);
        const listMatch = startLine.match(/^(\s*)([-*+]|\d+\.)/);

        // Find the range of children
        for (let i = startLineIndex + 1; i < lines.length; i++) {
            const currentLine = lines[i];

            // Stop if empty line (optional, depends on flavor, usually included in block)
            // if (!currentLine.trim()) break; 

            if (headerMatch) {
                // If parent is Header -> Stop at next Header of SAME or HIGHER level (fewer #)
                const currentHeader = currentLine.match(/^(#+)\s/);
                if (currentHeader) {
                    if (currentHeader[1].length <= headerMatch[1].length) {
                        break;
                    }
                }
                // Include non-headers (list items under header) and deeper headers
                endLineIndex = i;
            } else if (listMatch) {
                // If parent is List -> Stop at next List Item of SAME or LOWER indentation
                // OR any Header (headers break lists)
                if (currentLine.match(/^(#+)\s/)) break;

                const currentListMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)/);
                if (currentListMatch) {
                    // Compare indentation lengths
                    if (currentListMatch[1].length <= listMatch[1].length) {
                        break;
                    }
                }
                // Include lines that are content of the list item (no marker, indented text)
                endLineIndex = i;
            } else {
                // Fallback for unknown line types - just delete one
                break;
            }
        }

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

        const lineIndex = contextMenu.payload?.lines?.[0];
        let currentText = "";

        if (lineIndex !== undefined) {
            const line = markdown.split('\n')[lineIndex];
            // Simple extraction (robust enough for plain text)
            // Remove list markers
            currentText = line.replace(/^(\s*[-*+]|\s*\d+\.|#+)\s+/, '');
            // Remove [ ] if task
            currentText = currentText.replace(/^\[[ x]\]\s+/, '');
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
        <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-white dark:bg-zinc-900 group select-none">
            {/* Visual Mode */}
            {viewMode === 'visual' && (
                <div className="w-full h-full animate-in fade-in duration-300">
                    <svg ref={svgRef} className="w-full h-full opacity-0 highlight-none" style={{ opacity: 1 }} />

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

                    {/* Context Menu */}
                    {contextMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                left: contextMenu.x,
                                top: contextMenu.y,
                                zIndex: 10000,
                            }}
                            className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden"
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
                                            parentDepth: contextMenu.payload?.depth || 0 // Not reliable in all parsers but useful if available
                                        },
                                        depth: 0,
                                        mode: 'input'
                                    });
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                Add Child Node
                            </button>
                            <button
                                onClick={handleEditFromContext}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                Edit Node
                            </button>
                            <button
                                onClick={handleDelete}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete
                            </button>
                        </div>
                    )}

                    {editing && (
                        <div
                            style={{
                                position: 'absolute',
                                left: editing.x,
                                top: editing.y,
                                transform: 'translate(-50%, -50%)',
                                zIndex: 9999,
                            }}
                        >
                            {editing.mode === 'menu' ? (
                                <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 p-1.5 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in zoom-in-95 duration-200">
                                    {/* Text Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '', template: 'text' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Text"
                                    >
                                        <div className="w-5 h-5 flex items-center justify-center font-serif font-bold text-zinc-700 dark:text-zinc-200">T</div>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Text</span>
                                    </button>

                                    {/* Link Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '', template: 'link' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Link"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Link</span>
                                    </button>

                                    {/* Image Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '', template: 'image' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Image"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                        </svg>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Image</span>
                                    </button>

                                    {/* Code Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '', template: 'code' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Code"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
                                            <polyline points="16 18 22 12 16 6" />
                                            <polyline points="8 6 2 12 8 18" />
                                        </svg>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Code</span>
                                    </button>

                                    {/* List/Task Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '', template: 'task' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Task"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                                            <line x1="8" y1="6" x2="21" y2="6" />
                                            <line x1="8" y1="12" x2="21" y2="12" />
                                            <line x1="8" y1="18" x2="21" y2="18" />
                                            <line x1="3" y1="6" x2="3.01" y2="6" />
                                            <line x1="3" y1="12" x2="3.01" y2="12" />
                                            <line x1="3" y1="18" x2="3.01" y2="18" />
                                        </svg>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">List</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 p-1 rounded-lg shadow-xl border border-blue-500/30">
                                    <input
                                        ref={(input) => {
                                            if (input) {
                                                // Handle cursor placement for pre-filled templates
                                                setTimeout(() => {
                                                    input.focus();
                                                }, 10);
                                            }
                                        }}
                                        className="min-w-[200px] w-auto px-3 py-1 bg-transparent text-black dark:text-white outline-none text-sm font-medium"
                                        value={editing.text}
                                        placeholder={
                                            editing.template === 'link' ? "Link Title..." :
                                                editing.template === 'image' ? "Image Alt Text..." :
                                                    editing.template === 'code' ? "Code Snippet..." :
                                                        "Type content..."
                                        }
                                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSave(editing.text);
                                            // Escape: Revert to ghost if ghost, or cancel edit if regular
                                            if (e.key === 'Escape') setEditing(null);
                                        }}
                                        onBlur={() => {
                                            // AUTO-SAVE or CANCEL logic
                                            handleSave(editing.text);
                                        }}
                                    />
                                    {!editing.isGhost && (
                                        <button
                                            onClick={() => handleDelete()}
                                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                            title="Delete Node"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M3 6h18" />
                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Note Mode */}
            {viewMode === 'note' && (
                <div className="w-full h-full flex flex-col p-8 animate-in fade-in duration-300 bg-zinc-50 dark:bg-zinc-950">
                    <div className="max-w-3xl mx-auto w-full h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                Note Editor
                            </h2>
                            <span className="text-xs text-zinc-400">Markdown Mode</span>
                        </div>

                        <textarea
                            className="flex-1 w-full bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
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
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm p-2 px-4 rounded-full shadow-2xl border border-zinc-200 dark:border-zinc-700 z-[50]">
                {viewMode === 'visual' && (
                    <div className="flex items-center gap-1 pr-3 border-r border-zinc-200 dark:border-zinc-700">
                        <div className="flex items-center gap-0.5 mr-2 pr-2 border-r border-zinc-200 dark:border-zinc-700/50">
                            <button
                                onClick={onUndo}
                                disabled={!canUndo}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
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
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="Redo (Ctrl+Shift+Z)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 7v6h-6" />
                                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                                </svg>
                            </button>
                        </div>
                        <button onClick={handleZoomOut} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors" title="Zoom Out">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>
                        <button onClick={handleFit} className="px-3 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-medium transition-colors" title="Fit to Screen">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            </svg>
                        </button>
                        <button onClick={handleZoomIn} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors" title="Zoom In">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </button>
                    </div>
                )}

                <button onClick={toggleFullscreen} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors" title="Toggle Fullscreen">
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

                <div className="flex bg-zinc-100 dark:bg-zinc-700 rounded-full p-1 relative ml-1">
                    <button
                        onClick={() => setViewMode('visual')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'visual' ? 'bg-white dark:bg-zinc-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'note' ? 'bg-white dark:bg-zinc-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Note
                    </button>
                </div>
            </div>
        </div>
    );
}
