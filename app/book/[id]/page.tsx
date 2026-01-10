'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fabric } from 'fabric';
import { useAuth } from '@/app/context/AuthProvider';
import { getBook, loadBookPages, saveBookPages, updateBook, BookData } from '@/app/services/bookService';
import {
    Pencil, Type, Eraser, MousePointer2, Image as ImageIcon, Download,
    ChevronLeft, ChevronRight, Save, Ruler, Circle, Square, Minus,
    Undo, Redo, ZoomIn, ZoomOut, Maximize, FileDown, Menu, X, Check,
    Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
    Clock, Lock, ChevronDown
} from 'lucide-react';

export const runtime = 'edge';

export default function BookEditor() {
    const { id } = useParams();
    const { user, userData, settings, updateAutoSaveInterval } = useAuth();
    const router = useRouter();

    // Canvas & Book State
    const canvasEl = useRef<HTMLCanvasElement>(null);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [book, setBook] = useState<BookData | null>(null);
    const [pages, setPages] = useState<any[]>([]); // Array of Fabric JSON objects
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Tools State
    const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'text' | 'eraser' | 'shape'>('select');
    const [brushSize, setBrushSize] = useState(3);
    const [color, setColor] = useState('#000000');
    const [fillColor, setFillColor] = useState('transparent');
    const [showLeftBar, setShowLeftBar] = useState(true); // Mobile toggle

    // History
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const isUndoing = useRef(false);



    // Auto-Save State
    // Local Cache Key
    const LOCAL_CACHE_KEY = `book_cache_${id}`;

    const pagesRef = useRef(pages); // Ref to hold latest pages for interval
    const canvasRef = useRef(canvas); // Ref to hold latest canvas
    const currentPageRef = useRef(currentPage);

    // Save to Local Cache
    useEffect(() => {
        if (!canvas || !id) return;

        const handleModification = () => {
            const activeCanvas = canvas;
            if (activeCanvas) {
                const json = activeCanvas.toJSON();
                // We need to update the pagesRef or current pages to reflect this change
                // But `pages` state update triggers re-render.
                // We can construct the cache object directly.
                const currentPages = [...pagesRef.current];
                currentPages[currentPageRef.current] = json;

                localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
                    updatedAt: Date.now(),
                    pages: currentPages
                }));
            }
        };

        canvas.on('object:modified', handleModification);
        canvas.on('object:added', handleModification);
        canvas.on('object:removed', handleModification);
        canvas.on('text:changed', handleModification);
        canvas.on('path:created', handleModification);

        return () => {
            canvas.off('object:modified', handleModification);
            canvas.off('object:added', handleModification);
            canvas.off('object:removed', handleModification);
            canvas.off('text:changed', handleModification);
            canvas.off('path:created', handleModification);
        };
    }, [canvas, id]);

    // Cleanup Cache on Unmount (Optional? No, "Realtime" means it stays)
    // Cleanup Cache on Manual Save? Yes.

    // Sync Refs
    useEffect(() => { pagesRef.current = pages; }, [pages]);
    useEffect(() => { canvasRef.current = canvas; }, [canvas]);
    useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);



    const handleSave = useCallback(async () => {
        if (!user || typeof id !== 'string') return;
        setSaving(true);
        try {
            let pgs = [...pagesRef.current];
            const activeCanvas = canvasRef.current;
            if (activeCanvas) {
                pgs[currentPageRef.current] = activeCanvas.toJSON();
            }

            await saveBookPages(user.uid, id, pgs);
            const now = new Date();
            // Removed explicit updatedAt push
            // await updateBook(id, { updatedAt: now });
            setBook(prev => prev ? { ...prev, updatedAt: now } : null); // Update local state only

            // Clear Cache after successful DB Save
            localStorage.removeItem(LOCAL_CACHE_KEY);
            alert("Saved to Database!");
        } catch (e) {
            console.error("Save failed", e);
            alert("Save failed");
        } finally {
            setSaving(false);
        }
    }, [user, id]);




    useEffect(() => {
        if (!user || typeof id !== 'string') return;

        const init = async () => {
            try {
                const bookData = await getBook(id);
                if (!bookData) {
                    alert("Book not found");
                    router.push('/');
                    return;
                }
                setBook(bookData);

                // Load Pages
                let initialPages = [null];

                // 1. Try DB
                const dbPages = await loadBookPages(user.uid, id);
                if (dbPages && dbPages.length > 0) {
                    initialPages = dbPages;
                }

                // 2. Check Local Cache (Realtime Work)
                const cachedParams = localStorage.getItem(LOCAL_CACHE_KEY);
                if (cachedParams) {
                    try {
                        const parsed = JSON.parse(cachedParams);
                        if (parsed.pages && Array.isArray(parsed.pages)) {
                            console.log("Loading from Local Cache (Unsaved Work)");
                            initialPages = parsed.pages;
                            // Optional: Notification that we loaded unsaved work?
                        }
                    } catch (e) {
                        console.error("Cache load failed", e);
                    }
                }

                setPages(initialPages);
                setLoading(false);
            } catch (e) {
                console.error(e);
            }
        };
        init();
    }, [user, id, router]);

    // Setup Canvas
    useEffect(() => {
        if (loading || !book || !canvasEl.current || canvas) return;

        const c = new fabric.Canvas(canvasEl.current, {
            isDrawingMode: false,
            backgroundColor: '#ffffff',
            selection: true,
            preserveObjectStacking: true
        });

        // Set dimensions based on orientation (A4-ish ratio)
        // A4 at 96 DPI is approx 794 x 1123
        const width = book.orientation === 'landscape' ? 1123 : 794;
        const height = book.orientation === 'landscape' ? 794 : 1123;

        c.setDimensions({ width, height });

        // Brush Setup
        c.freeDrawingBrush = new fabric.PencilBrush(c);
        c.freeDrawingBrush.width = brushSize;
        c.freeDrawingBrush.color = color;

        // Events for History & AutoSave
        const saveState = () => {
            if (isUndoing.current) return;
            const json = JSON.stringify(c.toJSON());

            // Add to history
            const currentIndex = historyIndexRef.current;
            const history = historyRef.current;

            // Slice forward history if we branch
            if (currentIndex < history.length - 1) {
                historyRef.current = history.slice(0, currentIndex + 1);
            }

            historyRef.current.push(json);
            historyIndexRef.current = historyRef.current.length - 1;
        };

        c.on('object:modified', saveState);
        c.on('object:added', saveState);
        c.on('path:created', saveState);
        c.on('object:removed', saveState);

        // Load Initial Page
        if (pages[currentPage]) {
            c.loadFromJSON(pages[currentPage], () => {
                c.renderAll();
                saveState(); // Init history
            });
        } else {
            saveState(); // Init empty
        }

        setCanvas(c);

        return () => {
            c.dispose();
        };
    }, [loading, book]); // Run when loaded and book data available

    // Tool Logic
    useEffect(() => {
        if (!canvas) return;

        canvas.isDrawingMode = activeTool === 'draw';

        if (activeTool === 'draw') {
            canvas.freeDrawingBrush.width = brushSize;
            canvas.freeDrawingBrush.color = color;
        }

        canvas.discardActiveObject();
        canvas.requestRenderAll();
    }, [activeTool, brushSize, color, canvas]);

    // Eraser Logic (Using mouse events)
    useEffect(() => {
        if (!canvas) return;

        const handleMouseDown = (opt: fabric.IEvent) => {
            if (activeTool === 'eraser' && opt.target) {
                canvas.remove(opt.target);
                canvas.requestRenderAll();
                // History update triggered by object:removed event setup earlier
            }
        };

        if (activeTool === 'eraser') {
            canvas.on('mouse:down', handleMouseDown);
            // Change cursor
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
        } else {
            canvas.off('mouse:down', handleMouseDown);
            canvas.defaultCursor = 'default';
            canvas.hoverCursor = 'move'; // or default based on object
        }

        return () => {
            canvas.off('mouse:down', handleMouseDown);
        };
    }, [activeTool, canvas]);

    // Save Page Logic
    const saveCurrentPage = useCallback(() => {
        if (!canvas) return;
        const json = canvas.toJSON();
        setPages(prev => {
            const newPages = [...prev];
            newPages[currentPage] = json;
            return newPages;
        });
        return json;
    }, [canvas, currentPage]);

    // Auto-Save block removed individually to ensure no ghost saves.


    // Actions
    const handleAddText = () => {
        if (!canvas) return;
        const text = new fabric.IText('Double click to edit', {
            left: 100, top: 100, fill: color, fontSize: 20
        });
        canvas.add(text);
        setActiveTool('select');
        canvas.setActiveObject(text);
    };

    const applyStyle = (style: 'bold' | 'italic' | 'underline') => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (active instanceof fabric.IText) {
            if (style === 'bold') {
                active.set('fontWeight', active.fontWeight === 'bold' ? 'normal' : 'bold');
            } else if (style === 'italic') {
                active.set('fontStyle', active.fontStyle === 'italic' ? 'normal' : 'italic');
            } else if (style === 'underline') {
                active.set('underline', !active.underline);
            }
            canvas.renderAll();
            // Trigger save state
            canvas.fire('object:modified');
        }
    };

    const handleAddShape = (type: 'rect' | 'circle' | 'line') => {
        if (!canvas) return;
        let shape;
        if (type === 'rect') {
            shape = new fabric.Rect({ left: 100, top: 100, fill: fillColor, stroke: color, width: 100, height: 100, strokeWidth: 2 });
        } else if (type === 'circle') {
            shape = new fabric.Circle({ left: 100, top: 100, fill: fillColor, stroke: color, radius: 50, strokeWidth: 2 });
        } else {
            shape = new fabric.Line([50, 50, 200, 50], { left: 100, top: 100, stroke: color, strokeWidth: 2 });
        }
        canvas.add(shape);
        setActiveTool('select');
    };

    const changePage = (offset: number) => {
        if (!canvas) return;

        // Save current
        const currentJson = canvas.toJSON();
        const newPages = [...pages];
        newPages[currentPage] = currentJson;
        setPages(newPages);

        const nextIndex = currentPage + offset;
        if (nextIndex < 0 || nextIndex >= newPages.length) return;

        // Load next
        setCurrentPage(nextIndex);
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        if (newPages[nextIndex]) {
            canvas.loadFromJSON(newPages[nextIndex], canvas.renderAll.bind(canvas));
        }

        // Reset History for new page (or separate history per page?)
        // Simple approach: clear history
        historyRef.current = [];
        historyIndexRef.current = -1;
    };

    const addNewPage = () => {
        if (!canvas) return;
        const currentJson = canvas.toJSON();
        const newPages = [...pages];
        newPages[currentPage] = currentJson;

        newPages.push(null); // New empty page
        setPages(newPages);

        // Switch to it
        setCurrentPage(newPages.length - 1);
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        historyRef.current = [];
        historyIndexRef.current = -1;
    };

    const downloadBook = () => {
        // Create HTML content
        // This is a naive implementation. For complex fabric objects, we need the fabric library in the HTML.
        // Helper to generate full HTML
        const bookJson = JSON.stringify(pages);

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${book?.title || 'Digital Book'}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>
    <style>
        body { margin: 0; background: #eee; display: flex; flex-col; height: 100vh; overflow: hidden; }
        #canvas-container { flex: 1; display: flex; justify-content: center; align-items: center; }
        #controls { height: 60px; background: #333; color: white; display: flex; align-items: center; justify-content: center; gap: 20px; }
        button { padding: 8px 16px; cursor: pointer; background: #555; color: white; border: none; border-radius: 4px; }
        button:hover { background: #777; }
    </style>
</head>
<body>
    <div id="canvas-container">
        <canvas id="c"></canvas>
    </div>
    <div id="controls">
        <button onclick="prevPage()">Previous</button>
        <span id="page-indicator">Page 1</span>
        <button onclick="nextPage()">Next</button>
    </div>

    <script>
        const pages = ${bookJson};
        let currentPage = 0;
        const canvas = new fabric.StaticCanvas('c');
        
        function resize() {
            canvas.setWidth(window.innerWidth);
            canvas.setHeight(window.innerHeight - 60);
            canvas.renderAll();
        }
        window.addEventListener('resize', resize);
        resize();

        function loadPage(index) {
            if(index < 0 || index >= pages.length) return;
            currentPage = index;
            document.getElementById('page-indicator').innerText = 'Page ' + (currentPage + 1) + ' of ' + pages.length;
            
            canvas.loadFromJSON(pages[currentPage], () => {
                canvas.renderAll();
                // Zoom to fit?
                const obj = canvas.getObjects();
                // Scale logic omitted for brevity in viewer
            });
        }

        function prevPage() { loadPage(currentPage - 1); }
        function nextPage() { loadPage(currentPage + 1); }

        loadPage(0);
    </script>
</body>
</html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${book?.title || 'book'}.html`;
        a.click();
    };

    const handleUndo = () => {
        if (!canvas || historyIndexRef.current <= 0) return;
        isUndoing.current = true;
        historyIndexRef.current -= 1;
        const json = JSON.parse(historyRef.current[historyIndexRef.current]);
        canvas.loadFromJSON(json, () => {
            canvas.renderAll();
            isUndoing.current = false;
        });
    };

    // Zoom & Pan State
    const [zoom, setZoom] = useState(1);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Zoom & Pan Logic
    useEffect(() => {
        // Prevent default browser zoom globally
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                // Only zoom if mouse is over the workspace or canvas
                // This allows the user to still use browser zoom if they REALLY want to (e.g. over the URL bar? No events there).
                // Actually, let's just zoom the canvas globally as requested to "turn off browser short cut".

                const delta = e.deltaY * -0.002;
                setZoom(prev => {
                    const newZoom = Math.min(Math.max(prev + delta, 0.1), 5);
                    return newZoom;
                });
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 2) { // Right Click
                isPanning.current = true;
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                if (workspaceRef.current) workspaceRef.current.style.cursor = 'grabbing';
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isPanning.current || !workspaceRef.current) return;
            e.preventDefault();
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;

            workspaceRef.current.scrollLeft -= dx;
            workspaceRef.current.scrollTop -= dy;

            lastMousePos.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            isPanning.current = false;
            if (workspaceRef.current) workspaceRef.current.style.cursor = 'default';
        };

        const handleContextMenu = (e: MouseEvent) => {
            // Only prevent context menu on the workspace/canvas to allow standard menu on UI if needed
            if (workspaceRef.current && workspaceRef.current.contains(e.target as Node)) {
                e.preventDefault();
            }
        };

        // Attach listeners
        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        // Note: Context menu often bubbles, so window listener is safer for blocking
        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('mousedown', handleMouseDown);

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('mousedown', handleMouseDown);
        };
    }, []);

    if (loading) return <div className="flex h-screen items-center justify-center bg-[#1e1e2e] text-white"><div className="animate-spin mr-2">C</div> Loading...</div>;

    return (
        <div className="flex flex-col h-screen bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] overflow-hidden text-white">
            {/* Top Bar */}
            <div className="bg-white/10 backdrop-blur-md border-b border-white/10 h-14 flex items-center px-4 justify-between shadow-sm z-20">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ChevronLeft className="text-white" />
                    </button>
                    <h1 className="font-bold text-white">{book?.title}</h1>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[50vw]">
                    {/* Style Tools */}
                    <div className="h-8 w-[1px] bg-white/20 mx-2"></div>
                    <button onClick={() => applyStyle('bold')} className="p-2 hover:bg-white/10 rounded text-gray-200 hover:text-white" title="Bold"><Bold size={18} /></button>
                    <button onClick={() => applyStyle('italic')} className="p-2 hover:bg-white/10 rounded text-gray-200 hover:text-white" title="Italic"><Italic size={18} /></button>
                    <button onClick={() => applyStyle('underline')} className="p-2 hover:bg-white/10 rounded text-gray-200 hover:text-white" title="Underline"><Underline size={18} /></button>
                    <div className="h-8 w-[1px] bg-white/20 mx-2"></div>

                    {/* Color Picker */}
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
                        title="Text/Brush Color"
                    />
                    <div className="h-8 w-[1px] bg-white/20 mx-2"></div>

                    {/* Brush Size */}
                    <div className="flex items-center gap-2 text-gray-200">
                        <span className="text-xs">Size</span>
                        <input
                            type="range" min="1" max="20"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-24 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-xs font-mono w-4">{brushSize}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50"
                        >
                            {saving ? <div className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" /> : <Save size={16} />}
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>

                    <button onClick={() => setShowLeftBar(!showLeftBar)} className="md:hidden p-2 hover:bg-white/10 rounded text-white">
                        {showLeftBar ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 relative bg-transparent overflow-hidden">
                {/* Left Toolbar */}
                <div className={`absolute md:relative left-0 top-0 bottom-0 w-16 bg-white/5 backdrop-blur-md border-r border-white/10 z-10 flex flex-col items-center py-4 gap-4 transition-transform ${showLeftBar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                    <ToolButton icon={<MousePointer2 />} active={activeTool === 'select'} onClick={() => setActiveTool('select')} tooltip="Select" />
                    <ToolButton icon={<Pencil />} active={activeTool === 'draw'} onClick={() => setActiveTool('draw')} tooltip="Draw (Free)" />
                    <ToolButton icon={<Type />} active={activeTool === 'text'} onClick={handleAddText} tooltip="Add Text" />

                    <div className="h-[1px] w-8 bg-white/20 my-1"></div>

                    {/* Shapes */}
                    <ToolButton icon={<Square />} onClick={() => handleAddShape('rect')} tooltip="Rectangle" />
                    <ToolButton icon={<Circle />} onClick={() => handleAddShape('circle')} tooltip="Circle" />
                    <ToolButton icon={<Minus className="rotate-45" />} onClick={() => handleAddShape('line')} tooltip="Line" />

                    <div className="h-[1px] w-8 bg-white/20 my-1"></div>

                    <ToolButton icon={<Eraser />} active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} tooltip="Eraser (Beta)" />
                </div>

                {/* Canvas Area */}
                <div
                    ref={workspaceRef}
                    id="workspace"
                    className="flex-1 relative overflow-auto flex items-center justify-center p-8 active:cursor-grabbing [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-track]:bg-transparent"
                    style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                >
                    <div
                        style={{
                            transform: `scale(${zoom})`,
                            transformOrigin: 'center',
                            transition: isPanning.current ? 'none' : 'transform 0.1s ease-out'
                        }}
                        className="shadow-2xl shadow-black/50"
                    >
                        <canvas ref={canvasEl} className="bg-white" />

                        {/* Metadata Overlays */}

                        <div className="absolute bottom-3 right-4 text-[10px] text-gray-400 font-mono pointer-events-none select-none z-10">
                            Page {currentPage + 1}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="bg-white/10 backdrop-blur-md border-t border-white/10 h-14 flex items-center px-4 justify-between z-20">
                <div className="flex items-center gap-2">
                    <button onClick={handleUndo} className="p-2 hover:bg-white/10 rounded text-gray-200" title="Undo"><Undo size={20} /></button>
                </div>

                <div className="flex items-center gap-4 bg-black/20 px-4 py-1.5 rounded-full border border-white/10">
                    <button onClick={() => changePage(-1)} disabled={currentPage === 0} className="p-1 hover:bg-white/10 rounded disabled:opacity-30 text-white"><ChevronLeft size={20} /></button>
                    <span className="text-sm font-medium text-white">Page {currentPage + 1} / {pages.length}</span>
                    <button onClick={() => changePage(1)} className="p-1 hover:bg-white/10 rounded text-white" disabled={currentPage >= pages.length - 1 && pages.length > 0 && false}><ChevronRight size={20} /></button>
                    <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                    <button onClick={addNewPage} className="text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline">+ Add Page</button>
                    <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                    <span className="text-xs font-mono text-gray-400">{Math.round(zoom * 100)}%</span>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.1))} className="p-2 hover:bg-white/10 rounded text-gray-200" title="Zoom Out"><ZoomOut size={20} /></button>
                    <button onClick={() => setZoom(z => Math.min(z + 0.1, 5))} className="p-2 hover:bg-white/10 rounded text-gray-200" title="Zoom In"><ZoomIn size={20} /></button>
                    <button onClick={downloadBook} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-xs font-bold border border-white/10">
                        <Download size={16} /> Download
                    </button>
                </div>
            </div>
        </div>
    );
}

function ToolButton({ icon, active, onClick, tooltip }: any) {
    return (
        <button
            onClick={onClick}
            title={tooltip}
            className={`p-3 rounded-xl transition-all hover:scale-105 active:scale-95 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
        >
            {icon}
        </button>
    );
}
