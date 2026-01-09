'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import type { MindMapData } from './services/mindmapService';
import {
  getUserMindMaps,
  createMindMap,
  togglePinMindMap,
  softDeleteMindMap,
  restoreMindMap,
  permanentDeleteMindMap,
  emptyTrash
} from './services/mindmapService';
import Image from 'next/image';

import LandingPage from './components/LandingPage';
import Header from './components/Header';

export default function Dashboard() {
  const [maps, setMaps] = useState<MindMapData[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Creation State
  const [creating, setCreating] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'map' | 'book'>('map');
  const [newMapTitle, setNewMapTitle] = useState('');

  // Trash State
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Confirmation State
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
    actionLabel: string;
    isDangerous?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => { },
    actionLabel: 'Confirm',
    isDangerous: false,
  });

  const router = useRouter();

  // Load Data
  const loadMaps = async (currentUser: User) => {
    try {
      const userMaps = await getUserMindMaps(currentUser.uid);

      // Client-side auto-delete check (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const mapsKeep: MindMapData[] = [];
      const mapsToDelete: string[] = [];

      userMaps.forEach(map => {
        if (map.isTrashed && map.trashedAt && new Date(map.trashedAt) < thirtyDaysAgo) {
          mapsToDelete.push(map.id);
        } else {
          mapsKeep.push(map);
        }
      });

      // If we found items to delete, do it quietly in background
      if (mapsToDelete.length > 0) {
        Promise.all(mapsToDelete.map(id => permanentDeleteMindMap(id)));
      }

      setMaps(mapsKeep);
    } catch (e) {
      console.error("Error loading maps", e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadMaps(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // Derived State
  const { activeMaps, trashedMaps } = useMemo(() => {
    const active = maps.filter(m => !m.isTrashed);
    const trashed = maps.filter(m => m.isTrashed);

    // Sort active: Pinned first, then UpdatedAt descending
    active.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // Filter by search
    const searchLower = searchTerm.toLowerCase();
    const filteredActive = active.filter(m => m.title.toLowerCase().includes(searchLower));

    return { activeMaps: filteredActive, trashedMaps: trashed };
  }, [maps, searchTerm]);


  // Actions
  const handleCreate = async () => {
    if (!newMapTitle.trim() || !user) return;
    setCreating(true);
    try {
      const newMapId = await createMindMap(user.uid, newMapTitle, selectedType);

      // If it's a map, go to editor. If book, maybe just show in list for now (as user said feature comes later)
      // For now, regardless of type, we redirect to map editor or stays on dashboard. 
      // User request: "digital book feature... I will tell later". So just save and show.

      if (selectedType === 'map') {
        router.push(`/map/${newMapId}`);
      } else {
        // Just refresh list for book
        await loadMaps(user);
        setIsNameModalOpen(false);
        setNewMapTitle('');
      }
    } catch (error) {
      console.error("Failed to create project", error);
      alert("Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handlePin = async (e: React.MouseEvent, map: MindMapData) => {
    e.stopPropagation();
    if (!user) return;
    const newStatus = !map.isPinned;
    // Optimistic update
    setMaps(maps.map(m => m.id === map.id ? { ...m, isPinned: newStatus } : m));
    await togglePinMindMap(map.id, newStatus);
  };

  const requestConfirmation = (title: string, message: string, actionLabel: string, action: () => Promise<void>, isDangerous = false) => {
    setConfirmation({ isOpen: true, title, message, actionLabel, action, isDangerous });
  };

  const handleConfirmAction = async () => {
    try {
      await confirmation.action();
    } catch (e) {
      console.error("Action failed", e);
    } finally {
      setConfirmation({ ...confirmation, isOpen: false });
    }
  };

  const handleSoftDelete = async (e: React.MouseEvent, map: MindMapData) => {
    e.stopPropagation();
    if (!user) return;

    requestConfirmation(
      "Move to Trash?",
      `Are you sure you want to move "${map.title}" to the trash?`,
      "Move to Trash",
      async () => {
        setMaps(prev => prev.map(m => m.id === map.id ? { ...m, isTrashed: true, trashedAt: new Date().toISOString() } : m));
        await softDeleteMindMap(map.id);
      },
      true
    );
  };

  const handleRestore = async (map: MindMapData) => {
    if (!user) return;
    setMaps(maps.map(m => m.id === map.id ? { ...m, isTrashed: false, trashedAt: undefined } : m));
    await restoreMindMap(map.id);
  };

  const handlePermanentDelete = async (map: MindMapData) => {
    if (!user) return;
    requestConfirmation(
      "Delete Permanently?",
      "This action cannot be undone. Are you sure you want to delete this project permanently?",
      "Delete Permanently",
      async () => {
        setMaps(prev => prev.filter(m => m.id !== map.id));
        await permanentDeleteMindMap(map.id);
      },
      true
    );
  };

  const handleEmptyTrash = async () => {
    if (!user) return;
    requestConfirmation(
      "Empty Trash?",
      "Are you sure you want to delete all items in the trash permanently? This cannot be undone.",
      "Empty Trash",
      async () => {
        setMaps(prev => prev.filter(m => !m.isTrashed));
        await emptyTrash(user.uid);
      },
      true
    );
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMaps([]);
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-zinc-900 text-gray-500">Loading...</div>;

  // Use the new LandingPage component when not logged in
  if (!user) {
    return <LandingPage onGetStarted={() => router.push('/login')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header */}
      <Header
        user={user}
        onLogout={handleLogout}
        search={{
          isOpen: isSearchOpen,
          setIsOpen: setIsSearchOpen,
          term: searchTerm,
          setTerm: setSearchTerm
        }}
        trash={{
          setIsOpen: setIsTrashOpen,
          count: trashedMaps.length
        }}
      />

      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Your Projects</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {/* Create New Project Card */}
          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            className="group flex flex-col items-center justify-center h-48 bg-white dark:bg-zinc-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-zinc-600 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-zinc-700/50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="font-medium text-gray-600 group-hover:text-blue-600 dark:text-gray-300 dark:group-hover:text-blue-400">Create New Project</span>
          </button>

          {/* Project Cards */}
          {activeMaps.map((map) => (
            <div
              key={map.id}
              onClick={() => router.push(`/map/${map.id}`)}
              className="group relative flex flex-col h-48 bg-white dark:bg-zinc-800 rounded-xl shadow-sm hover:shadow-md border border-gray-100 dark:border-zinc-700 overflow-hidden cursor-pointer transition-all hover:-translate-y-1"
            >
              {/* Pin & Trash Buttons */}
              <div className="absolute top-2 right-2 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handlePin(e, map)}
                  className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${map.isPinned ? 'bg-blue-100 text-blue-600' : 'bg-white/50 hover:bg-blue-50 hover:text-blue-600 text-gray-400'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={map.isPinned ? "currentColor" : "none"} strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => handleSoftDelete(e, map)}
                  className="p-1.5 rounded-full bg-white/50 hover:bg-red-50 hover:text-red-600 text-gray-400 backdrop-blur-sm transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>

              {/* Pinned Indicator on card if pinned (always visible) */}
              {map.isPinned && (
                <div className="absolute top-2 left-2 z-10">
                  <span className="text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 drop-shadow-sm">
                      <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              )}

              <div className="flex-1 p-6 bg-gradient-to-br from-gray-50 to-white dark:from-zinc-800 dark:to-zinc-700/50">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${map.type === 'book' ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-600'}`}>
                  {map.type === 'book' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    </svg>
                  )}
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-white truncate pr-4">{map.title}</h3>
                <p className="text-xs text-gray-500 mt-2">
                  {map.type === 'book' ? 'Digital Book' : 'Mind Map'} • {new Date(map.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Project Type Selection Modal */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-4 transform transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">Create New</h3>
              <button onClick={() => setIsNewProjectModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Map Option */}
              <button
                onClick={() => {
                  setSelectedType('map');
                  setIsNewProjectModalOpen(false);
                  setIsNameModalOpen(true);
                }}
                className="flex flex-col items-center p-8 bg-blue-50 dark:bg-zinc-700/50 rounded-xl border-2 border-transparent hover:border-blue-500 transition-all text-center"
              >
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-white">Mind Map</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Visualize your thoughts with interactive maps.</p>
              </button>

              {/* Book Option */}
              <button
                onClick={() => {
                  setSelectedType('book');
                  setIsNewProjectModalOpen(false);
                  setIsNameModalOpen(true);
                }}
                className="flex flex-col items-center p-8 bg-amber-50 dark:bg-zinc-700/50 rounded-xl border-2 border-transparent hover:border-amber-500 transition-all text-center"
              >
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-white">Digital Book</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Write and organize your ideas in a book format.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Input Modal */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 transform transition-all scale-100">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              {selectedType === 'map' ? 'New Mind Map' : 'New Digital Book'}
            </h3>
            <input
              autoFocus
              type="text"
              placeholder="Project Name..."
              className="w-full px-4 py-2 mb-6 border border-gray-300 dark:border-zinc-600 rounded-lg bg-gray-50 dark:bg-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={newMapTitle}
              onChange={(e) => setNewMapTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsNameModalOpen(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsNameModalOpen(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newMapTitle.trim()}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/30"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {isTrashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[80vh] mx-4 flex flex-col transform transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">Trash Bin</h3>
                <span className="bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">{trashedMaps.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {trashedMaps.length > 0 && (
                  <button
                    onClick={handleEmptyTrash}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Empty Trash
                  </button>
                )}
                <button onClick={() => setIsTrashOpen(false)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-50 dark:bg-zinc-700 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {trashedMaps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  <p>Trash is empty</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {trashedMaps.map(map => (
                    <div key={map.id} className="bg-gray-50 dark:bg-zinc-700/50 p-4 rounded-xl border border-gray-100 dark:border-zinc-700 opacity-75 hover:opacity-100 transition-opacity">
                      <h4 className="font-semibold text-gray-800 dark:text-white truncate mb-4">{map.title}</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestore(map)}
                          className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(map)}
                          className="flex-1 px-3 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t dark:border-zinc-700 text-xs text-center text-gray-500">
              Items in the trash are deleted automatically after 30 days.
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmation.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 transform transition-all scale-100">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{confirmation.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmation.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`px-6 py-2 text-white font-medium rounded-lg shadow-lg transition-all ${confirmation.isDangerous
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                  }`}
              >
                {confirmation.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
