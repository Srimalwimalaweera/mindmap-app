'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    X, Check, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
    Palette, Type, Grid, Plus, Trash2, ZoomIn, ZoomOut, RotateCcw,
    Combine, Split, Maximize2
} from 'lucide-react';

export interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    size?: string;
    align?: 'left' | 'center' | 'right';
    bg?: string;
}

export interface CellData {
    content: string;
    style: CellStyle;
    rowSpan?: number;
    colSpan?: number;
    hidden?: boolean;
}

interface TableEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialRows?: number;
    initialCols?: number;
    initialData?: string;
    onSubmit: (tableHtml: string) => void;
}

// Decode HTML Entities (e.g. &#xd85;... -> Sinhala/Unicode Text)
const decodeHtmlEntities = (text: string): string => {
    if (!text) return '';
    return text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
};

export default function TableEditorModal({
    isOpen,
    onClose,
    initialRows = 3,
    initialCols = 3,
    initialData = '',
    onSubmit
}: TableEditorModalProps) {
    const [rows, setRows] = useState(initialRows);
    const [cols, setCols] = useState(initialCols);
    const [grid, setGrid] = useState<CellData[][]>([]);
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
    const [selectionRange, setSelectionRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [showColorPicker, setShowColorPicker] = useState<'text' | 'bg' | null>(null);

    // Initialize Grid with decoded entities & localStorage restore
    useEffect(() => {
        if (!isOpen) return;

        // Attempt to parse existing HTML table FIRST before any stripping
        if (initialData && (initialData.includes('<table>') || initialData.includes('<table'))) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(initialData, 'text/html');
                const trElements = doc.querySelectorAll('tr');
                if (trElements.length > 0) {
                    const parsedGrid: CellData[][] = [];
                    trElements.forEach((tr) => {
                        const row: CellData[] = [];
                        tr.querySelectorAll('th, td').forEach((td) => {
                            const elem = td as HTMLElement;
                            // innerText/textContent already decode entities in the browser!
                            const text = elem.innerText || elem.textContent || '';
                            row.push({
                                content: text === '\u00a0' ? '' : text,
                                style: {
                                    bold: elem.style.fontWeight === 'bold' || elem.tagName === 'TH',
                                    italic: elem.style.fontStyle === 'italic',
                                    color: elem.style.color || undefined,
                                    size: elem.style.fontSize || undefined,
                                    align: (elem.style.textAlign as any) || 'left',
                                    bg: elem.style.backgroundColor || undefined
                                },
                                rowSpan: elem.getAttribute('rowspan') ? parseInt(elem.getAttribute('rowspan')!) : 1,
                                colSpan: elem.getAttribute('colspan') ? parseInt(elem.getAttribute('colspan')!) : 1,
                            });
                        });
                        if (row.length > 0) parsedGrid.push(row);
                    });

                    if (parsedGrid.length > 0) {
                        setGrid(parsedGrid);
                        setRows(parsedGrid.length);
                        setCols(parsedGrid[0].length);
                        return;
                    }
                }
            } catch (e) {
                console.error("Error parsing HTML table", e);
            }
        }
        
        const cleanInitialData = decodeHtmlEntities(initialData);

        if (cleanInitialData && cleanInitialData.includes('|')) {
            // Markdown table parser
            const lines = cleanInitialData.trim().split('\n').filter(l => l.includes('|') && !l.includes('---'));
            if (lines.length > 0) {
                const parsedGrid: CellData[][] = lines.map(line => {
                    const cells = line.split('|').map(c => decodeHtmlEntities(c.trim())).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                    return cells.map(c => ({
                        content: c,
                        style: { align: 'left' }
                    }));
                });
                setGrid(parsedGrid);
                setRows(parsedGrid.length);
                setCols(parsedGrid[0]?.length || initialCols);
                return;
            }
        }

        // Default empty grid
        const newGrid: CellData[][] = Array.from({ length: initialRows }, () =>
            Array.from({ length: initialCols }, () => ({
                content: '',
                style: { align: 'left' }
            }))
        );
        setGrid(newGrid);
        setRows(initialRows);
        setCols(initialCols);
        setSelectedCell({ r: 0, c: 0 });
    }, [isOpen, initialRows, initialCols, initialData]);

    // Realtime LocalStorage Auto-Save
    useEffect(() => {
        if (!isOpen || grid.length === 0) return;
        try {
            localStorage.setItem('mindmap_active_table_draft', JSON.stringify(grid));
        } catch (e) {
            console.error("LocalStorage save error", e);
        }
    }, [grid, isOpen]);

    if (!isOpen) return null;

    const activeStyle: CellStyle = selectedCell && grid[selectedCell.r]?.[selectedCell.c]
        ? grid[selectedCell.r][selectedCell.c].style
        : {};

    const updateCellContent = (r: number, c: number, text: string) => {
        const newGrid = [...grid.map(row => [...row])];
        if (newGrid[r] && newGrid[r][c]) {
            newGrid[r][c].content = text;
            setGrid(newGrid);
        }
    };

    const applyStyle = (stylePatch: Partial<CellStyle>) => {
        const newGrid = grid.map(row => row.map(cell => ({ ...cell, style: { ...cell.style } })));

        const applyToCell = (r: number, c: number) => {
            if (newGrid[r] && newGrid[r][c]) {
                newGrid[r][c].style = {
                    ...newGrid[r][c].style,
                    ...stylePatch
                };
            }
        };

        if (selectionRange) {
            const { r1, c1, r2, c2 } = selectionRange;
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
                for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
                    applyToCell(r, c);
                }
            }
        } else if (selectedCell) {
            applyToCell(selectedCell.r, selectedCell.c);
        }

        setGrid(newGrid);
    };

    const addRow = () => {
        const newRow: CellData[] = Array.from({ length: cols }, () => ({ content: '', style: { align: 'left' } }));
        setGrid([...grid, newRow]);
        setRows(rows + 1);
    };

    const addCol = () => {
        const newGrid = grid.map(row => [...row, { content: '', style: { align: 'left' } as CellStyle }]);
        setGrid(newGrid);
        setCols(cols + 1);
    };

    const removeRow = () => {
        if (rows <= 1) return;
        setGrid(grid.slice(0, -1));
        setRows(rows - 1);
    };

    const removeCol = () => {
        if (cols <= 1) return;
        setGrid(grid.map(row => row.slice(0, -1)));
        setCols(cols - 1);
    };

    const mergeSelectedCells = () => {
        if (!selectionRange) return;
        const { r1, c1, r2, c2 } = selectionRange;
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);

        if (minR === maxR && minC === maxC) return;

        const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
        let mergedText = '';

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (newGrid[r][c].content) {
                    mergedText += (mergedText ? ' ' : '') + newGrid[r][c].content;
                }
                if (r === minR && c === minC) {
                    newGrid[r][c].rowSpan = maxR - minR + 1;
                    newGrid[r][c].colSpan = maxC - minC + 1;
                } else {
                    newGrid[r][c].hidden = true;
                }
            }
        }
        newGrid[minR][minC].content = mergedText;
        setGrid(newGrid);
        setSelectionRange(null);
        setSelectedCell({ r: minR, c: minC });
    };

    const unmergeSelectedCells = () => {
        if (!selectedCell) return;
        const { r, c } = selectedCell;
        const cell = grid[r]?.[c];
        if (!cell || (!cell.rowSpan && !cell.colSpan)) return;

        const rowSpan = cell.rowSpan || 1;
        const colSpan = cell.colSpan || 1;

        const newGrid = grid.map(row => row.map(c => ({ ...c })));
        for (let i = r; i < r + rowSpan; i++) {
            for (let j = c; j < c + colSpan; j++) {
                if (newGrid[i] && newGrid[i][j]) {
                    newGrid[i][j].hidden = false;
                    newGrid[i][j].rowSpan = 1;
                    newGrid[i][j].colSpan = 1;
                }
            }
        }
        setGrid(newGrid);
    };

    const handleSaveTable = () => {
        let html = '<table style="border-collapse:collapse; width:100%; border:1px solid rgba(255,255,255,0.2); margin:4px 0;">';
        grid.forEach((row, rIdx) => {
            html += '<tr>';
            row.forEach((cell, cIdx) => {
                if (cell.hidden) return;

                const tag = rIdx === 0 ? 'th' : 'td';
                let styleStr = 'padding:6px 10px; border:1px solid rgba(255,255,255,0.2); ';

                if (cell.style.bold) styleStr += 'font-weight:bold; ';
                if (cell.style.italic) styleStr += 'font-style:italic; ';
                if (cell.style.color) styleStr += `color:${cell.style.color}; `;
                if (cell.style.size) styleStr += `font-size:${cell.style.size}; `;
                if (cell.style.align) styleStr += `text-align:${cell.style.align}; `;
                if (cell.style.bg) styleStr += `background-color:${cell.style.bg}; `;

                const rs = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '';
                const cs = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';

                html += `<${tag}${rs}${cs} style="${styleStr}">${cell.content || '&nbsp;'}</${tag}>`;
            });
            html += '</tr>';
        });
        html += '</table>';

        onSubmit(html);
        onClose();
    };

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#ffffff', '#000000'];
    const bgColors = ['#1e293b', '#0f172a', '#1e3a5f', '#064e3b', '#78350f', '#701a75', '#312e81', '#18181b'];

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none">
            <div className="bg-slate-900 text-white rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.8)] border border-slate-700/80 w-[95vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden ring-1 ring-white/10">

                {/* HEADER TOOLBAR */}
                <div className="flex flex-wrap items-center justify-between p-3 bg-slate-800/90 border-b border-slate-700/70 gap-2">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                            <Grid size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-white">Visual Table Spreadsheet Editor</h3>
                            <p className="text-[11px] text-slate-400">Click cells to edit text, format styles, and add/remove rows</p>
                        </div>
                    </div>

                    {/* FORMATTING TOOLBAR */}
                    <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/60 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => applyStyle({ bold: !activeStyle.bold })}
                            className={`p-2 rounded-lg transition-colors ${activeStyle.bold ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            title="Bold"
                        >
                            <Bold size={15} />
                        </button>
                        <button
                            onClick={() => applyStyle({ italic: !activeStyle.italic })}
                            className={`p-2 rounded-lg transition-colors ${activeStyle.italic ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            title="Italic"
                        >
                            <Italic size={15} />
                        </button>

                        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

                        <button
                            onClick={() => applyStyle({ align: 'left' })}
                            className={`p-2 rounded-lg transition-colors ${activeStyle.align === 'left' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            title="Align Left"
                        >
                            <AlignLeft size={15} />
                        </button>
                        <button
                            onClick={() => applyStyle({ align: 'center' })}
                            className={`p-2 rounded-lg transition-colors ${activeStyle.align === 'center' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            title="Align Center"
                        >
                            <AlignCenter size={15} />
                        </button>
                        <button
                            onClick={() => applyStyle({ align: 'right' })}
                            className={`p-2 rounded-lg transition-colors ${activeStyle.align === 'right' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
                            title="Align Right"
                        >
                            <AlignRight size={15} />
                        </button>

                        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

                        <div className="relative">
                            <button
                                onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
                                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-1"
                                title="Text Color"
                            >
                                <Type size={15} style={{ color: activeStyle.color || '#ffffff' }} />
                            </button>
                            {showColorPicker === 'text' && (
                                <div className="absolute top-10 left-0 bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-xl grid grid-cols-4 gap-1.5 z-[100]">
                                    {colors.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { applyStyle({ color: c }); setShowColorPicker(null); }}
                                            className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setShowColorPicker(showColorPicker === 'bg' ? null : 'bg')}
                                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-1"
                                title="Cell Background Color"
                            >
                                <Palette size={15} style={{ color: activeStyle.bg || '#38bdf8' }} />
                            </button>
                            {showColorPicker === 'bg' && (
                                <div className="absolute top-10 left-0 bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-xl grid grid-cols-4 gap-1.5 z-[100]">
                                    {bgColors.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => { applyStyle({ bg: c }); setShowColorPicker(null); }}
                                            className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

                        <button
                            onClick={mergeSelectedCells}
                            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-1 text-xs"
                            title="Merge Selected Cells"
                        >
                            <Combine size={15} />
                        </button>
                        <button
                            onClick={unmergeSelectedCells}
                            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-1 text-xs"
                            title="Unmerge Cell"
                        >
                            <Split size={15} />
                        </button>

                        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

                        {/* Add/Remove Rows & Columns */}
                        <button onClick={addRow} className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-semibold text-amber-300 transition-colors">+ Row</button>
                        <button onClick={addCol} className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-semibold text-amber-300 transition-colors">+ Col</button>
                        <button onClick={removeRow} className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-300 transition-colors">- Row</button>
                        <button onClick={removeCol} className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-300 transition-colors">- Col</button>
                    </div>

                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
                        <X size={18} />
                    </button>
                </div>

                {/* SPREADSHEET CANVAS GRID AREA */}
                <div className="flex-1 overflow-auto p-6 bg-slate-950/90 custom-scrollbar flex items-start justify-center relative">
                    <div
                        className="transition-transform duration-150 origin-top"
                        style={{ transform: `scale(${zoom})` }}
                    >
                        <table className="border-collapse border border-slate-700 shadow-2xl bg-slate-900 rounded-lg overflow-hidden">
                            <tbody>
                                {grid.map((row, r) => (
                                    <tr key={r}>
                                        {row.map((cell, c) => {
                                            if (cell.hidden) return null;
                                            const isSelected = selectedCell?.r === r && selectedCell?.c === c;

                                            return (
                                                <td
                                                    key={c}
                                                    rowSpan={cell.rowSpan || 1}
                                                    colSpan={cell.colSpan || 1}
                                                    onClick={() => setSelectedCell({ r, c })}
                                                    className={`border border-slate-700/80 p-0 relative transition-colors min-w-[100px] ${isSelected ? 'ring-2 ring-amber-400 z-10' : ''
                                                        }`}
                                                    style={{
                                                        backgroundColor: cell.style.bg || (r === 0 ? '#1e293b' : 'transparent'),
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={cell.content}
                                                        onChange={e => updateCellContent(r, c, e.target.value)}
                                                        onFocus={() => setSelectedCell({ r, c })}
                                                        className="w-full h-full px-3 py-2 bg-transparent outline-none text-sm font-sans"
                                                        style={{
                                                            fontWeight: cell.style.bold ? 'bold' : 'normal',
                                                            fontStyle: cell.style.italic ? 'italic' : 'normal',
                                                            color: cell.style.color || '#f8fafc',
                                                            fontSize: cell.style.size || '14px',
                                                            textAlign: cell.style.align || 'left',
                                                        }}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FOOTER TOOLBAR */}
                <div className="flex items-center justify-between p-3 bg-slate-800/90 border-t border-slate-700/70">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="p-1 text-slate-400 hover:text-white" title="Zoom Out">
                            <ZoomOut size={16} />
                        </button>
                        <input
                            type="range" min="0.5" max="1.5" step="0.1"
                            value={zoom}
                            onChange={e => setZoom(parseFloat(e.target.value))}
                            className="w-24 accent-amber-500"
                        />
                        <button onClick={() => setZoom(Math.min(1.5, zoom + 0.1))} className="p-1 text-slate-400 hover:text-white" title="Zoom In">
                            <ZoomIn size={16} />
                        </button>
                        <span className="text-xs text-slate-400 ml-1">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(1)} className="p-1 text-slate-400 hover:text-white ml-2" title="Reset Zoom">
                            <RotateCcw size={14} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveTable}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                        >
                            <Check size={16} />
                            Save Table to Mind Map
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
