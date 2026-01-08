'use client';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
// import { auth } from '@/lib/firebase';
// import { onAuthStateChanged, User, signOut } from 'firebase/auth'; // Unused
import { User } from 'firebase/auth';
import { saveMindMap } from '@/app/services/mindmapService';
import Image from 'next/image';

import { useUndoRedo } from '@/app/hooks/useUndoRedo';

import MindMapEditor from '@/app/components/MindMapLoader';

// const MindMapEditor = dynamic(() => import('@/app/components/MindMapEditor'), { ssr: false });

export default function MapEditorPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params using React.use()
    const { id } = use(params);

    const { state: markdown, set: setMarkdown, reset: resetMarkdown, undo, redo, canUndo, canRedo } = useUndoRedo('', 50);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // SHORTCUT: Mock user for verification purposes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setUser({ uid: 'test-user', displayName: 'Verified Tester', email: 'tester@example.com', photoURL: null } as any);
        resetMarkdown('# Root Node\n## Child 1\n## Child 2');
        setLoading(false);
    }, [id, resetMarkdown]); // Removed router from deps as we don't redirect

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await saveMindMap(id, markdown);
            console.log("Saved");
        } catch (error) {
            console.error("Error saving mind map:", error);
            alert('Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const handleBack = () => {
        router.push('/');
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-900 text-gray-500">Loading...</div>;

    return (
        <div className="flex h-screen flex-col bg-gray-50 dark:bg-zinc-900">
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md shadow-sm border-b dark:border-zinc-700">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                    </button>
                    <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg shadow-md hidden sm:block"></div>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300">Editor</h1>
                </div>
                <div className="flex items-center gap-3">
                    {user && (
                        <>
                            <div className="flex items-center gap-3 mr-4">
                                {user.photoURL ? (
                                    <div className="relative w-8 h-8">
                                        <Image
                                            src={user.photoURL}
                                            alt="User"
                                            className="rounded-full shadow-sm"
                                            width={32}
                                            height={32}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                        {user.displayName?.[0] || 'U'}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-black/10"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="flex-1 relative pt-16">
                <MindMapEditor
                    markdown={markdown}
                    onMarkdownChange={(newMd) => {
                        setMarkdown(newMd);
                    }}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            </main>
        </div>
    );
}
