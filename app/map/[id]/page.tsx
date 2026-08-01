'use client';

export const runtime = 'edge';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { saveMindMap, getMindMap } from '@/app/services/mindmapService';
import Image from 'next/image';

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

export default function MapEditorPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params using React.use()
    const { id } = use(params);

    const { state: mapData, set: setMapData, reset: resetMapData, undo, redo, canUndo, canRedo } = useUndoRedo<CustomNode>(DEFAULT_MAP, 50);
    const { user, loading: authLoading } = useAuth(); // Global Auth
    const loading = authLoading;
    const [saving, setSaving] = useState(false);
    const [lastSavedData, setLastSavedData] = useState<CustomNode>(DEFAULT_MAP);
    const [autoSaveInterval, setAutoSaveInterval] = useState(30 * 60 * 1000); // Default 30 min
    const [scheduledSaveTime, setScheduledSaveTime] = useState<number | null>(null);
    const router = useRouter();

    // Initial Load
    useEffect(() => {
        let isMounted = true;
        const loadMap = async () => {
            try {
                const content = await getMindMap(id);
                if (isMounted && content) {
                    let parsedData: CustomNode;
                    if (typeof content === 'string') {
                        // Migrate old markdown map to new CustomNode AST!
                        parsedData = convertMarkdownToCustomNode(content);
                        // Optional: auto-save immediately to upgrade DB
                    } else {
                        parsedData = content as CustomNode;
                    }
                    resetMapData(parsedData);
                    setLastSavedData(parsedData);
                } else if (isMounted) {
                    resetMapData(DEFAULT_MAP);
                    setLastSavedData(DEFAULT_MAP);
                }
            } catch (err) {
                console.error("Failed to load map", err);
            }
        };
        loadMap();
        return () => { isMounted = false; };
    }, [id, resetMapData]);

    const handleSave = async (dataToSave = mapData) => {
        if (!user) return;
        setSaving(true);
        try {
            await saveMindMap(id, dataToSave);
            setLastSavedData(dataToSave);
            console.log("Saved");
        } catch (error) {
            console.error("Error saving mind map:", error);
            alert('Failed to save.');
        } finally {

            setSaving(false);
            setScheduledSaveTime(null);
        }
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

            <main className="flex-1 relative">
                <MindMapEditor
                    mapData={mapData}
                    onMapDataChange={(newData: CustomNode) => {
                        setMapData(newData);
                    }}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onSave={handleSave}
                />
            </main>
        </div>
    );
}
