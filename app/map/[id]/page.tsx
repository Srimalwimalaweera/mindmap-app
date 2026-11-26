'use client';

export const runtime = 'edge';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { saveMindMap, getMindMap } from '@/app/services/mindmapService';
import { cacheCloudMap } from '@/app/utils/localDB';
import Image from 'next/image';
import { ChevronRight, ArrowLeft, GitMerge } from 'lucide-react';

import { useUndoRedo } from '@/app/hooks/useUndoRedo';

import MindMapEditor from '@/app/components/MindMapLoader';
import Header from '@/app/components/Header';
import AutoSaveControl from '@/app/components/AutoSaveControl';
import LoadingScreen from '@/app/components/LoadingScreen';

import { useAuth } from '@/app/context/AuthProvider';
import { CustomNode } from '@/app/types/mindmap';
import { Transformer } from 'markmap-lib';

function convertMarkdownToCustomNode(markdown: string): CustomNode {
    const transformer = new Transformer();
    const { root } = transformer.transform(markdown);
    
    const convert = (inode: any): CustomNode => {
        return {
            id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content: inode.content || '',
            children: (inode.children || []).map(convert),
            payload: inode.payload
        };
    };
    
    return convert(root);
}

const DEFAULT_MAP: CustomNode = {
    id: 'root-default',
    content: 'Project Name',
    children: [
        { id: 'child-1', content: 'Child 1', children: [] },
        { id: 'child-2', content: 'Child 2', children: [] }
    ]
};

interface MapStackEntry {
    mapId: string;
    title: string;
    cachedData?: CustomNode;
    lastSaved?: CustomNode;
}

