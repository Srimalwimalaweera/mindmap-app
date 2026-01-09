'use client';

import Link from 'next/link';
import Image from 'next/image';
import { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface HeaderProps {
    user: User | null;
    onLogout?: () => void;
    search?: {
        isOpen: boolean;
        setIsOpen: (isOpen: boolean) => void;
        term: string;
        setTerm: (term: string) => void;
    };
    trash?: {
        setIsOpen: (isOpen: boolean) => void;
        count: number; // Added count back
    };
    hideTitle?: boolean;
    actions?: React.ReactNode;
}

export default function Header({ user, onLogout, search, trash, actions, hideTitle = false }: HeaderProps) {
    const router = useRouter();

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md shadow-sm border-b dark:border-zinc-700">
            <div className="flex items-center gap-2">
                <Link href="/" className="flex items-center gap-2" title="Go to Dashboard">
                    <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg shadow-md flex items-center justify-center text-white font-bold text-xs">VM</div>
                    {!hideTitle && (
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300">Visual mind map</h1>
                    )}
                </Link>
            </div>

            <div className="flex items-center gap-4">
                {/* Actions (like Save button) */}
                {actions && (
                    <div className="flex items-center">
                        {actions}
                    </div>
                )}

                {user && (
                    <>
                        {/* Search */}
                        {search && (
                            <div className="relative flex items-center">
                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${search.isOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}>
                                    <input
                                        type="text"
                                        placeholder="Search projects..."
                                        className="w-full pl-3 pr-8 py-1.5 text-sm bg-gray-100 dark:bg-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-white"
                                        value={search.term}
                                        onChange={(e) => search.setTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={() => search.setIsOpen(!search.isOpen)}
                                    className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Trash Bin */}
                        {trash && (
                            <button
                                onClick={() => trash.setIsOpen(true)}
                                className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-full transition-colors relative"
                                title="Trash Bin"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                {trash.count > 0 && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                                )}
                            </button>
                        )}
                    </>
                )}

                {/* User Profile */}
                {user ? (
                    <>
                        <div className="flex items-center gap-3 pl-4 border-l dark:border-zinc-700 ml-2">
                            {user.photoURL ? (
                                <Image
                                    src={user.photoURL}
                                    alt="User"
                                    className="rounded-full shadow-sm"
                                    width={32}
                                    height={32}
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                    {user.displayName?.[0] || 'U'}
                                </div>
                            )}
                        </div>
                        {onLogout && (
                            <button onClick={onLogout} className="p-2 text-gray-600 hover:text-red-500 transition-colors" title="Logout">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                                </svg>
                            </button>
                        )}
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
    );
}
