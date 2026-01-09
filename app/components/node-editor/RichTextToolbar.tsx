import React from 'react';

interface RichTextToolbarProps {
    onFormat: (prefix: string, suffix: string) => void;
}

export default function RichTextToolbar({ onFormat }: RichTextToolbarProps) {
    return (
        <div className="flex items-center gap-1 p-1 mb-1 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto no-scrollbar">
            <button
                onClick={() => onFormat('**', '**')}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Bold (Ctrl+B)"
            >
                <code className="font-bold">B</code>
            </button>
            <button
                onClick={() => onFormat('*', '*')}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Italic (Ctrl+I)"
            >
                <code className="italic">I</code>
            </button>
            <button
                onClick={() => onFormat('~~', '~~')}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Strikethrough"
            >
                <code className="line-through">S</code>
            </button>
            <button
                onClick={() => onFormat('==', '==')}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Highlight"
            >
                <span className="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded text-xs">H</span>
            </button>
            <button
                onClick={() => onFormat('<u>', '</u>')}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                title="Underline"
            >
                <span className="underline">U</span>
            </button>
        </div>
    );
}
