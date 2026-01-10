'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
// ... imports
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthProvider';
import ProfilePanel, { ProfileModal, UpgradeModal, BuySlotsModal, SettingsModal } from './ProfilePanel';
import { useState, useEffect, useRef } from 'react';

// Simplified Header Props (remove user/onLogout props as they come from context)
interface HeaderProps {
    // user: User | null; // Removed
    // onLogout?: () => void; // Removed
    search?: {
        isOpen: boolean;
        setIsOpen: (isOpen: boolean) => void;
        term: string;
        setTerm: (term: string) => void;
    };
    trash?: {
        setIsOpen: (isOpen: boolean) => void;
        count: number;
    };
    hideTitle?: boolean;
    actions?: React.ReactNode;
}

export default function Header({ search, trash, actions, hideTitle = false }: HeaderProps) {
    const { user, userData } = useAuth(); // Use Context
    const router = useRouter();
    const pathname = usePathname();
    const isEditMode = pathname?.startsWith('/map/');
    const [showProfile, setShowProfile] = useState(false);
    const [activeModal, setActiveModal] = useState<'profile' | 'upgrade' | 'slots' | 'settings' | null>(null);
    const profileBtnRef = useRef<HTMLButtonElement>(null);
    const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

    const handleProfileClick = () => {
        if (!showProfile && profileBtnRef.current) {
            const rect = profileBtnRef.current.getBoundingClientRect();
            setPanelPos({
                top: rect.bottom + 12,
                right: window.innerWidth - rect.right
            });
        }
        setShowProfile(!showProfile);
    };

    const handleAction = (modal: 'profile' | 'upgrade' | 'slots' | 'settings') => {
        setShowProfile(false);
        setActiveModal(modal);
    };

    // ... (Logos and Navigation logic remains same)

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/5 backdrop-blur-md shadow-sm border-b border-white/10">
            {/* Logo Section ... (Keep as is, just copy logic if needed or assume unchanged outside replace block if small) */}
            {/* Actually I need to be careful not to delete the logo section if I replace huge chunks. 
                 Let's target the exact return block or render user section. 
             */}
            <div className="flex items-center gap-2">
                {isEditMode && (
                    <button
                        onClick={() => router.back()}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors mr-1"
                        title="Go Back"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" />
                            <path d="M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
                <Link href="/" className="flex items-center gap-2" title="Go to Dashboard">
                    {/* SVG Logo ... keep existing ... */}
                    <div className="w-8 h-8 flex items-center justify-center">
                        <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
                            viewBox="0 0 128 128" enableBackground="new 0 0 128 128" xmlSpace="preserve" className="w-full h-full">
                            <defs>
                                <linearGradient id="headerLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#9333ea" stopOpacity="1" />
                                </linearGradient>
                            </defs>
                            <path fill="url(#headerLogoGradient)" opacity="1.000000" stroke="none"
                                d="M76.688866,109.921104 C88.050018,115.331482 100.131790,117.192719 112.584740,117.125877 C117.595360,117.098984 120.788620,114.305405 121.104477,109.904366 C121.439659,105.234016 118.474678,101.801880 113.419678,101.228683 C111.275566,100.985550 109.030663,101.381645 106.940926,100.953491 C99.494377,99.427811 91.778465,98.498268 84.753601,95.805984 C74.877594,92.020988 69.684692,83.908684 68.234291,73.078300 C70.384644,73.078300 72.207634,73.078644 74.030617,73.078247 C86.858322,73.075493 99.686478,73.133377 112.513527,73.040070 C117.709305,73.002274 120.970772,69.862900 121.039032,65.258537 C121.107437,60.644268 117.884323,57.419498 112.785179,57.093300 C111.125771,56.987152 109.454391,57.064369 107.788483,57.064228 C94.648399,57.063137 81.508308,57.063622 68.322067,57.063622 C69.945129,45.040371 75.792297,36.744892 87.154800,33.278618 C95.306870,30.791729 104.059700,30.155739 112.593239,29.080770 C117.983620,28.401745 121.287643,25.539717 121.122673,20.684353 C120.966324,16.082565 117.653831,12.969757 112.453003,13.059167 C107.634552,13.142003 102.803261,13.490462 98.013023,14.033926 C71.598251,17.030745 56.428867,30.937811 51.926388,56.118473 C51.879574,56.380272 51.563141,56.593864 51.183678,57.063988 C40.724709,57.063988 30.076698,57.042259 19.428833,57.072033 C12.907690,57.090271 8.991345,60.245888 9.110775,65.284119 C9.227548,70.210205 12.886068,73.054855 19.251369,73.070534 C30.057989,73.097160 40.864723,73.077866 51.840267,73.077866 C53.987484,89.401680 61.400532,101.920280 76.688866,109.921104 z" />
                            <path fill="#F5E41C" opacity="1.000000" stroke="none"
                                d="M76.354416,109.751411 C61.400532,101.920280 53.987484,89.401680 51.840267,73.077866 C40.864723,73.077866 30.057989,73.097160 19.251369,73.070534 C12.886068,73.054855 9.227548,70.210205 9.110775,65.284119 C8.991345,60.245888 12.907690,57.090271 19.428833,57.072033 C30.076698,57.042259 40.724709,57.063988 51.183678,57.063988 C51.563141,56.593864 51.879574,56.380272 51.926388,56.118473 C56.428867,30.937811 71.598251,17.030745 98.013023,14.033926 C102.803261,13.490462 107.634552,13.142003 112.453003,13.059167 C117.653831,12.969757 120.966324,16.082565 121.122673,20.684353 C121.287643,25.539717 117.983620,28.401745 112.593239,29.080770 C104.059700,30.155739 95.306870,30.791729 87.154800,33.278618 C75.792297,36.744892 69.945129,45.040371 68.322067,57.063622 C81.508308,57.063622 94.648399,57.063137 107.788483,57.064228 C109.454391,57.064369 111.125771,56.987152 112.785179,57.093300 C117.884323,57.419498 121.107437,60.644268 121.039032,65.258537 C120.970772,69.862900 117.709305,73.002274 112.513527,73.040070 C99.686478,73.133377 86.858322,73.075493 74.030617,73.078247 C72.207634,73.078644 70.384644,73.078300 68.234291,73.078300 C69.684692,83.908684 74.877594,92.020988 84.753601,95.805984 C91.778465,98.498268 99.494377,99.427811 106.940926,100.953491 C109.030663,101.381645 111.275566,100.985550 113.419678,101.228683 C118.474678,101.801880 121.439659,105.234016 121.104477,109.904366 C120.788620,114.305405 117.595360,117.098984 112.584740,117.125877 C100.131790,117.192719 88.050018,115.331482 76.354416,109.751411 z" />
                        </svg>
                    </div>
                    {!hideTitle && (
                        <h1 className="text-xl font-bold text-white">VISUAL MIND MAP</h1>
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
                                        className="w-full pl-3 pr-8 py-1.5 text-sm bg-white/5 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-gray-400"
                                        value={search.term}
                                        onChange={(e) => search.setTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={() => search.setIsOpen(!search.isOpen)}
                                    className="p-2 text-gray-300 hover:bg-white/10 hover:text-white rounded-full transition-colors"
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
                                className="p-2 text-gray-300 hover:bg-white/10 hover:text-white rounded-full transition-colors relative"
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
                    <div className="relative">
                        {/* Transparent Overlay for closing dropdown - Managed by ProfileOverlay component below */}
                        {showProfile && <ProfileOverlay onClose={() => setShowProfile(false)} />}

                        <button
                            ref={profileBtnRef}
                            onClick={handleProfileClick}
                            className="flex items-center justify-center pl-4 border-l border-white/10 ml-2 focus:outline-none relative z-[51] group"
                        >
                            <div className={`relative rounded-full transition-transform hover:scale-110 ${userData?.plan === 'ultra' ? 'p-[3px]' :
                                userData?.plan === 'pro' ? 'p-[2.5px]' :
                                    'p-0 ring-1 ring-white/30'
                                }`}>
                                {/* Gradient Background for Animation */}
                                {(userData?.plan === 'pro' || userData?.plan === 'ultra') && (
                                    <div className={`absolute inset-0 rounded-full animate-spin-slow bg-gradient-to-tr ${userData.plan === 'ultra' ? 'from-purple-600 via-fuchsia-400 to-amber-300' : 'from-yellow-300 via-amber-500 to-yellow-600'
                                        }`} />
                                )}

                                {/* Inner Image Container */}
                                <div className="relative z-10 rounded-full bg-zinc-800 overflow-hidden w-[32px] h-[32px] flex items-center justify-center border border-white/10">
                                    {user.photoURL ? (
                                        <Image src={user.photoURL} alt="User" width={32} height={32} className="object-cover w-full h-full" />
                                    ) : (
                                        <div className="w-full h-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                            {user.displayName?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>

                        {showProfile && (
                            <ProfilePanel onClose={() => setShowProfile(false)} onAction={handleAction} position={panelPos} />
                        )}

                    </div>
                ) : (
                    <button
                        onClick={() => router.push('/login')}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 shadow-md transition-all active:scale-95"
                    >
                        Sign In
                    </button>
                )}
            </div>

            {/* Modals managed by Header state - Rendered at root level for proper z-indexing */}
            {activeModal === 'profile' && <ProfileModal isOpen={true} onClose={() => setActiveModal(null)} onSwitchModal={handleAction} />}
            {activeModal === 'upgrade' && <UpgradeModal isOpen={true} onClose={() => setActiveModal(null)} />}
            {activeModal === 'slots' && <BuySlotsModal isOpen={true} onClose={() => setActiveModal(null)} />}
            {activeModal === 'settings' && <SettingsModal isOpen={true} onClose={() => setActiveModal(null)} />}
        </header>
    );
}
// Helper for Overlay
function ProfileOverlay({ onClose }: { onClose: () => void }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-[55] bg-transparent cursor-default" onClick={onClose} />,
        document.body
    );
}
