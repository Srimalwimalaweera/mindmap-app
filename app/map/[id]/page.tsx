'use client';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { saveMindMap } from '@/app/services/mindmapService';
import Image from 'next/image';

import { useUndoRedo } from '@/app/hooks/useUndoRedo';

import MindMapEditor from '@/app/components/MindMapLoader';
import Header from '@/app/components/Header';
import AutoSaveControl from '@/app/components/AutoSaveControl';
import LoadingScreen from '@/app/components/LoadingScreen';

// const MindMapEditor = dynamic(() => import('@/app/components/MindMapEditor'), { ssr: false });
export const runtime = 'edge';

export default function MapEditorPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params using React.use()
    const { id } = use(params);

    const { state: markdown, set: setMarkdown, reset: resetMarkdown, undo, redo, canUndo, canRedo } = useUndoRedo('', 50);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSavedMarkdown, setLastSavedMarkdown] = useState('');
    const [autoSaveInterval, setAutoSaveInterval] = useState(30 * 60 * 1000); // Default 30 min
    const [scheduledSaveTime, setScheduledSaveTime] = useState<number | null>(null);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Initial Load
    useEffect(() => {
        // Load initial data (mock for now, or fetch from DB if implemented)
        // For this task, we assume new map or empty
        const initialContent = '# Root Node\n## Child 1\n## Child 2';
        resetMarkdown(initialContent);
        setLastSavedMarkdown(initialContent);
    }, [id, resetMarkdown]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await saveMindMap(id, markdown);
            setLastSavedMarkdown(markdown);
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
        if (markdown === lastSavedMarkdown) {
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
    }, [user, autoSaveInterval, markdown, lastSavedMarkdown]); // Note: removed 'saving' dependency to avoid loops, saving status is checked inside

    const handleBack = () => {
        router.push('/');
    };

    if (loading) return <LoadingScreen />;

    return (
        <div className="flex h-screen flex-col bg-[linear-gradient(135deg,#1e1e2e_0%,#2d1b3d_100%)] text-white">
            <Header
                user={user}
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
                    markdown={markdown}
                    onMarkdownChange={(newMd) => {
                        setMarkdown(newMd);
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
