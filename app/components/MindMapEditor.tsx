'use client';

import { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';
import * as d3 from 'd3';

const transformer = new Transformer();

// Helper function to inject ghost nodes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectGhostNodes(node: any) {
    if (!node) return;

    if (!node.children) {
        node.children = [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.children.forEach((child: any) => injectGhostNodes(child));

    const ghostNode = {
        content: '<span class="text-gray-400 italic text-xs select-none"> + Type to add...</span>',
        children: [],
        payload: {
            isGhost: true,
            parentNode: node,
            depth: node.d + 1
        },
        state: {
            id: `ghost-${node.state?.id || Math.random()}`,
            path: `${node.state?.path || ''}.ghost`
        }
    };

    node.children.push(ghostNode);
}

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
}

export default function MindMapEditor({ markdown, onMarkdownChange }: EditorProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState<EditingState | null>(null);

    useEffect(() => {
        if (svgRef.current && !mmRef.current) {
            mmRef.current = Markmap.create(svgRef.current, {
                autoFit: true,
                zoom: true,
                pan: true,
                // Disable built-in zoom/pan if it interferes (optional, usually fine)
            });
        }
    }, []);

    useEffect(() => {
        if (mmRef.current && markdown) {
            const { root } = transformer.transform(markdown);
            injectGhostNodes(root);
            mmRef.current.setData(root);
            mmRef.current.fit();
        }
    }, [markdown]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const handleClick = (event: MouseEvent) => {
            const target = (event.target as Element).closest('g.markmap-node');
            if (!target) return;

            event.preventDefault();
            event.stopPropagation();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = d3.select(target).datum() as any;

            if (!d || !d.data) return;
            const nodeData = d.data;
            if (!nodeData.state) return;

            const wrapper = wrapperRef.current;
            if (!wrapper) return;
            const wrapperRect = wrapper.getBoundingClientRect();
            const rect = target.getBoundingClientRect();

            // Fallback check: if payload is missing, check content string
            const isGhost = !!nodeData.payload?.isGhost || (typeof nodeData.content === 'string' && nodeData.content.includes("Type to add"));

            setEditing({
                id: nodeData.state?.id || 'unknown',
                x: rect.left - wrapperRect.left,
                y: rect.top - wrapperRect.top,
                text: isGhost ? '' : (nodeData.content || ''),
                isGhost: isGhost,
                payload: nodeData.payload,
                depth: d.depth
            });
        };

        svg.addEventListener('click', handleClick, true);
        return () => svg.removeEventListener('click', handleClick, true);
    }, []);

    const handleSave = (newText: string) => {
        if (!editing) return;
        if (!newText.trim()) {
            setEditing(null);
            return;
        }

        const lines = markdown.split('\n');

        if (editing.isGhost) {
            const parent = editing.payload?.parentNode; // payload might be undefined if we relied on content check?
            // If payload is undefined, we can't find parent. 
            // We MUST ensure payload is present or reconstruct it.
            // Actually, if we relied on content string, we might not have payload reference to parent.
            // This is critical.

            if (!parent) {
                // If we don't have parent ref, we can't insert.
                // However, injectGhostNodes ALWAYS adds payload. 
                // If it was stripped, we have a bigger problem.
                // Assuming payload PRESERVED.
                console.error("Ghost node missing parent reference");
                setEditing(null);
                return;
            }

            const parentLineEnd = parent.payload?.lines?.[1] ?? lines.length;
            const indentLevel = editing.depth;

            let spaces = '';
            if (indentLevel > 1) {
                spaces = '  '.repeat(Math.max(0, indentLevel - 1));
            }

            const prefix = '- ';
            const newLine = `${spaces}${prefix}${newText}`;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const realChildren = parent.children ? parent.children.filter((c: any) => !c.payload?.isGhost) : [];
            let insertIndex = parentLineEnd;

            if (realChildren.length > 0) {
                const lastChild = realChildren[realChildren.length - 1];
                insertIndex = lastChild.payload?.lines?.[1] ?? parentLineEnd;
            } else {
                insertIndex = parent.payload?.lines?.[1] ?? lines.length;
            }

            lines.splice(insertIndex, 0, newLine);

        } else {
            // Edit existing
            // If we are editing, we need line numbers. default markmap payload has lines.
            const lineIndex = editing.payload?.lines?.[0];
            if (lineIndex !== undefined) {
                const originalLine = lines[lineIndex];
                const match = originalLine.match(/^(\s*[-*+]|\s*\d+\.|#+)\s/);
                const prefix = match ? match[0] : '';
                lines[lineIndex] = `${prefix}${newText}`;
            } else {
                console.error("Existing node missing line information");
            }
        }

        onMarkdownChange(lines.join('\n'));
        setEditing(null);
    };

    return (
        <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-white dark:bg-zinc-900 group">
            <svg ref={svgRef} className="w-full h-full" />

            {editing && (
                <div
                    style={{
                        position: 'absolute',
                        left: editing.x,
                        top: editing.y,
                        transform: 'translate(-10px, -50%)',
                        marginTop: '10px',
                        zIndex: 9999
                    }}
                >
                    <input
                        ref={(input) => {
                            if (input) {
                                // Force focus immediately on mount
                                input.focus();
                            }
                        }}
                        className="min-w-[200px] w-auto px-3 py-1 bg-white dark:bg-zinc-800 text-black dark:text-white border-2 border-blue-500 rounded shadow-2xl outline-none text-sm font-medium"
                        value={editing.text}
                        placeholder="Type idea..."
                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(editing.text);
                            if (e.key === 'Escape') setEditing(null);
                        }}
                        onBlur={() => {
                            // setEditing(null); // Keep open for debugging if needed, but usually blur closes.
                            setEditing(null);
                        }}
                    />
                </div>
            )}
        </div>
    );
}
