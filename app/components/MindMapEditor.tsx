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
                        if (editingRef.current?.mode === 'menu') {
                            setEditing(null);
                        }
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
                                const nodeId = dataNode.state?.id || dataNode.id || 'unknown';

                                // Disable context menu for Root Node (Depth 0)
                                if ((d?.depth === 0) || (dataNode?.depth === 0)) {
                                    return;
                                }

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



    // Helper to find the full range of a node including its children
    const findNodeRange = (lines: string[], startLineIndex: number): { endLineIndex: number } => {
        const startLine = lines[startLineIndex];
        const headerMatch = startLine.match(/^(#+)\s/);
        const listMatch = startLine.match(/^(\s*)([-*+]|\d+\.)/);
        let endLineIndex = startLineIndex;

        for (let i = startLineIndex + 1; i < lines.length; i++) {
            const currentLine = lines[i];
            if (headerMatch) {
                const currentHeader = currentLine.match(/^(#+)\s/);
                if (currentHeader) {
                    if (currentHeader[1].length <= headerMatch[1].length) break;
                }
                endLineIndex = i;
            } else if (listMatch) {
                if (currentLine.match(/^(#+)\s/)) break;
                const currentListMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)/);
                if (currentListMatch) {
                    if (currentListMatch[1].length <= listMatch[1].length) break;
                }
                endLineIndex = i;
            } else {
                break;
            }
        }
        return { endLineIndex };
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
        }

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

        if (editing.id === 'INSERT_PARENT') {
            // Logic: Insert New Parent Above Selected Node
            const childLineIndex = lineIndex;
            const childLine = lines[childLineIndex];

            // 1. Identify Child Indentation/Level
            const headerMatch = childLine.match(/^(#+)\s/);
            const listMatch = childLine.match(/^(\s*)([-*+]|\d+\.)/);

            let newParentLine = '';
            let indentIncrement = '';

            if (headerMatch) {
                // Child is Header -> Parent takes current level, Child deepens
                newParentLine = `${headerMatch[1]} ${finalContent}`;
                indentIncrement = '#';
            } else if (listMatch) {
                // Child is List -> Parent takes current indent, Child indents further
                const indent = listMatch[1];
                const marker = listMatch[2]; // e.g. '-', '1.'
                newParentLine = `${indent}${marker} ${finalContent}`;
                indentIncrement = '  '; // Standard 2-space indent
            } else {
                // Fallback
                newParentLine = `- ${finalContent}`;
                indentIncrement = '  ';
            }

            // 2. Find Range of Child (and its descendants) to Indent
            const { endLineIndex } = findNodeRange(lines, childLineIndex);

            // 3. Indent the Child Block
            for (let i = childLineIndex; i <= endLineIndex; i++) {
                const current = lines[i];
                if (headerMatch) {
                    // Determine if this line is a header that needs indentation
                    // We only indent headers that are "part" of this block. 
                    // Since findNodeRange stops at equal/higher level, everything in range is deeper or same.
                    // ACTUALLY: For markdown headers, deeper means MORE #.
                    if (current.trim().startsWith('#')) {
                        lines[i] = '#' + current;
                    }
                } else {
                    // For lists, prepend spaces to everything (preserve relative structure)
                    // But we must be careful not to break multi-line content if any
                    if (current.trim().length > 0) {
                        lines[i] = indentIncrement + current;
                    }
                }
            }

            // 4. Insert Parent ABOVE child
            lines.splice(childLineIndex, 0, newParentLine);

        } else if (editing.id === 'NEW_CHILD') {
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
        <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-transparent group select-none text-white">
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
                                            // We need to capture the indentation/level of the child to replicate it for the parent
                                        },
                                        depth: 0,
                                        mode: 'input'
                                    });
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                Add Main Node
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
                                onClick={(e) => {
                                    e.stopPropagation();
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
                            {downloadMenuOpen && (
                                <div className="absolute bottom-full right-0 mb-2 min-w-[180px] bg-zinc-900 rounded-lg shadow-xl border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col z-[50]">
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
            </div >
        </div >
    );
}
