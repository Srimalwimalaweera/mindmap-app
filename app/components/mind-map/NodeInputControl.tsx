'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Bold, Italic, Underline, Strikethrough, Highlighter,
    Link as LinkIcon, CheckSquare, Code, List, Table as TableIcon,
    Image as ImageIcon, Video, X, Check, MonitorPlay, Film,
    Maximize2, MoreHorizontal, MousePointerClick, Plus
} from 'lucide-react';

interface NodeInputControlProps {
    initialValue: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    nodeId: string;
}

type InputMode = 'text' | 'link' | 'list' | 'table' | 'media' | 'code';

export default function NodeInputControl({ initialValue, onSubmit, onCancel }: NodeInputControlProps) {
    // Parsing initial value for Task/List Mode
    // We support "Block List Mode" where multiple lines can be detected as a list.
    // Enhanced to support HTML Lists for better Markmap rendering inside single node.

    // Check for HTML List wrapper
    const htmlListMatch = initialValue.match(/^<(ul|ol)([\s\S]*)<\/\1>/);
    let isHtmlList = !!htmlListMatch;
    let htmlListType: 'bullet' | 'ordered' = htmlListMatch?.[1] === 'ol' ? 'ordered' : 'bullet';
    let cleanText = initialValue;

    if (isHtmlList && htmlListMatch) {
        // Extract LI items to Markdown for editing
        const inner = htmlListMatch[2];
        // Regex to find <li>content</li>
        const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);

        // Convert back to Markdown lines with markers for "Explicit Editing"
        if (htmlListType === 'ordered') {
            cleanText = items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        } else {
            cleanText = items.map(item => `- ${item}`).join('\n');
        }
    }

    const lines = cleanText.split('\n');
    const firstLine = lines[0] || '';

    // Regex
    const taskRegex = /^-\s\[( |x)\]\s/;
    const listRegex = /^(-\s|\d+\.\s)/;

    // Detect mode based on first line
    const taskMatch = firstLine.match(taskRegex);
    const listMatch = firstLine.match(listRegex);

    const initialIsTask = !!taskMatch;
    // Only detect markdown list if NOT html list (or if html parsing failed but looked like markdown)
    const initialIsList = isHtmlList || (!!listMatch && !initialIsTask);
    const initialListType = isHtmlList ? htmlListType : (listMatch ? (listMatch[1].startsWith('1') ? 'ordered' : 'bullet') : 'bullet');

    const initialChecked = taskMatch ? taskMatch[1] === 'x' : false;

    // NO Stripping! We want "Explicit Mode" for editing.
    // The user sees "- Item 1" and hits Enter to get "- Item 2".

    const [value, setValue] = useState(cleanText);
    const [isTask, setIsTask] = useState(initialIsTask);
    const [isChecked, setIsChecked] = useState(initialChecked);

    // List State
    const [isList, setIsList] = useState(initialIsList);
    const [listType, setListType] = useState<'bullet' | 'ordered'>(initialListType as 'bullet' | 'ordered');

    const [mode, setMode] = useState<InputMode>('text');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Combine for Submit
    const getFinalValue = (val: string) => {
        const lines = val.split('\n').filter(l => l.trim() !== '');

        if (isTask) {
            // Basic Markdown Task List
            return val;
        }

        if (isList) {
            // Output HTML Lists to keep it in ONE node
            const openTag = listType === 'ordered' ? '<ol>' : '<ul>';
            const closeTag = listType === 'ordered' ? '</ol>' : '</ul>';

            // Convert Markdown lines to HTML LIs
            const listItems = lines.map(l => {
                // Remove marker if present
                let content = l.replace(/^(-\s|\d+\.\s)/, '');
                return `<li>${content}</li>`;
            }).join('');

            // If empty, return just value? No, return formatted block.
            if (lines.length === 0) return val;

            return `${openTag}${listItems}${closeTag}`;
        }
        return val;
    };

    const handleSubmit = (val: string) => {
        onSubmit(getFinalValue(val));
    };

    // Toggle Handlers
    const toggleTask = () => {
        if (isList) setIsList(false); // Mutually exclusive
        setIsTask(!isTask);
    };

    const toggleList = () => {
        if (isTask) setIsTask(false); // Mutually exclusive

        const textarea = textareaRef.current;
        if (!textarea) return;

        const currentVal = textarea.value; // OR use value state if sync is guaranteed
        const lines = currentVal.split('\n');

        let newLines = [...lines];
        let newType: 'bullet' | 'ordered' = 'bullet';

        if (isList) {
            // Cycle: Bullet -> Ordered -> Off
            if (listType === 'bullet') {
                // Change to Ordered
                newType = 'ordered';
                setListType('ordered');
                // Replace "- " with "1. ", "2. ", etc.
                newLines = lines.map((line, i) => {
                    return line.replace(/^-\s/, `${i + 1}. `);
                });
            } else {
                // Turn Off
                setIsList(false);
                // Strip all markers
                newLines = lines.map(line => {
                    // Match start of line: whitespace, marker (- * + 1. 1)), whitespace
                    return line.replace(/^(\s*)([-*+]|\d+[\.\)])\s+/, '$1');
                });
            }
        } else {
            // Turn On (Bullet default)
            setIsList(true);
            setListType('bullet');
            // Add "- " to all lines that don't have it?
            newLines = lines.map(line => {
                // If already has marker, keep it
                if (line.match(/^(\s*)([-*+]|\d+[\.\)])\s+/)) return line;
                return `- ${line}`;
            });
        }

        const newValue = newLines.join('\n');
        setValue(newValue);

        // Focus back
        setTimeout(() => textarea.focus(), 0);
    };

    // --- Rich Text Handlers ---
    const wrapText = (wrapper: string, endWrapper?: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        if (!selectedText) return;

        const before = text.substring(0, start);
        const after = text.substring(end);
        const ew = endWrapper || wrapper;

        const newValue = `${before}${wrapper}${selectedText}${ew}${after}`;
        setValue(newValue);

        // Restore selection
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
        }, 0);
    };

    // --- Sub-Components (Inline for simplicity given scope) ---

    // 1. Link Mode
    const LinkInput = () => {
        const [url, setUrl] = useState('');
        const [text, setText] = useState('');

        return (
            <div className="flex flex-col gap-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <input
                    type="text"
                    placeholder="URL (https://...)"
                    className="w-full p-1.5 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    autoFocus
                />
                <input
                    type="text"
                    placeholder="Link Text (Optional)"
                    className="w-full p-1.5 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    value={text}
                    onChange={e => setText(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-1">
                    <button onClick={() => setMode('text')} className="px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded">Cancel</button>
                    <button
                        onClick={() => {
                            if (!url) return;
                            const linkMd = `[${text || url}](${url})`;
                            setValue(prev => prev ? `${prev} ${linkMd}` : linkMd);
                            setMode('text');
                        }}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Add Link
                    </button>
                </div>
            </div>
        );
    };

    // 2. Table Mode
    const TableInput = () => {
        const [rows, setRows] = useState(2);
        const [cols, setCols] = useState(2);

        return (
            <div className="flex flex-col gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-500">Rows</label>
                        <input
                            type="number" min="1" max="10"
                            value={rows} onChange={e => setRows(Number(e.target.value))}
                            className="w-16 p-1 text-sm border rounded bg-white dark:bg-zinc-900 dark:text-white"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-500">Columns</label>
                        <input
                            type="number" min="1" max="10"
                            value={cols} onChange={e => setCols(Number(e.target.value))}
                            className="w-16 p-1 text-sm border rounded bg-white dark:bg-zinc-900 dark:text-white"
                        />
                    </div>
                </div>

                {/* Mini Preview Grid */}
                <div className="grid gap-0.5 bg-zinc-300 dark:bg-zinc-600 p-0.5 rounded" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {Array.from({ length: rows * cols }).map((_, i) => (
                        <div key={i} className="bg-white dark:bg-zinc-800 h-4 w-6 rounded-[1px]" />
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={() => setMode('text')} className="px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded">Cancel</button>
                    <button
                        onClick={() => {
                            // Generate Markdown Table
                            let md = '\n';
                            // Header
                            md += `| ${Array(cols).fill('Header').join(' | ')} |\n`;
                            // Separator
                            md += `| ${Array(cols).fill('---').join(' | ')} |\n`;
                            // Rows
                            for (let i = 0; i < rows; i++) {
                                md += `| ${Array(cols).fill('Cell').join(' | ')} |\n`;
                            }
                            setValue(prev => prev + md);
                            setMode('text');
                        }}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Insert Table
                    </button>
                </div>
            </div>
        );
    };

    // 3. Media Mode
    const MediaInput = () => {
        const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');
        const [mediaUrl, setMediaUrl] = useState('');
        const fileInputRef = useRef<HTMLInputElement>(null);

        const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // Size validation
            // Image: 4MB, Video: 15MB
            const isVideo = file.type.startsWith('video/');
            const maxSize = isVideo ? 15 * 1024 * 1024 : 4 * 1024 * 1024;

            if (file.size > maxSize) {
                alert(`File too large. Max ${isVideo ? '15MB' : '4MB'}`);
                return;
            }

            // Create Object URL
            const objUrl = URL.createObjectURL(file);
            insertMedia(objUrl, isVideo);
        };

        const insertMedia = (url: string, isVideo: boolean) => {
            const md = isVideo
                ? `\n<video controls src="${url}" width="300"></video>`
                : `![](${url})`; // Standard MD image
            setValue(prev => prev + md);
            setMode('text');
        };

        return (
            <div className="flex flex-col gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700 pb-2">
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`text-xs px-2 py-1 rounded ${activeTab === 'upload' ? 'bg-zinc-200 dark:bg-zinc-700 font-medium' : 'text-zinc-500'}`}
                    >
                        Upload
                    </button>
                    <button
                        onClick={() => setActiveTab('link')}
                        className={`text-xs px-2 py-1 rounded ${activeTab === 'link' ? 'bg-zinc-200 dark:bg-zinc-700 font-medium' : 'text-zinc-500'}`}
                    >
                        Link
                    </button>
                </div>

                {activeTab === 'upload' ? (
                    <div
                        className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept="image/*,video/*"
                            onChange={handleFileUpload}
                        />
                        <div className="text-zinc-400 mb-1"><Film size={20} /></div>
                        <span className="text-xs text-zinc-500">Click to upload Image/Video</span>
                        <span className="text-[10px] text-zinc-400 mt-1">Img &lt;4MB, Vid &lt;15MB</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <input
                            type="text"
                            placeholder="Media URL"
                            className="w-full p-1.5 text-sm rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                            value={mediaUrl}
                            onChange={e => setMediaUrl(e.target.value)}
                        />
                        <button
                            onClick={() => {
                                if (!mediaUrl) return;
                                const isVideo = mediaUrl.match(/\.(mp4|webm|mov)$/i);
                                insertMedia(mediaUrl, !!isVideo);
                            }}
                            className="self-end px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Add Media
                        </button>
                    </div>
                )}

                <button onClick={() => setMode('text')} onMouseDown={e => e.preventDefault()} className="text-xs text-zinc-500 hover:text-zinc-700 self-start mt-1">Cancel</button>
            </div>
        );
    };

    // 5. Code Mode (Rich Popup)
    const CodeInput = () => {
        const [code, setCode] = useState('');

        return (
            <div className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 w-[300px]">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Inline Code</span>
                    <Code size={14} className="text-zinc-400" />
                </div>
                <textarea
                    className="w-full h-24 p-2 text-sm font-mono bg-zinc-900 text-green-400 rounded border border-zinc-700 outline-none resize-none placeholder-zinc-600"
                    placeholder="const foo = 'bar';"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setMode('text')} className="px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded">Cancel</button>
                    <button
                        onClick={() => {
                            if (!code.trim()) return;
                            const newVal = `\`${code}\` `; // Inline code
                            setValue(prev => prev ? prev + newVal : newVal);
                            setMode('text');
                        }}
                        className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
                    >
                        Insert Code
                    </button>
                </div>
            </div>
        );
    };

    // 4. List Mode (Simplified Popover)
    const ListInput = () => {
        return (
            <div className="grid grid-cols-3 gap-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 w-[200px]">
                {[
                    { label: 'Bullet', char: '- ' },
                    { label: 'Number', char: '1. ' },
                    { label: 'Check', char: '- [ ] ' },
                    { label: 'Star', char: '* ' },
                ].map(item => (
                    <button
                        key={item.label}
                        onClick={() => {
                            setValue(prev => (prev ? prev + '\n' : '') + item.char);
                            setMode('text');
                            setTimeout(() => {
                                textareaRef.current?.focus();
                            }, 50);
                        }}
                        className="text-xs p-2 bg-white dark:bg-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-zinc-200 dark:border-zinc-600 rounded flex flex-col items-center gap-1"
                    >
                        <span className="font-mono">{item.char.trim()}</span>
                        <span className="text-[10px] text-zinc-500">{item.label}</span>
                    </button>
                ))}
                <button onClick={() => setMode('text')} onMouseDown={e => e.preventDefault()} className="col-span-3 text-xs text-center text-zinc-400 hover:text-zinc-600">Cancel</button>
            </div>
        );
    };

    // --- Auto-List & Smart Input Handlers ---

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
            onCancel();
            return;
        }

        if (e.key === 'Enter') {
            if (e.ctrlKey) {
                onSubmit(getFinalValue(value));
                return;
            }

            // Auto-Continue Logic (Standard Markdown)
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const text = textarea.value;

            // Get current line context
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = text.indexOf('\n', start);
            const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

            // Matches: "- ", "* ", "+ ", "1. ", "1) " with any whitespace
            const listRegex = /^(\s*)([-*+]|\d+[\.\)])\s+/;
            const match = currentLine.match(listRegex);

            if (match) {
                // If the user hit Enter on a line that consists ONLY of the marker, they probably want to exit the list.
                const marker = match[0];
                const content = currentLine.substring(marker.length).trim();

                if (!content) {
                    e.preventDefault();
                    // Remove the empty marker on current line
                    const newValue = text.substring(0, lineStart) + text.substring(lineEnd === -1 ? text.length : lineEnd + 1);
                    setValue(newValue);
                    return;
                }

                e.preventDefault();

                // Determine next marker
                let nextMarker = marker;
                // Auto-increment number
                // Capture: indent, number, separator (dot or paren)
                const numMatch = marker.match(/^(\s*)(\d+)([\.\)])(\s+)/);
                if (numMatch) {
                    const indent = numMatch[1];
                    const num = parseInt(numMatch[2], 10);
                    const sep = numMatch[3]; // . or )
                    const trailingSpace = numMatch[4];
                    nextMarker = `${indent}${num + 1}${sep}${trailingSpace}`;
                }

                // Insert "\n" + nextMarker
                const newValue = text.substring(0, start) + '\n' + nextMarker + text.substring(start);
                setValue(newValue);

                setTimeout(() => {
                    const newPos = start + 1 + nextMarker.length;
                    textarea.setSelectionRange(newPos, newPos);
                    textarea.scrollTop = textarea.scrollHeight;
                }, 0);
            }
        }
    };

    const toggleCheckbox = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const text = textarea.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', start);
        const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
        const currentLine = text.substring(lineStart, actualLineEnd);

        let newLine = currentLine;

        if (currentLine.match(/^\s*- \[ \]\s/)) {
            // Remove
            newLine = currentLine.replace(/^\s*- \[ \]\s/, '');
        } else if (currentLine.match(/^\s*- \[x\]\s/)) {
            // Remove
            newLine = currentLine.replace(/^\s*- \[x\]\s/, '');
        } else {
            // Add
            // Respect existing indent?? For now just prepend.
            newLine = `- [ ] ${currentLine}`;
        }

        const newValue = text.substring(0, lineStart) + newLine + text.substring(actualLineEnd);
        setValue(newValue);

        setTimeout(() => {
            textarea.focus();
            // Try to keep cursor relatively or at end
            textarea.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length);
        }, 0);
    };

    return (
        <div className="flex flex-col gap-1 w-[350px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-zinc-900/5">
            {/* Top Toolbar: Rich Text */}
            <div className="flex items-center gap-1 p-1 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-700/50 overflow-x-auto no-scrollbar">
                <ToolBtn icon={<Bold size={14} />} onClick={() => wrapText('**')} title="Bold" />
                <ToolBtn icon={<Italic size={14} />} onClick={() => wrapText('*')} title="Italic" />
                <ToolBtn icon={<Underline size={14} />} onClick={() => wrapText('<u>', '</u>')} title="Underline" />
                <ToolBtn icon={<Strikethrough size={14} />} onClick={() => wrapText('~~')} title="Strikethrough" />
                <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                <ToolBtn icon={<Highlighter size={14} />} onClick={() => wrapText('==')} title="Highlight" />
                <ToolBtn icon={<Code size={14} />} onClick={() => setMode('code')} active={mode === 'code'} title="Inline Code" />
            </div>

            {/* Main Content Area */}
            <div className="p-1 relative min-h-[100px] flex flex-col">
                {mode === 'text' ? (
                    <div className="flex w-full h-full">
                        {isTask && (
                            <div className="pt-2 pl-2 pr-1">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e => setIsChecked(e.target.checked)}
                                    className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                            </div>
                        )}
                        <textarea
                            ref={textareaRef}
                            className="w-full h-full min-h-[100px] p-2 bg-transparent outline-none resize-none text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-sans leading-relaxed flex-1"
                            placeholder={isTask ? "Task description..." : (isList ? "List item..." : "Type something...")}
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={() => { /* Wait for explicit Done */ }}
                            autoFocus
                        />
                    </div>
                ) : (
                    <div className="p-2">
                        {mode === 'link' && <LinkInput />}
                        {mode === 'table' && <TableInput />}
                        {mode === 'media' && <MediaInput />}
                        {mode === 'list' && <ListInput />}
                        {mode === 'code' && <CodeInput />}
                    </div>
                )}
            </div>

            {/* Footer Toolbar: Data Types & Actions */}
            <div className="flex items-center justify-between p-1.5 bg-zinc-50 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center gap-1">
                    <ToolBtn icon={<LinkIcon size={14} />} onClick={() => setMode('link')} active={mode === 'link'} title="Link" />
                    <ToolBtn
                        icon={<CheckSquare size={14} />}
                        onClick={toggleTask}
                        active={isTask}
                        title="Checkbox Mode"
                    />
                    <ToolBtn
                        icon={<List size={14} />}
                        onClick={toggleList}
                        active={isList}
                        title={isList ? `List Mode (${listType === 'bullet' ? 'Bullet' : 'Number'})` : "List Mode"}
                    />

                    <ToolBtn icon={<TableIcon size={14} />} onClick={() => setMode('table')} active={mode === 'table'} title="Table" />
                    <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <ToolBtn icon={<ImageIcon size={14} />} onClick={() => setMode('media')} active={mode === 'media'} title="Media" />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onCancel}
                        onMouseDown={e => e.preventDefault()}
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    >
                        <X size={16} />
                    </button>
                    <button
                        onClick={() => handleSubmit(value)}
                        onMouseDown={e => e.preventDefault()}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md shadow-sm transition-all"
                    >
                        <Check size={14} />
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

function ToolBtn({ icon, onClick, active, title }: { icon: React.ReactNode, onClick: () => void, active?: boolean, title?: string }) {
    return (
        <button
            onClick={onClick}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss from textarea
            title={title}
            className={`p-1.5 rounded-md transition-all ${active
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 dark:text-zinc-400'
                }`}
        >
            {icon}
        </button>
    );
}
