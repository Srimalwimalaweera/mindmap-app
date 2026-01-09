import React, { useState, useRef, useEffect } from 'react';
import RichTextToolbar from './node-editor/RichTextToolbar';
import MediaInput from './node-editor/MediaInput';
import TableInput from './node-editor/TableInput';

type NodeTemplate = 'text' | 'link' | 'image' | 'code' | 'task' | 'table' | 'checkbox';

interface NodeEditorProps {
    initialText: string;
    template?: NodeTemplate;
    x: number;
    y: number;
    onSave: (text: string) => void;
    onCancel: () => void;
}

export default function NodeEditor({ initialText, template = 'text', x, y, onSave, onCancel }: NodeEditorProps) {
    const [text, setText] = useState(initialText);
    const [activeTool, setActiveTool] = useState<NodeTemplate | null>(template === 'text' ? null : template);

    // Position handling to ensure it stays on screen
    const editorRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initial Focus
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            // Set cursor to end
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
        }
    }, []);

    const handleFormat = (prefix: string, suffix: string) => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const currentText = textareaRef.current.value;

        const selection = currentText.substring(start, end);
        const newText = currentText.substring(0, start) + prefix + selection + suffix + currentText.substring(end);

        setText(newText);

        // Restore focus and selection
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
            }
        }, 0);
    };

    const handleInsert = (content: string) => {
        if (!textareaRef.current) return;
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const currentText = textareaRef.current.value;

        const newText = currentText.substring(0, start) + content + currentText.substring(end);
        setText(newText);
        setActiveTool(null); // Close tool

        // Focus back
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(start + content.length, start + content.length);
            }
        }, 0);
    };

    // --- Tool specific handlers ---

    const handleLinkClick = () => {
        // Immediate simple insertion for now, or open a mini-popover? 
        // User asked for "URL and Reference Text" input boxes.
        // We'll use a local state for this "Link Mode" if we want a custom UI, 
        // Or re-use the MediaInput style.
        // For simplicity in this huge component, let's just insert standard markdown syntax and let user type properties.
        // BUT user asked for specific UI. Let's make a simple inline UI for Link.
        setActiveTool('link');
    };

    const [linkState, setLinkState] = useState({ url: '', text: '' });

    return (
        <div
            ref={editorRef}
            className="fixed z-[9999] bg-white dark:bg-zinc-800 rounded-lg shadow-2xl border border-zinc-200 dark:border-zinc-700 w-[300px] md:w-[400px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                maxHeight: '80vh'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Top Toolbar: Rich Text */}
            <RichTextToolbar onFormat={handleFormat} />

            {/* Main Input Area */}
            <div className="p-2 relative flex-1">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSave(text);
                        }
                        if (e.key === 'Escape') onCancel();
                    }}
                    placeholder="Type node content..."
                    className="w-full min-h-[80px] bg-transparent text-zinc-800 dark:text-zinc-100 resize-y outline-none font-medium leading-relaxed"
                />
            </div>

            {/* Tool-specific Overlay Panels (Below Input) */}
            {activeTool === 'image' && (
                <MediaInput onInsert={handleInsert} onCancel={() => setActiveTool(null)} />
            )}

            {activeTool === 'table' && (
                <TableInput onInsert={handleInsert} onCancel={() => setActiveTool(null)} />
            )}

            {activeTool === 'link' && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2">
                    <div className="space-y-2">
                        <input
                            type="text"
                            placeholder="URL (https://...)"
                            className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none"
                            value={linkState.url}
                            onChange={(e) => setLinkState({ ...linkState, url: e.target.value })}
                        />
                        <input
                            type="text"
                            placeholder="Display Text"
                            className="w-full p-2 text-sm rounded bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 outline-none"
                            value={linkState.text}
                            onChange={(e) => setLinkState({ ...linkState, text: e.target.value })}
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setActiveTool(null)} className="px-3 py-1.5 text-xs">Cancel</button>
                            <button
                                onClick={() => {
                                    handleInsert(`[${linkState.text || 'Link'}](${linkState.url})`);
                                    setLinkState({ url: '', text: '' });
                                }}
                                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded"
                            >
                                Add Link
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTool === 'task' && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => handleInsert('\n- ')} className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 flex flex-col items-center gap-1">
                            <span className="text-lg">•</span>
                            <span className="text-[10px]">Bullet</span>
                        </button>
                        <button onClick={() => handleInsert('\n1. ')} className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 flex flex-col items-center gap-1">
                            <span className="text-lg">1.</span>
                            <span className="text-[10px]">Number</span>
                        </button>
                        <button onClick={() => handleInsert('\n- [ ] ')} className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 flex flex-col items-center gap-1">
                            <span className="text-lg">☑</span>
                            <span className="text-[10px]">Check</span>
                        </button>
                        <button onClick={() => handleInsert('\nI. ')} className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 flex flex-col items-center gap-1">
                            <span className="text-lg">I.</span>
                            <span className="text-[10px]">Roman</span>
                        </button>
                    </div>
                    <button onClick={() => setActiveTool(null)} className="w-full mt-2 py-1 text-xs text-center text-zinc-500 hover:text-zinc-800">Close</button>
                </div>
            )}

            {activeTool === 'code' && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2">
                    <p className="text-xs text-zinc-500 mb-2">Inline Code: Wraps text in `backticks`</p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setActiveTool(null)} className="px-3 py-1.5 text-xs">Cancel</button>
                        <button
                            onClick={() => handleFormat('`', '`')}
                            className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded"
                        >
                            Format Selection
                        </button>
                        <button
                            onClick={() => handleInsert('`code`')}
                            className="px-3 py-1.5 text-xs border border-orange-500 text-orange-500 rounded"
                        >
                            Insert Block
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Toolbar: Data Types */}
            <div className="flex items-center gap-1 p-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 overflow-x-auto no-scrollbar">
                <button
                    onClick={handleLinkClick}
                    className={`p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 ${activeTool === 'link' ? 'bg-zinc-200 dark:bg-zinc-700 text-blue-500' : ''}`}
                    title="Add Link"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </button>
                <button
                    onClick={() => setActiveTool('task')}
                    className={`p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 ${activeTool === 'task' ? 'bg-zinc-200 dark:bg-zinc-700 text-green-500' : ''}`}
                    title="Add List / Checkbox"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                </button>
                <button
                    onClick={() => setActiveTool('code')}
                    className={`p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 ${activeTool === 'code' ? 'bg-zinc-200 dark:bg-zinc-700 text-orange-500' : ''}`}
                    title="Add Code"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                </button>
                <button
                    onClick={() => setActiveTool('table')}
                    className={`p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 ${activeTool === 'table' ? 'bg-zinc-200 dark:bg-zinc-700 text-purple-500' : ''}`}
                    title="Add Table"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                </button>
                <button
                    onClick={() => setActiveTool('image')}
                    className={`p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 ${activeTool === 'image' ? 'bg-zinc-200 dark:bg-zinc-700 text-pink-500' : ''}`}
                    title="Add Media (Image/Video)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                </button>

                <div className="flex-1"></div>

                <button
                    onClick={() => onCancel()}
                    className="px-3 py-1.5 rounded text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onSave(text)}
                    className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold shadow hover:bg-blue-500"
                >
                    Save
                </button>
            </div>
        </div>
    );
}
