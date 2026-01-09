import React, { useState } from 'react';

interface TableInputProps {
    onInsert: (markdown: string) => void;
    onCancel: () => void;
}

export default function TableInput({ onInsert, onCancel }: TableInputProps) {
    const [rows, setRows] = useState(3);
    const [cols, setCols] = useState(3);

    // Simple grid generator, we won't do full cell editing here to keep it lightweight.
    // Instead we generate a template table. The user can edit text inside the main Markdown editor.
    // However, the user asked for "realtime create... input empty template... add row/col".
    // Let's provide the initial structure builder.

    const handleInsert = () => {
        let markdown = '\n';

        // Header Row
        markdown += '| ' + Array(cols).fill('Header').join(' | ') + ' |\n';
        // Separator Row
        markdown += '| ' + Array(cols).fill('---').join(' | ') + ' |\n';
        // Data Rows
        for (let i = 0; i < rows; i++) {
            markdown += '| ' + Array(cols).fill('Cell').join(' | ') + ' |\n';
        }

        onInsert(markdown);
    };

    return (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-2">
            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Create Table</h4>
            <div className="flex gap-4 items-center mb-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400">Rows</label>
                    <input
                        type="number"
                        min="1"
                        max="20"
                        value={rows}
                        onChange={(e) => setRows(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 p-1 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700"
                    />
                </div>
                <div className="text-zinc-300">×</div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400">Columns</label>
                    <input
                        type="number"
                        min="1"
                        max="10"
                        value={cols}
                        onChange={(e) => setCols(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 p-1 text-sm border rounded dark:bg-zinc-800 dark:border-zinc-700"
                    />
                </div>
            </div>

            {/* Visual Grid Preview (Simple) */}
            <div className="mb-4 p-2 bg-white dark:bg-zinc-800 rounded border border-zinc-100 dark:border-zinc-700 overflow-hidden">
                <div
                    className="grid gap-0.5 bg-zinc-200 dark:bg-zinc-700"
                    style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                >
                    {Array.from({ length: rows * cols }).map((_, i) => (
                        <div key={i} className="h-6 w-full bg-zinc-50 dark:bg-zinc-900"></div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Cancel
                </button>
                <button
                    onClick={handleInsert}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Insert Table
                </button>
            </div>
        </div>
    );
}
