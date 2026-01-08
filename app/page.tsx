'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import type { MindMapData } from './services/mindmapService';
import { getUserMindMaps, createMindMap } from './services/mindmapService';
import Image from 'next/image';

export const runtime = 'edge';

export default function Dashboard() {
  const [maps, setMaps] = useState<MindMapData[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userMaps = await getUserMindMaps(currentUser.uid);
          setMaps(userMaps.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        } catch (e) {
          console.error("Error loading maps", e);
        }
      } else {
        // Optionally redirect to login if not public
        // router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleCreate = async () => {
    if (!newMapTitle.trim() || !user) return;
    setCreating(true);
    try {
      const newMapId = await createMindMap(user.uid, newMapTitle);
      router.push(`/map/${newMapId}`);
    } catch (error) {
      console.error("Failed to create map", error);
      alert("Failed to create map.");
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMaps([]);
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-900 text-gray-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md shadow-sm border-b dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg shadow-md"></div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300">Mind Map</h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="flex items-center gap-3">
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
                <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-200">
                  {user.displayName}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 shadow-md transition-all active:scale-95"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">Visualize Your Ideas</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
              Create beautiful, interactive mind maps with ease. Sign in to start organizing your thoughts.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-8 py-3 text-lg font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 shadow-lg transition-transform hover:-translate-y-1"
            >
              Get Started
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Your Projects</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {/* Create New Card */}
              <button
                onClick={() => setIsModalOpen(true)}
                className="group flex flex-col items-center justify-center h-48 bg-white dark:bg-zinc-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-zinc-600 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-zinc-700/50 transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <span className="font-medium text-gray-600 group-hover:text-blue-600 dark:text-gray-300 dark:group-hover:text-blue-400">Create New Map</span>
              </button>

              {/* Map Cards */}
              {maps.map((map) => (
                <div
                  key={map.id}
                  onClick={() => router.push(`/map/${map.id}`)}
                  className="group relative flex flex-col h-48 bg-white dark:bg-zinc-800 rounded-xl shadow-sm hover:shadow-md border border-gray-100 dark:border-zinc-700 overflow-hidden cursor-pointer transition-all hover:-translate-y-1"
                >
                  <div className="flex-1 p-6 bg-gradient-to-br from-gray-50 to-white dark:from-zinc-800 dark:to-zinc-700/50">
                    {/* Preview could go here */}
                    <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-800 dark:text-white truncate pr-4">{map.title}</h3>
                    <p className="text-xs text-gray-500 mt-2">
                      Last updated: {new Date(map.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Basic Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 transform transition-all scale-100">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">New Project</h3>
            <input
              autoFocus
              type="text"
              placeholder="Project Name (e.g. My Awesome Plan)"
              className="w-full px-4 py-2 mb-6 border border-gray-300 dark:border-zinc-600 rounded-lg bg-gray-50 dark:bg-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={newMapTitle}
              onChange={(e) => setNewMapTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsModalOpen(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newMapTitle.trim()}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/30"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