export default function MapEditorPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params using React.use()
    const { id } = use(params);

    const [activeMapId, setActiveMapId] = useState<string>(id);
    const [mapStack, setMapStack] = useState<MapStackEntry[]>([{ mapId: id, title: 'Main Map' }]);
    const [transitionClass, setTransitionClass] = useState<string>('');

    const { state: mapData, set: setMapData, reset: resetMapData, undo, redo, canUndo, canRedo } = useUndoRedo<CustomNode>(DEFAULT_MAP, 50);
    const { user, loading: authLoading } = useAuth(); // Global Auth
    const loading = authLoading;
    const [saving, setSaving] = useState(false);
    const [isMapLoading, setIsMapLoading] = useState(true);
    const [lastSavedData, setLastSavedData] = useState<CustomNode>(DEFAULT_MAP);
    const [autoSaveInterval, setAutoSaveInterval] = useState(30 * 60 * 1000); // Default 30 min
    const [scheduledSaveTime, setScheduledSaveTime] = useState<number | null>(null);
    const router = useRouter();

    // Initial Load & Active Map Switch Load
    useEffect(() => {
        let isMounted = true;
        setIsMapLoading(true);
        const loadMap = async () => {
            try {
                // Check if we already have cached state in mapStack (e.g. returning to parent map)
                const stackEntry = mapStack.find(m => m.mapId === activeMapId);
                if (stackEntry?.cachedData) {
                    if (isMounted) {
                        resetMapData(stackEntry.cachedData);
                        setLastSavedData(stackEntry.lastSaved || stackEntry.cachedData);
                        setIsMapLoading(false);
                    }
                    return;
                }

                const content = await getMindMap(activeMapId);
                if (isMounted && content) {
                    let parsedData: CustomNode;
                    if (typeof content === 'string') {
                        parsedData = convertMarkdownToCustomNode(content);
                    } else {
                        parsedData = content as CustomNode;
                    }
                    resetMapData(parsedData);
                    setLastSavedData(parsedData);
                    // Update root title in stack from root node content if available
                    setMapStack(prev => prev.map((entry, idx) =>
                        entry.mapId === activeMapId && idx === 0 && parsedData.content
                            ? { ...entry, title: parsedData.content.replace(/<[^>]+>/g, '').slice(0, 32) || 'Main Map' }
                            : entry
                    ));
                } else if (isMounted) {
                    resetMapData(DEFAULT_MAP);
                    setLastSavedData(DEFAULT_MAP);
                }
            } catch (err) {
                console.error("Failed to load map", err);
            } finally {
                if (isMounted) setIsMapLoading(false);
            }
        };
        loadMap();
        return () => { isMounted = false; };
    }, [activeMapId, resetMapData]);

    const handleSave = async (dataToSave?: any) => {
        if (!user) return;
        
        // Prevent React click events from being saved instead of the mind map data
        const isEvent = dataToSave && typeof dataToSave === 'object' && ('nativeEvent' in dataToSave || 'preventDefault' in dataToSave);
        const actualData = (dataToSave && !isEvent) ? dataToSave : mapData;
        
        setSaving(true);
        try {
            await saveMindMap(activeMapId, actualData);
            setLastSavedData(actualData);
            console.log("Saved");
        } catch (error) {
            console.error("Error saving mind map:", error);
            alert('Failed to save.');
        } finally {

            setSaving(false);
            setScheduledSaveTime(null);
        }
    };

    // Open Linked (Merge) Map with Parent DOM Disposal & Smooth Zoom Transition
    const handleOpenLinkedMap = async (targetMapId: string, targetTitle: string) => {
        if (mapStack.some(m => m.mapId === targetMapId)) {
            alert('Circular link detected! This mind map is already open in your navigation stack.');
            return;
        }

        // Persist current map in IndexedDB cache & stack before disposing canvas
        try {
            await cacheCloudMap(activeMapId, mapData);
        } catch {
            // non-fatal
        }

        setTransitionClass('scale-95 opacity-0');
        setTimeout(() => {
            setMapStack(prev => [
                ...prev.map(entry =>
                    entry.mapId === activeMapId
                        ? { ...entry, cachedData: mapData, lastSaved: lastSavedData }
                        : entry
                ),
                { mapId: targetMapId, title: targetTitle }
            ]);
            setActiveMapId(targetMapId);
            setTransitionClass('scale-100 opacity-100');
        }, 160);
    };

    // Navigate Back via Breadcrumb (Disposes Child Canvas & Restores Cached Parent)
    const handleNavigateBreadcrumb = (targetIndex: number) => {
        const target = mapStack[targetIndex];
        if (!target || target.mapId === activeMapId) return;

        setTransitionClass('scale-105 opacity-0');
        setTimeout(() => {
            setMapStack(prev => prev.slice(0, targetIndex + 1));
            setActiveMapId(target.mapId);
            setTransitionClass('scale-100 opacity-100');
        }, 160);
    };

    // Auto-Save Logic (Debounce Style with Countdown)
    useEffect(() => {
        if (!user || autoSaveInterval <= 0) return;

        // If content is same as last saved, clear any pending save
        if (JSON.stringify(mapData) === JSON.stringify(lastSavedData)) {
            setScheduledSaveTime(null);
            return;
        }

        // If we are already saving, do nothing new
        if (saving) return;

        // Calculate next save time
        const nextTime = Date.now() + autoSaveInterval;
        setScheduledSaveTime(nextTime);

        console.log(`[AutoSave] Scheduled in ${(autoSaveInterval / 1000)}s`);

        const timer = setTimeout(() => {
            console.log("[AutoSave] Executing...");
            handleSave();
        }, autoSaveInterval);

        return () => clearTimeout(timer);
    }, [mapData, lastSavedData, user, autoSaveInterval, saving]);

    const handleBack = () => {
        router.push('/');
    };

    if (loading) return <LoadingScreen />;

    return (
        <div className="flex h-screen flex-col bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white">
            <Header
                hideTitle={true}
                actions={
                    <AutoSaveControl
                        onSave={handleSave}
                        isSaving={saving}
                        onIntervalChange={setAutoSaveInterval}
                        scheduledSaveTime={scheduledSaveTime}
                    />
                }
            />

            {/* Breadcrumb Navigation for Linked / Merge Maps */}
            {mapStack.length > 1 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/70 backdrop-blur-md border-b border-white/10 text-xs z-30">
                    <button
                        type="button"
                        onClick={() => handleNavigateBreadcrumb(mapStack.length - 2)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-semibold border border-teal-500/30 transition-all"
                    >
                        <ArrowLeft size={13} /> Back
                    </button>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {mapStack.map((entry, idx) => {
                            const isLast = idx === mapStack.length - 1;
                            return (
                                <div key={entry.mapId} className="flex items-center gap-1 shrink-0">
                                    {idx > 0 && <ChevronRight size={13} className="text-white/30" />}
                                    <button
                                        type="button"
                                        disabled={isLast}
                                        onClick={() => handleNavigateBreadcrumb(idx)}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${isLast
                                            ? 'text-teal-300 font-bold bg-teal-500/10 cursor-default'
                                            : 'text-white/70 hover:text-white hover:bg-white/10'
                                        }`}
                                    >
                                        {idx > 0 && <GitMerge size={11} className="text-teal-400" />}
                                        <span>{entry.title}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <main className={`flex-1 relative transition-all duration-200 ease-out ${transitionClass}`}>
                {isMapLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] z-50">
                        <div className="bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-3xl shadow-2xl flex flex-col items-center gap-6">
                            <div className="w-[80px] h-[80px] rounded-full border border-white/5 relative animate-[spin_2s_linear_infinite]">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full bg-gradient-to-tr from-[#38bdf8] to-[#a855f7] shadow-[0_0_15px_#a855f7]"></div>
                            </div>
                            <p className="text-white/60 font-semibold tracking-widest text-xs uppercase">Loading Workspace...</p>
                        </div>
                    </div>
                ) : (
                    <MindMapEditor
                        key={activeMapId}
                        mapData={mapData}
                        onMapDataChange={(newData: CustomNode) => {
                            setMapData(newData);
                        }}
                        onUndo={undo}
                        onRedo={redo}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onSave={handleSave}
                        currentMapId={activeMapId}
                        blockedMapIds={mapStack.map(m => m.mapId)}
                        onOpenLinkedMap={handleOpenLinkedMap}
                    />
                )}
            </main>
        </div>
    );
}
