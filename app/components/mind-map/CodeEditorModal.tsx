import React, { useState, useEffect, useRef } from 'react';

interface CodeEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: string;
    onSubmit: (html: string) => void;
}

export default function CodeEditorModal({ isOpen, onClose, initialData, onSubmit }: CodeEditorModalProps) {
    const [code, setCode] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Extract code from HTML string if it's already a code node
            let initialCode = initialData;
            
            const extractCodeFromHTML = (html: string) => {
                if (html.includes('<div class="code-node-container"')) {
                    const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
                    if (match && match[1]) {
                        return match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    }
                } else if (html.startsWith('```')) {
                     // In case it's raw markdown
                     const lines = html.split('\n');
                     if (lines.length >= 2) {
                         lines.shift(); // remove opening ```
                         if (lines[lines.length - 1].startsWith('```')) {
                             lines.pop(); // remove closing ```
                         }
                         return lines.join('\n');
                     }
                }
                return html;
            };

            const decoded = initialData.replace(/<br>/g, '\n');
            const cleanCode = extractCodeFromHTML(decoded);
            setCode(cleanCode);

            // Focus timeout
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSave = () => {
        const safeContent = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n$/, '');
        const encodedContent = encodeURIComponent(code.replace(/\n$/, ''));
        const html = `<div class="code-node-container" style="background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; min-width: 250px; max-width: 500px; text-align: left; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); position: relative;" data-category="code">
  <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ff5f56; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ffbd2e; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #27c93f; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: auto; font-family: monospace; letter-spacing: 0.5px;">CODE</span>
    <button class="code-copy-btn" data-code="${encodedContent}" title="Copy Code" style="margin-left: 6px; background: transparent; border: none; padding: 2px; color: rgba(255,255,255,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='rgba(255,255,255,0.4)'; this.style.background='transparent'">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    </button>
  </div>
  <div class="code-scroll-container" style="max-height: 270px; overflow-y: auto; overflow-x: auto;" onwheel="event.stopPropagation()">
    <pre style="margin: 0; padding: 16px; font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace; font-size: 12px; color: #e2e8f0; white-space: pre-wrap; word-wrap: break-word; line-height: 1.5;">${safeContent}</pre>
  </div>
  <button class="code-fullscreen-btn" data-code="${encodedContent}" title="Full Screen" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.8)'" onmouseout="this.style.color='rgba(255,255,255,0.5)'; this.style.background='rgba(0,0,0,0.4)'">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
  </button>
</div>`;
        onSubmit(html);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSave();
        }
        if (e.key === 'Escape') {
            onClose();
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            setCode(val.substring(0, start) + '    ' + val.substring(end));
            // Move cursor
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 4;
            }, 0);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    };

    const linesCount = code.split('\n').length;
    const linesArr = Array.from({ length: Math.max(1, linesCount) }, (_, i) => i + 1);

    return (
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="bg-[#1e1e2e] border border-white/10 shadow-2xl rounded-2xl w-full max-w-4xl h-[70vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Traffic Lights Header */}
                <div className="bg-black/20 px-4 py-3 flex items-center gap-2 border-b border-white/5">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner cursor-pointer hover:scale-110 transition-transform" onClick={onClose} title="Close (Esc)"></div>
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner"></div>
                    <span className="text-white/40 text-xs ml-auto font-mono tracking-widest flex items-center gap-2">
                        CODE EDITOR 
                    </span>
                </div>

                {/* Editor Body */}
                <div className="flex-1 flex overflow-hidden bg-[#1e1e2e]">
                    {/* Line Numbers */}
                    <div 
                        ref={lineNumbersRef}
                        className="w-12 bg-black/10 border-r border-white/5 text-slate-600 text-[13px] md:text-sm text-right pr-3 py-4 font-mono select-none overflow-hidden fullscreen-code-container"
                        style={{ lineHeight: '1.5rem' }}
                    >
                        {linesArr.map(n => (
                            <div key={n}>{n}</div>
                        ))}
                    </div>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        className="fullscreen-code-container flex-1 bg-transparent text-[#e2e8f0] font-mono text-[13px] md:text-sm p-4 outline-none resize-none overflow-auto whitespace-pre"
                        style={{ lineHeight: '1.5rem', tabSize: 4 }}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onScroll={handleScroll}
                        spellCheck={false}
                        placeholder="Write your code here..."
                    />
                </div>

                {/* Footer Toolbar */}
                <div className="p-3 bg-black/20 border-t border-white/5 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-mono">
                        Press <kbd className="bg-white/10 px-1 rounded mx-0.5">Ctrl</kbd> + <kbd className="bg-white/10 px-1 rounded mx-0.5">Enter</kbd> to save
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={onClose}
                            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            className="px-5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
                        >
                            Save Code
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
