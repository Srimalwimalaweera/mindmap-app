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
}

type ViewMode = 'visual' | 'note';

export default function MindMapEditor({ markdown, onMarkdownChange }: EditorProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [editing, setEditing] = useState<EditingState | null>(null);
    // Ref to track editing state inside stale closures (D3 event listeners)
    const editingRef = useRef<EditingState | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('visual');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Keep ref synced
    useEffect(() => {
        editingRef.current = editing;
    }, [editing]);

    // --- Lifecycle Logic ---

    // Initial Load & Markdown Updates
    useEffect(() => {
        let mounted = true;
        let observer: MutationObserver | null = null;
        // eslint-disable-next-line no-undef
        let initialTimer: NodeJS.Timeout | null = null;

        if (viewMode === 'visual') {
            if (svgRef.current) {
                // Clear existing
                svgRef.current.innerHTML = '';
                // Remove any residual listeners to be safe
                d3.select(svgRef.current).on('click', null).on('.zoom', null);
            }

            requestAnimationFrame(() => {
                if (!mounted || !svgRef.current) return;

                try {
                    // 1. Create Instance
                    mmRef.current = Markmap.create(svgRef.current, {
                        autoFit: true,
                        zoom: true,
                        pan: true,
                    });

                    // 2. Load Data
                    if (markdown) {
                        const { root } = transformer.transform(markdown);

                        // DATA-LEVEL FIX: Mutate the data tree BEFORE rendering
                        // This ensures Markmap renders our custom HTML instead of the raw symbol
                        const processNode = (node: any) => {
                            if (node.content && (node.content.includes(GHOST_SYMBOL) || node.content.includes('[[ADD_NEW]]'))) {
                                // Inject HTML directly into the node data
                                node.content = '<span class="ghost-node-placeholder" style="color: #9ca3af; font-style: italic; cursor: pointer;">+ Click to add</span>';
                                // Tag it for easier identification later if needed
                                node.isGhost = true;
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
                    const svg = d3.select(svgRef.current);

                    // Remove any existing click handlers to prevent duplicates
                    svg.on('click', null); // Clear prev

                    svg.on('click', function (event) {
                        const target = event.target as Element;

                        // A. Check for Ghost Node Click
                        // We check if the target is our custom placeholder OR inside it
                        const ghostPlaceholder = target.closest('.ghost-node-placeholder');
                        if (ghostPlaceholder) {
                            event.preventDefault();
                            event.stopPropagation();

                            // Find parent group to get data
                            const nodeGroup = target.closest('g.markmap-node');
                            if (nodeGroup) {
                                const d = d3.select(nodeGroup).datum() as any;
                                const wrapper = wrapperRef.current;

                                // FALLBACK: If d.data is missing, d itself might be the data (or d.data was stripped)
                                const dataNode = d?.data || d;

                                if (wrapper && dataNode) {

                                    const wrapperRect = wrapper.getBoundingClientRect();
                                    const rect = nodeGroup.getBoundingClientRect();

                                    // Robust ID extraction
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
                                const d = d3.select(nodeGroup).datum() as any;

                                // Fallback for data access
                                const dataNode = d?.data || d;

                                // Ignore if it's actually a ghost node
                                const content = dataNode?.content || '';
                                if (content.includes('ghost-node-placeholder')) return; // Ignore ghost click overlap

                                if (wrapperRef.current && dataNode) {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    const wrapper = wrapperRef.current;
                                    const wrapperRect = wrapper.getBoundingClientRect();
                                    const rect = textEl.getBoundingClientRect();

                                    const nodeId = dataNode.state?.id || dataNode.id || 'unknown';

                                    setEditing({
                                        id: nodeId,
                                        x: rect.left - wrapperRect.left,
                                        y: rect.top - wrapperRect.top,
                                        text: dataNode.content,
                                        isGhost: false,
                                        payload: dataNode.payload || {},
                                        depth: d?.depth || dataNode.depth || 0,
                                        mode: 'input'
                                    });
                                }
                            }
                            return; // Stop here if node clicked
                        }

                        // C. Background Click (Close Menu)
                        // Note: Input blur handling is separate (via onBlur event)
                        if (editingRef.current?.mode === 'menu') {
                            setEditing(null);
                        }
                    });

                    // (Optional) Visual Reinforcement
                    const updateStyles = () => {
                        if (!svgRef.current) return;
                        const s = d3.select(svgRef.current);
                        s.selectAll('.ghost-node-placeholder').style('cursor', 'pointer');
                    };

                    // Clear any previous timer
                    if (observer) observer.disconnect();
                    if (initialTimer) clearInterval(initialTimer);
                    initialTimer = setInterval(updateStyles, 500);

                } catch (err) {
                    console.error("Markmap init error", err);
                }
            });
        }

        return () => {
            mounted = false;
            if (observer) observer.disconnect();
            if (initialTimer) clearInterval(initialTimer); // Changed to interval

            // Critical Fix for D3 Zoom Error:
            // Explicitly remove zoom listeners and clear SVG *before* unmount complete
            if (svgRef.current) {
                const svg = d3.select(svgRef.current);
                svg.on('click', null); // Remove global listener
                svg.on('.zoom', null); // Unbind zoom
                svgRef.current.innerHTML = ''; // Kill children
            }

            if (mmRef.current) {
                mmRef.current.destroy();
                mmRef.current = null;
            }
        };
    }, [viewMode]); // Re-run if viewMode changes (rendering new map)
    // IMPORTANT: We do NOT depend on `markdown` here to avoid full re-init on every keystroke.
    // The second useEffect handles data updates.

    // Sync Markdown
    useEffect(() => {
        if (viewMode === 'visual' && mmRef.current && markdown) {
            const { root } = transformer.transform(markdown);

            // Re-apply Data Transformation on updates
            const processNode = (node: any) => {
                if (node.content && (node.content.includes(GHOST_SYMBOL) || node.content.includes('[[ADD_NEW]]'))) {
                    node.content = '<span class="ghost-node-placeholder" style="color: #9ca3af; font-style: italic; cursor: pointer;">+ Click to add</span>';
                    node.isGhost = true;
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
    }, [markdown, viewMode]);


    const handleSave = (newText: string) => {
        if (!editing) return;

        // If ghost AND empty -> Cancel (Keep as ghost)
        if (editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        // If regular node AND empty -> Cancel (Don't delete, just revert edit mode)
        // User asked: "User cannot delete this node" referring to Ghost node default.
        // For regular nodes, empty input usually means "keep old" or "delete"?
        // Current logic: Cancel edit. To delete, use button.
        if (!editing.isGhost && !newText.trim()) {
            setEditing(null);
            return;
        }

        const lines = markdown.split('\n');
        const lineIndex = editing.payload?.lines?.[0];

        if (lineIndex === undefined) return;

        if (editing.isGhost) {
            // Logic: Convert Ghost -> Real
            const originalLine = lines[lineIndex];
            const match = originalLine.match(/^(\s*)([-*+]|#+)(\s+)/);
            let indent = '';
            let marker = '-';
            if (match) {
                indent = match[1];
                marker = match[2];
            }

            lines[lineIndex] = `${indent}${marker} ${newText}`;

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

    const handleDelete = () => {
        if (!editing) return;
        // Extra safety: Ghost nodes cannot be deleted via this button
        if (editing.isGhost) return;

        const lines = markdown.split('\n');
        const lineIndex = editing.payload?.lines?.[0];
        if (lineIndex === undefined) return;

        lines.splice(lineIndex, 1);
        onMarkdownChange(lines.join('\n'));
        setEditing(null);
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
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '' })}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group relative"
                                        title="Text"
                                    >
                                        <div className="w-5 h-5 flex items-center justify-center font-serif font-bold text-zinc-700 dark:text-zinc-200">T</div>
                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Text</span>
                                    </button>

                                    {/* Link Node */}
                                    <button
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '[](https://)' })}
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
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '![]()' })}
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
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '```\n\n```' })}
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
                                        onClick={() => setEditing({ ...editing, mode: 'input', text: '- [ ] ' })}
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
                                        placeholder="Type content..."
                                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSave(editing.text);
                                            // Escape: Revert to ghost if ghost, or cancel edit if regular
                                            if (e.key === 'Escape') setEditing(null);
                                        }}
                                        onBlur={() => {
                                            // AUTO-SAVE or CANCEL logic
                                            // handleSave includes logic: if empty, it cancels. if text, it saves.
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
