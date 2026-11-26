'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Check, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
    Palette, Type, Grid, Plus, ZoomIn, ZoomOut, RotateCcw,
    Combine, Split, Upload, Scissors, Copy, ClipboardPaste, Eraser, Trash2
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

function colToLetter(col: number): string {
    let letter = '';
    let temp = col;
    while (temp >= 0) {
        letter = String.fromCharCode(65 + (temp % 26)) + letter;
        temp = Math.floor(temp / 26) - 1;
    }
    return letter;
}

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
    
    // Selection state
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
    const [selectionRange, setSelectionRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const [editModeCell, setEditModeCell] = useState<{ r: number; c: number } | null>(null);

    const [zoom, setZoom] = useState(1);
    
    // Fixed popups
    const [showColorPicker, setShowColorPicker] = useState<{ type: 'text' | 'bg', x: number, y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ type: 'row' | 'col' | 'cell', index: number, r?: number, c?: number, x: number, y: number } | null>(null);
    const [longPressProgress, setLongPressProgress] = useState<{ x: number, y: number } | null>(null);

    // Clipboard
    const [clipboard, setClipboard] = useState<{ type: 'cells', data: CellData[][] } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastTapRef = useRef<{ time: number, r: number, c: number } | null>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const longPressAnimationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const longPressHandledRef = useRef<boolean>(false);

    const handleTouchStart = (e: React.TouchEvent, type: 'row' | 'col' | 'cell', r: number, c: number) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        
        longPressHandledRef.current = false;
        
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        if (longPressAnimationTimerRef.current) clearTimeout(longPressAnimationTimerRef.current);
        
        longPressAnimationTimerRef.current = setTimeout(() => {
            setLongPressProgress({ x, y });
        }, 200); // Small delay to prevent animation on quick taps
        
        longPressTimerRef.current = setTimeout(() => {
            longPressHandledRef.current = true;
            setLongPressProgress(null);
            
            if (type === 'row') {
                setContextMenu({ type: 'row', index: r, x, y });
            } else if (type === 'col') {
                setContextMenu({ type: 'col', index: c, x, y });
            } else if (type === 'cell') {
                if (!isCellSelected(r, c)) {
                    setSelectedCell({ r, c });
                    setSelectionRange(null);
                }
                setContextMenu({ type: 'cell', index: 0, r, c, x, y });
            }
        }, 600); // 600ms long press threshold
    };

    const handleTouchMove = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (longPressAnimationTimerRef.current) {
            clearTimeout(longPressAnimationTimerRef.current);
            longPressAnimationTimerRef.current = null;
        }
        setLongPressProgress(null);
    };

    const clearLongPress = (e?: React.TouchEvent) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (longPressAnimationTimerRef.current) {
            clearTimeout(longPressAnimationTimerRef.current);
            longPressAnimationTimerRef.current = null;
        }
        setLongPressProgress(null);
        
        // If the long press already triggered the menu, prevent the default touchend behavior
        // (which simulates a mouse click and immediately closes the popup overlay)
        if (longPressHandledRef.current && e) {
            if (e.cancelable) e.preventDefault();
        }
    };

    const handleCellTouchEnd = (e: React.TouchEvent, r: number, c: number) => {
        const wasHandled = longPressHandledRef.current;
        clearLongPress(e);
        if (wasHandled) {
            return;
        }
        
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        
        if (lastTapRef.current && lastTapRef.current.r === r && lastTapRef.current.c === c && now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
            handleDoubleClick(r, c);
            lastTapRef.current = null;
        } else {
            lastTapRef.current = { time: now, r, c };
        }
    };

    useEffect(() => {
        if (!isOpen) return;

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
            const lines = cleanInitialData.trim().split('\n').filter(l => l.includes('|') && !l.includes('---'));
            if (lines.length > 0) {
                const parsedGrid: CellData[][] = lines.map(line => {
                    const cells = line.split('|').map(c => decodeHtmlEntities(c.trim())).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                    return cells.map(c => ({ content: c, style: { align: 'left' } }));
                });
                setGrid(parsedGrid);
                setRows(parsedGrid.length);
                setCols(parsedGrid[0]?.length || initialCols);
                return;
            }
        }

        const newGrid: CellData[][] = Array.from({ length: initialRows }, () =>
            Array.from({ length: initialCols }, () => ({ content: '', style: { align: 'left' } }))
        );
        setGrid(newGrid);
        setRows(initialRows);
        setCols(initialCols);
        setSelectedCell({ r: 0, c: 0 });
    }, [isOpen, initialRows, initialCols, initialData]);

    useEffect(() => {
        if (!isOpen || grid.length === 0) return;
        try {
            localStorage.setItem('mindmap_active_table_draft', JSON.stringify(grid));
        } catch (e) {
            console.error("LocalStorage save error", e);
        }
    }, [grid, isOpen]);

    // Global click listener to close popups
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('.color-picker-popup') || (e.target as HTMLElement).closest('.context-menu-popup')) return;
            setShowColorPicker(null);
            setContextMenu(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input on edit mode
    useEffect(() => {
        if (editModeCell && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editModeCell]);

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
                newGrid[r][c].style = { ...newGrid[r][c].style, ...stylePatch };
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

    // --- Cell Selection & Mouse Events ---
    const handleMouseDown = (r: number, c: number) => {
        if (editModeCell && editModeCell.r === r && editModeCell.c === c) return; // Ignore if already editing
        setEditModeCell(null);
        setSelectedCell({ r, c });
        setSelectionRange({ r1: r, c1: c, r2: r, c2: c });
        setIsSelecting(true);
    };

    const handleMouseEnter = (r: number, c: number) => {
        if (isSelecting && selectionRange) {
            setSelectionRange({ ...selectionRange, r2: r, c2: c });
        }
    };

    const handleRowMouseDown = (r: number) => {
        setEditModeCell(null);
        setSelectedCell({ r, c: 0 });
        setSelectionRange({ r1: r, c1: 0, r2: r, c2: cols - 1 });
        setIsSelecting(true);
    };

    const handleRowMouseEnter = (r: number) => {
        if (isSelecting && selectionRange) {
            // Keep the column range full
            setSelectionRange({ ...selectionRange, r2: r, c2: cols - 1 });
        }
    };

    const handleColMouseDown = (c: number) => {
        setEditModeCell(null);
        setSelectedCell({ r: 0, c });
        setSelectionRange({ r1: 0, c1: c, r2: rows - 1, c2: c });
        setIsSelecting(true);
    };

    const handleColMouseEnter = (c: number) => {
        if (isSelecting && selectionRange) {
            // Keep the row range full
            setSelectionRange({ ...selectionRange, r2: rows - 1, c2: c });
        }
    };

    const handleMouseUp = () => {
        setIsSelecting(false);
        setIsDraggingSelection(false);
    };

    const handleSelectionHandleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDraggingSelection(true);
    };

    const handleSelectionHandleTouchMove = (e: React.TouchEvent) => {
        if (!isDraggingSelection || !selectionRange) return;
        e.stopPropagation();
        // Prevent default only if event is cancelable to stop scrolling
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (element) {
            const target = element.closest('td[data-row][data-col], th[data-row], th[data-col]');
            if (target) {
                const rStr = target.getAttribute('data-row');
                const cStr = target.getAttribute('data-col');
                const r = rStr ? parseInt(rStr, 10) : -1;
                const c = cStr ? parseInt(cStr, 10) : -1;
                
                if (r >= 0 && c >= 0) {
                    // Dragging over cells
                    setSelectionRange({ ...selectionRange, r2: r, c2: c });
                } else if (r >= 0) {
                    // Dragging over row headers
                    setSelectionRange({ ...selectionRange, r2: r, c2: cols - 1 });
                } else if (c >= 0) {
                    // Dragging over col headers
                    setSelectionRange({ ...selectionRange, r1: 0, r2: rows - 1, c2: c });
                }
            }
        }
    };

    const handleSelectionHandleTouchEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsDraggingSelection(false);
    };

    const handleDoubleClick = (r: number, c: number) => {
        setEditModeCell({ r, c });
        setSelectedCell({ r, c });
        setSelectionRange(null);
    };

    const isCellSelected = (r: number, c: number) => {
        if (selectionRange) {
            const minR = Math.min(selectionRange.r1, selectionRange.r2);
            const maxR = Math.max(selectionRange.r1, selectionRange.r2);
            const minC = Math.min(selectionRange.c1, selectionRange.c2);
            const maxC = Math.max(selectionRange.c1, selectionRange.c2);
            return r >= minR && r <= maxR && c >= minC && c <= maxC;
        }
        return selectedCell?.r === r && selectedCell?.c === c;
    };

    // --- Row/Col Operations ---
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

    const insertRow = (index: number, above: boolean) => {
        const insertIndex = above ? index : index + 1;
        const newRow: CellData[] = Array.from({ length: cols }, () => ({ content: '', style: { align: 'left' } }));
        const newGrid = [...grid];
        newGrid.splice(insertIndex, 0, newRow);
        setGrid(newGrid);
        setRows(rows + 1);
        setContextMenu(null);
    };

    const insertCol = (index: number, left: boolean) => {
        const insertIndex = left ? index : index + 1;
        const newGrid = grid.map(row => {
            const newRow = [...row];
            newRow.splice(insertIndex, 0, { content: '', style: { align: 'left' } });
            return newRow;
        });
        setGrid(newGrid);
        setCols(cols + 1);
        setContextMenu(null);
    };

    const deleteRow = (index: number) => {
        if (rows <= 1) return;
        const newGrid = grid.filter((_, i) => i !== index);
        setGrid(newGrid);
        setRows(rows - 1);
        setContextMenu(null);
    };

    const deleteCol = (index: number) => {
        if (cols <= 1) return;
        const newGrid = grid.map(row => row.filter((_, i) => i !== index));
        setGrid(newGrid);
        setCols(cols - 1);
        setContextMenu(null);
    };

    const clearRow = (index: number) => {
        const newGrid = [...grid];
        newGrid[index] = newGrid[index].map(c => ({ ...c, content: '' }));
        setGrid(newGrid);
        setContextMenu(null);
    };

    const clearCol = (index: number) => {
        const newGrid = grid.map(row => {
            const newRow = [...row];
            newRow[index] = { ...newRow[index], content: '' };
            return newRow;
        });
        setGrid(newGrid);
        setContextMenu(null);
    };

    // --- Clipboard Operations ---
    const getSelectedSubGrid = () => {
        if (!selectionRange) {
            if (selectedCell) {
                return {
                    subGrid: [[{ ...grid[selectedCell.r][selectedCell.c] }]],
                    minR: selectedCell.r,
                    minC: selectedCell.c,
                    maxR: selectedCell.r,
                    maxC: selectedCell.c,
                };
            }
            return null;
        }
        const { r1, c1, r2, c2 } = selectionRange;
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);

        const subGrid: CellData[][] = [];
        for (let r = minR; r <= maxR; r++) {
            const row: CellData[] = [];
            for (let c = minC; c <= maxC; c++) {
                row.push({ ...grid[r][c] });
            }
            subGrid.push(row);
        }
        return { subGrid, minR, minC, maxR, maxC };
    };

    const copySelected = () => {
        const data = getSelectedSubGrid();
        if (data) {
            setClipboard({ type: 'cells', data: data.subGrid });
            setContextMenu(null);
        }
    };

    const cutSelected = () => {
        const data = getSelectedSubGrid();
        if (data) {
            setClipboard({ type: 'cells', data: data.subGrid });
            clearSelected();
            setContextMenu(null);
        }
    };

    const pasteSelected = () => {
        if (!clipboard || !selectedCell) return;
        const startR = selectedCell.r;
        const startC = selectedCell.c;
        const newGrid = grid.map(row => [...row.map(c => ({ ...c }))]);

        clipboard.data.forEach((row, dr) => {
            row.forEach((cell, dc) => {
                const targetR = startR + dr;
                const targetC = startC + dc;
                if (targetR < rows && targetC < cols) {
                    newGrid[targetR][targetC] = { ...cell };
                }
            });
        });
        setGrid(newGrid);
        setContextMenu(null);
    };

    const clearSelected = () => {
        const data = getSelectedSubGrid();
        if (!data) return;
        const newGrid = grid.map(row => [...row]);
        for (let r = data.minR; r <= data.maxR; r++) {
            for (let c = data.minC; c <= data.maxC; c++) {
                newGrid[r][c].content = '';
            }
        }
        setGrid(newGrid);
        setContextMenu(null);
    };

    // --- Merging ---
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

    // --- Context Menus ---
    const handleRowContextMenu = (e: React.MouseEvent, r: number) => {
        e.preventDefault();
        setContextMenu({ type: 'row', index: r, x: e.clientX, y: e.clientY });
    };

    const handleColContextMenu = (e: React.MouseEvent, c: number) => {
        e.preventDefault();
        setContextMenu({ type: 'col', index: c, x: e.clientX, y: e.clientY });
    };

    const handleCellContextMenu = (e: React.MouseEvent, r: number, c: number) => {
        e.preventDefault();
        if (!isCellSelected(r, c)) {
            setSelectedCell({ r, c });
            setSelectionRange(null);
        }
        setContextMenu({ type: 'cell', index: 0, r, c, x: e.clientX, y: e.clientY });
    };

    // --- Color Picker Event ---
    const openColorPicker = (e: React.MouseEvent, type: 'text' | 'bg') => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setShowColorPicker({ type, x: rect.left, y: rect.bottom + 8 });
    };

    // --- CSV Import ---
    const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) {
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length > 0) {
                    const parsedGrid: CellData[][] = lines.map(line => {
                        // Basic CSV split, ignores commas inside quotes
                        const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
                        return cells.map(c => ({ content: c, style: { align: 'left' } }));
                    });
                    
                    // Normalize columns
                    const maxCols = Math.max(...parsedGrid.map(row => row.length));
                    const normalizedGrid = parsedGrid.map(row => {
                        const newRow = [...row];
                        while(newRow.length < maxCols) newRow.push({ content: '', style: { align: 'left' } });
                        return newRow;
                    });

                    setGrid(normalizedGrid);
                    setRows(normalizedGrid.length);
                    setCols(maxCols);
                }
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveTable = () => {
        let rawTableHtml = '<table style="border-collapse:collapse; width:100%; min-width: 100%;">';
        grid.forEach((row, rIdx) => {
            rawTableHtml += '<tr>';
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

                rawTableHtml += `<${tag}${rs}${cs} style="${styleStr}">${cell.content || '&nbsp;'}</${tag}>`;
            });
            rawTableHtml += '</tr>';
        });
        rawTableHtml += '</table>';

        const isScrollY = grid.length > 20;
        const isScrollX = (grid[0]?.length || 0) > 6;
        
        // Fullscreen view payload (takes 100% width/height of the modal)
        const fullscreenHtml = `
<div style="width: 100%; height: 100%; display: flex; flex-direction: column;">
  <div style="background: rgba(0,0,0,0.3); padding: 12px 20px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
    <div style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f56;"></div>
    <div style="width: 12px; height: 12px; border-radius: 50%; background: #ffbd2e;"></div>
    <div style="width: 12px; height: 12px; border-radius: 50%; background: #27c93f;"></div>
    <span style="color: rgba(255,255,255,0.5); font-size: 12px; margin-left: auto; font-family: monospace;">FULLSCREEN SPREADSHEET</span>
  </div>
  <div class="table-scroll-container custom-scrollbar" style="flex: 1; overflow: auto; padding: 16px;">
    ${rawTableHtml}
  </div>
</div>`.trim();

        const encodedFullscreen = encodeURIComponent(fullscreenHtml);
        
        // Inline node view payload (limited size)
        let finalHtml = `
<div class="table-node-container" style="background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; min-width: 250px; max-width: ${isScrollX ? '600px' : 'max-content'}; text-align: left; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5); position: relative;" data-category="table">
  <div style="background: rgba(0,0,0,0.2); padding: 8px 12px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ff5f56; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #ffbd2e; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <div style="width: 10px; height: 10px; border-radius: 50%; background: #27c93f; box-shadow: inset 0 0 4px rgba(0,0,0,0.2);"></div>
    <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: auto; font-family: monospace; letter-spacing: 0.5px;">SPREADSHEET</span>
  </div>
  <div class="table-scroll-container custom-scrollbar" style="max-height: ${isScrollY ? '400px' : 'auto'}; overflow-y: ${isScrollY ? 'auto' : 'hidden'}; overflow-x: ${isScrollX ? 'auto' : 'hidden'}; padding: 4px;" onwheel="event.stopPropagation()">
    ${rawTableHtml}
  </div>
  <button class="embed-fullscreen-btn" data-code="${encodedFullscreen}" title="Full Screen" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 6px; color: rgba(255,255,255,0.8); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.color='#fff'; this.style.background='rgba(0,0,0,0.8)'" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.background='rgba(0,0,0,0.6)'">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
  </button>
</div>`.trim();

        onSubmit(finalHtml);
        onClose();
    };

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#ffffff', '#000000', '#94a3b8', '#64748b'];
    const bgColors = ['#1e293b', '#0f172a', '#1e3a5f', '#064e3b', '#78350f', '#701a75', '#312e81', '#18181b', 'transparent'];

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none">
            <div className="bg-slate-900 text-white rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.8)] border border-slate-700/80 w-[98vw] sm:w-[95vw] max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10 relative">

                {/* HEADER TOOLBAR */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-800/90 border-b border-slate-700/70 gap-3 shrink-0">
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl hidden sm:flex">
                                <Grid size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-white">Spreadsheet Editor</h3>
                                <p className="text-[10px] text-slate-400 hidden sm:block">Right-click headers for options. Double click cell to edit.</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-700 sm:hidden">
                            <X size={20} />
                        </button>
                    </div>

                    {/* FORMATTING TOOLBAR */}
                    <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/60 w-full sm:w-auto overflow-x-auto no-scrollbar shrink-0">
                        <button onClick={() => applyStyle({ bold: !activeStyle.bold })} className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${activeStyle.bold ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`} title="Bold"><Bold size={15} /></button>
                        <button onClick={() => applyStyle({ italic: !activeStyle.italic })} className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${activeStyle.italic ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`} title="Italic"><Italic size={15} /></button>
                        
                        <div className="w-[1px] h-5 bg-slate-700 mx-1 shrink-0" />
                        
                        <button onClick={() => applyStyle({ align: 'left' })} className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${activeStyle.align === 'left' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`} title="Align Left"><AlignLeft size={15} /></button>
                        <button onClick={() => applyStyle({ align: 'center' })} className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${activeStyle.align === 'center' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`} title="Align Center"><AlignCenter size={15} /></button>
                        <button onClick={() => applyStyle({ align: 'right' })} className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${activeStyle.align === 'right' ? 'bg-amber-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`} title="Align Right"><AlignRight size={15} /></button>
                        
                        <div className="w-[1px] h-5 bg-slate-700 mx-1 shrink-0" />
                        
                        <button onClick={(e) => openColorPicker(e, 'text')} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center shrink-0" title="Text Color">
                            <Type size={15} style={{ color: activeStyle.color || '#ffffff' }} />
                        </button>
                        <button onClick={(e) => openColorPicker(e, 'bg')} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center shrink-0" title="Cell Background Color">
                            <Palette size={15} style={{ color: activeStyle.bg || '#38bdf8' }} />
                        </button>
                        
                        <div className="w-[1px] h-5 bg-slate-700 mx-1 shrink-0" />
                        
                        <button onClick={mergeSelectedCells} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center shrink-0" title="Merge Cells"><Combine size={15} /></button>
                        <button onClick={unmergeSelectedCells} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center shrink-0" title="Unmerge Cells"><Split size={15} /></button>

                        <div className="w-[1px] h-5 bg-slate-700 mx-1 shrink-0" />
                        
                        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-1 shrink-0" title="Import CSV">
                            <Upload size={15} />
                            <span className="text-[10px] hidden sm:inline font-semibold">CSV</span>
                        </button>
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCSVImport} className="hidden" />
                    </div>

                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 hidden sm:block shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* SPREADSHEET CANVAS GRID AREA */}
                <div 
                    ref={tableContainerRef}
                    className="flex-1 overflow-auto bg-slate-950 custom-scrollbar relative flex items-start select-none"
                    onMouseLeave={handleMouseUp}
                    onMouseUp={handleMouseUp}
                >
                    <div className="transition-transform duration-150 origin-top-left flex" style={{ transform: `scale(${zoom})`, minWidth: 'max-content' }}>
                        
                        {/* The Table */}
                        <table className="border-collapse bg-slate-900 shadow-2xl table-fixed select-none" style={{ borderSpacing: 0 }}>
                            <thead>
                                <tr>
                                    {/* Top-Left Corner */}
                                    <th className="sticky top-0 left-0 z-30 bg-slate-800/95 backdrop-blur border border-slate-700 w-10 h-8 shadow-[1px_1px_0_rgba(255,255,255,0.05)]"></th>
                                    
                                    {/* Column Headers (A, B, C...) */}
                                    {Array.from({ length: cols }).map((_, c) => {
                                        const isFullColSelection = selectionRange 
                                            ? selectionRange.r1 === 0 && selectionRange.r2 === rows - 1
                                            : false;
                                        const isBottomRightCol = isFullColSelection && selectionRange && c === Math.max(selectionRange.c1, selectionRange.c2);
                                        const isColSelected = selectionRange
                                            ? c >= Math.min(selectionRange.c1, selectionRange.c2) && c <= Math.max(selectionRange.c1, selectionRange.c2)
                                            : selectedCell?.c === c;
                                        
                                        return (
                                        <th 
                                            key={c} 
                                            data-col={c}
                                            onContextMenu={(e) => handleColContextMenu(e, c)}
                                            onTouchStart={(e) => handleTouchStart(e, 'col', 0, c)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={clearLongPress}
                                            onTouchCancel={clearLongPress}
                                            onMouseDown={() => handleColMouseDown(c)}
                                            onMouseEnter={() => handleColMouseEnter(c)}
                                            className={`sticky top-0 backdrop-blur h-8 min-w-[100px] text-[11px] font-semibold transition-colors cursor-context-menu shadow-[0_1px_0_rgba(255,255,255,0.05)] select-none relative border border-slate-700
                                                ${isBottomRightCol ? 'z-[50]' : 'z-20'}
                                                ${isColSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/95 text-slate-400 hover:bg-slate-700'}`}
                                        >
                                            {colToLetter(c)}
                                            
                                            {/* Col Selection Drag Handle */}
                                            <div
                                                className={`absolute top-1/2 -translate-y-1/2 -right-[6px] w-4 h-4 bg-amber-500 rounded-full border-2 border-slate-900 shadow-md cursor-ew-resize transition-all duration-150
                                                    ${isBottomRightCol ? 'opacity-100 z-[60] scale-100 pointer-events-auto' : 'opacity-0 -z-10 scale-50 pointer-events-none'}
                                                    ${isDraggingSelection && isBottomRightCol ? 'scale-125 ring-4 ring-amber-500/40' : ''}
                                                `}
                                                style={{ touchAction: 'none' }}
                                                onTouchStart={handleSelectionHandleTouchStart}
                                                onTouchMove={handleSelectionHandleTouchMove}
                                                onTouchEnd={handleSelectionHandleTouchEnd}
                                                onTouchCancel={handleSelectionHandleTouchEnd}
                                                onMouseDown={(e) => { e.stopPropagation(); setIsDraggingSelection(true); setIsSelecting(true); }}
                                            />
                                        </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {grid.map((row, r) => {
                                    const isFullRowSelection = selectionRange 
                                        ? selectionRange.c1 === 0 && selectionRange.c2 === cols - 1
                                        : false;
                                    const isBottomRightRow = isFullRowSelection && selectionRange && r === Math.max(selectionRange.r1, selectionRange.r2);
                                    const isRowSelected = selectionRange
                                        ? r >= Math.min(selectionRange.r1, selectionRange.r2) && r <= Math.max(selectionRange.r1, selectionRange.r2)
                                        : selectedCell?.r === r;
                                    
                                    return (
                                    <tr key={r}>
                                        {/* Row Header (1, 2, 3...) */}
                                        <th 
                                            data-row={r}
                                            onContextMenu={(e) => handleRowContextMenu(e, r)}
                                            onTouchStart={(e) => handleTouchStart(e, 'row', r, 0)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={clearLongPress}
                                            onTouchCancel={clearLongPress}
                                            onMouseDown={() => handleRowMouseDown(r)}
                                            onMouseEnter={() => handleRowMouseEnter(r)}
                                            className={`sticky left-0 backdrop-blur w-10 text-[11px] font-semibold transition-colors cursor-context-menu shadow-[1px_0_0_rgba(255,255,255,0.05)] select-none relative border border-slate-700
                                                ${isBottomRightRow ? '!z-[50]' : 'z-10'}
                                                ${isRowSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/95 text-slate-400 hover:bg-slate-700'}`}
                                        >
                                            {r + 1}
                                            
                                            {/* Row Selection Drag Handle */}
                                            <div
                                                className={`absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-slate-900 shadow-md cursor-ns-resize transition-all duration-150
                                                    ${isBottomRightRow ? 'opacity-100 z-[60] scale-100 pointer-events-auto' : 'opacity-0 -z-10 scale-50 pointer-events-none'}
                                                    ${isDraggingSelection && isBottomRightRow ? 'scale-125 ring-4 ring-amber-500/40' : ''}
                                                `}
                                                style={{ touchAction: 'none' }}
                                                onTouchStart={handleSelectionHandleTouchStart}
                                                onTouchMove={handleSelectionHandleTouchMove}
                                                onTouchEnd={handleSelectionHandleTouchEnd}
                                                onTouchCancel={handleSelectionHandleTouchEnd}
                                                onMouseDown={(e) => { e.stopPropagation(); setIsDraggingSelection(true); setIsSelecting(true); }}
                                            />
                                        </th>
                                        
                                        {/* Cells */}
                                        {row.map((cell, c) => {
                                            if (cell.hidden) return null;
                                            
                                            const isSelected = isCellSelected(r, c);
                                            const isEditing = editModeCell?.r === r && editModeCell?.c === c;
                                            
                                            const isFullColSelection = selectionRange ? selectionRange.r1 === 0 && selectionRange.r2 === rows - 1 : false;
                                            
                                            const isBottomRightSelected = selectionRange
                                                ? r === Math.max(selectionRange.r1, selectionRange.r2) && c === Math.max(selectionRange.c1, selectionRange.c2)
                                                : selectedCell?.r === r && selectedCell?.c === c;

                                            // Hide cell handle if we're rendering a row/col header handle
                                            const showCellHandle = isSelected && isBottomRightSelected && !isEditing && !isFullRowSelection && !isFullColSelection;

                                            return (
                                                <td
                                                    key={c}
                                                    data-row={r}
                                                    data-col={c}
                                                    rowSpan={cell.rowSpan || 1}
                                                    colSpan={cell.colSpan || 1}
                                                    onMouseDown={() => handleMouseDown(r, c)}
                                                    onMouseEnter={() => handleMouseEnter(r, c)}
                                                    onDoubleClick={() => handleDoubleClick(r, c)}
                                                    onTouchStart={(e) => handleTouchStart(e, 'cell', r, c)}
                                                    onTouchMove={handleTouchMove}
                                                    onTouchEnd={(e) => handleCellTouchEnd(e, r, c)}
                                                    onTouchCancel={clearLongPress}
                                                    onContextMenu={(e) => handleCellContextMenu(e, r, c)}
                                                    className={`border border-slate-700/80 p-0 relative transition-colors min-w-[100px] h-[36px] cursor-default
                                                        ${isBottomRightSelected ? '!z-[40]' : (isSelected ? '!z-10' : 'z-0')}
                                                        ${isSelected ? 'ring-2 ring-amber-400 ring-inset bg-amber-500/10' : ''}
                                                    `}
                                                    style={{
                                                        backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                                                    }}
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            ref={inputRef}
                                                            type="text"
                                                            value={cell.content}
                                                            onChange={e => updateCellContent(r, c, e.target.value)}
                                                            onBlur={() => setEditModeCell(null)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === 'Escape') {
                                                                    setEditModeCell(null);
                                                                }
                                                            }}
                                                            className="w-full h-full px-2 py-1 bg-slate-800 text-white outline-none text-sm font-sans"
                                                            style={{
                                                                fontWeight: cell.style.bold ? 'bold' : 'normal',
                                                                fontStyle: cell.style.italic ? 'italic' : 'normal',
                                                                color: cell.style.color || '#f8fafc',
                                                                fontSize: cell.style.size || '14px',
                                                                textAlign: cell.style.align || 'left',
                                                            }}
                                                        />
                                                    ) : (
                                                        <div 
                                                            className="w-full h-full px-2 py-1 text-sm font-sans truncate pointer-events-none"
                                                            style={{
                                                                fontWeight: cell.style.bold ? 'bold' : 'normal',
                                                                fontStyle: cell.style.italic ? 'italic' : 'normal',
                                                                color: cell.style.color || '#f8fafc',
                                                                fontSize: cell.style.size || '14px',
                                                                textAlign: cell.style.align || 'left',
                                                                lineHeight: '26px'
                                                            }}
                                                        >
                                                            {cell.content}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Selection Drag Handle */}
                                                    <div
                                                        className={`absolute -bottom-[6px] -right-[6px] w-4 h-4 bg-amber-500 rounded-full border-2 border-slate-900 shadow-md cursor-se-resize transition-all duration-150
                                                            ${showCellHandle ? 'opacity-100 z-[60] scale-100 pointer-events-auto' : 'opacity-0 -z-10 scale-50 pointer-events-none'}
                                                            ${isDraggingSelection && showCellHandle ? 'scale-125 ring-4 ring-amber-500/40' : ''}
                                                        `}
                                                        style={{ touchAction: 'none' }}
                                                        onTouchStart={handleSelectionHandleTouchStart}
                                                        onTouchMove={handleSelectionHandleTouchMove}
                                                        onTouchEnd={handleSelectionHandleTouchEnd}
                                                        onTouchCancel={handleSelectionHandleTouchEnd}
                                                        onMouseDown={(e) => { e.stopPropagation(); setIsDraggingSelection(true); setIsSelecting(true); }}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Floating Add Column Button */}
                        <div className="flex flex-col justify-center px-4 w-16 group">
                            <button 
                                onClick={addCol} 
                                className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-amber-500 text-slate-400 hover:text-white border border-slate-700 flex items-center justify-center shadow-lg transition-all opacity-50 group-hover:opacity-100"
                                title="Add Column"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Floating Add Row Button (Below Table Area inside scroll) */}
                <div className="w-full flex justify-center py-4 bg-slate-950 group">
                     <button 
                        onClick={addRow} 
                        className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-amber-500 text-slate-400 hover:text-white border border-slate-700 flex items-center justify-center shadow-lg transition-all opacity-50 group-hover:opacity-100"
                        title="Add Row"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {/* FOOTER TOOLBAR */}
                <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-slate-800/90 border-t border-slate-700/70 gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="p-1 text-slate-400 hover:text-white"><ZoomOut size={16} /></button>
                        <input type="range" min="0.5" max="1.5" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="w-20 sm:w-24 accent-amber-500" />
                        <button onClick={() => setZoom(Math.min(1.5, zoom + 0.1))} className="p-1 text-slate-400 hover:text-white"><ZoomIn size={16} /></button>
                        <span className="text-xs text-slate-400 ml-1">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(1)} className="p-1 text-slate-400 hover:text-white ml-2"><RotateCcw size={14} /></button>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors">Cancel</button>
                        <button onClick={handleSaveTable} className="flex items-center justify-center gap-2 px-5 py-2 w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95">
                            <Check size={16} /> Save Table
                        </button>
                    </div>
                </div>

                {/* --- FLOATING POPUPS (Z-INDEX SUPER HIGH) --- */}

                {/* Long Press Indicator */}
                {longPressProgress && (
                    <div
                        className="loader z-[10020]"
                        style={{
                            left: longPressProgress.x,
                            top: longPressProgress.y,
                            position: 'fixed'
                        }}
                    >
                        <div className="inner one"></div>
                        <div className="inner two"></div>
                        <div className="inner three"></div>
                    </div>
                )}

                {/* Color Picker Popup */}
                {showColorPicker && (
                    <div className="fixed inset-0 z-[10010]" onClick={() => setShowColorPicker(null)}>
                        <div 
                            className="absolute bg-slate-800 p-2.5 rounded-xl border border-slate-600 shadow-2xl grid grid-cols-5 gap-2 animate-in zoom-in-95 duration-100 color-picker-popup"
                            style={{ top: showColorPicker.y, left: showColorPicker.x }}
                            onClick={e => e.stopPropagation()}
                        >
                            {(showColorPicker.type === 'text' ? colors : bgColors).map(c => (
                                <button
                                    key={c}
                                    onClick={() => { applyStyle({ [showColorPicker.type === 'text' ? 'color' : 'bg']: c === 'transparent' ? undefined : c }); setShowColorPicker(null); }}
                                    className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform shadow-inner flex items-center justify-center text-[10px]"
                                    style={{ backgroundColor: c }}
                                    title={c}
                                >
                                    {c === 'transparent' ? '❌' : ''}
                                </button>
                            ))}
                            <label
                                className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform shadow-inner flex items-center justify-center cursor-pointer relative overflow-hidden"
                                style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                                title="Custom Color"
                            >
                                <input
                                    type="color"
                                    className="absolute -inset-2 opacity-0 w-10 h-10 cursor-pointer"
                                    onChange={(e) => {
                                        applyStyle({ [showColorPicker.type === 'text' ? 'color' : 'bg']: e.target.value });
                                        setShowColorPicker(null);
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                )}

                {/* Context Menu Popup */}
                {contextMenu && (
                    <div className="fixed inset-0 z-[10010]" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}>
                        <div 
                            className="absolute bg-slate-800/95 backdrop-blur border border-slate-600 shadow-2xl rounded-xl w-48 py-1 flex flex-col text-sm text-slate-200 animate-in fade-in zoom-in-95 duration-100 context-menu-popup"
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 border-b border-slate-700/50 mb-1 capitalize">
                                {contextMenu.type} Options
                            </div>
                            
                            {contextMenu.type === 'cell' && (
                                <>
                                    <button onClick={copySelected} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Copy size={14}/> Copy Cells</button>
                                    <button onClick={cutSelected} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Scissors size={14}/> Cut Cells</button>
                                    <button onClick={pasteSelected} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left" disabled={!clipboard}><ClipboardPaste size={14}/> Paste Cells</button>
                                    <button onClick={clearSelected} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-red-400 hover:text-red-300"><Eraser size={14}/> Clear Contents</button>
                                </>
                            )}
                            
                            {contextMenu.type === 'row' && (
                                <>
                                    <button onClick={() => insertRow(contextMenu.index, true)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Plus size={14}/> Insert Row Above</button>
                                    <button onClick={() => insertRow(contextMenu.index, false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Plus size={14}/> Insert Row Below</button>
                                    <div className="h-px bg-slate-700/50 my-1"/>
                                    <button onClick={() => clearRow(contextMenu.index)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-amber-400"><Eraser size={14}/> Clear Row</button>
                                    <button onClick={() => deleteRow(contextMenu.index)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-red-400"><Trash2 size={14}/> Delete Row</button>
                                </>
                            )}

                            {contextMenu.type === 'col' && (
                                <>
                                    <button onClick={() => insertCol(contextMenu.index, true)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Plus size={14}/> Insert Col Left</button>
                                    <button onClick={() => insertCol(contextMenu.index, false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left"><Plus size={14}/> Insert Col Right</button>
                                    <div className="h-px bg-slate-700/50 my-1"/>
                                    <button onClick={() => clearCol(contextMenu.index)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-amber-400"><Eraser size={14}/> Clear Column</button>
                                    <button onClick={() => deleteCol(contextMenu.index)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 w-full text-left text-red-400"><Trash2 size={14}/> Delete Column</button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
