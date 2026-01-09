'use client';

import { useState } from 'react';
import { useAuth, PlanType } from '../context/AuthProvider';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; // Direct auth & db
import { doc, setDoc } from 'firebase/firestore';
import Image from 'next/image';
import { X, Check, Star, Settings, LogOut, User as UserIcon, Shield, Briefcase, Clock, Plus } from 'lucide-react';

// --- Reusable Modal Wrapper ---
function Modal({ title, isOpen, onClose, children }: { title: string, isOpen: boolean, onClose: () => void, children: React.ReactNode }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 relative transform transition-all scale-100 border border-zinc-200 dark:border-zinc-700"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X size={20} />
                </button>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-white mb-6">{title}</h3>
                {children}
            </div>
        </div>
    );
}

// 1. Profile Modal
export function ProfileModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { user, userData, refreshUserData } = useAuth();
    const [newName, setNewName] = useState(user?.displayName || '');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const handleUpdateName = async () => {
        if (!user || !newName.trim()) return;
        setLoading(true);
        try {
            await updateProfile(user, { displayName: newName });
            // Sync to Firestore
            await setDoc(doc(db, 'users', user.uid), { displayName: newName }, { merge: true });

            await refreshUserData(); // Sync local state
            setMsg('Name updated!');
            setTimeout(() => setMsg(''), 3000);
        } catch (e) {
            console.error(e);
            setMsg('Error updating name.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!user?.email) return;
        try {
            await sendPasswordResetEmail(auth, user.email);
            setMsg('Password reset email sent!');
        } catch (e) {
            setMsg('Error sending reset email.');
        }
    };

    if (!user || !userData) return null;

    return (
        <Modal title="My Profile" isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-bold mb-3 shadow-inner">
                    {user.photoURL ? <Image src={user.photoURL} alt="User" width={80} height={80} className="rounded-full" /> : (user.displayName?.[0] || 'U')}
                </div>
                <div className="text-zinc-500 text-sm">{user.email}</div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Display Name</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="flex-1 p-2 text-sm rounded border border-zinc-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                        />
                        <button onClick={handleUpdateName} disabled={loading} className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 disabled:opacity-50">
                            Save
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 my-4">
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{userData.totalMaps}</div>
                        <div className="text-xs text-zinc-500">Mind Maps</div>
                    </div>
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg text-center">
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{userData.totalBooks}</div>
                        <div className="text-xs text-zinc-500">Digital Books</div>
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-700 space-y-2">
                    <button onClick={handleResetPassword} className="w-full text-left text-sm text-blue-500 hover:underline">Change Password (Reset Email)</button>
                </div>
            </div>
            {msg && <div className="mt-4 text-sm text-center text-green-500 font-medium">{msg}</div>}
        </Modal>
    );
}


// 2. Upgrade Modal
export function UpgradeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData } = useAuth();
    if (!settings || !userData) return null;

    const plans: PlanType[] = ['pro', 'ultra'];

    return (
        <Modal title="Upgrade Plan" isOpen={isOpen} onClose={onClose}>
            <div className="mb-4 text-center">
                <p className="text-sm text-zinc-500">Current Plan</p>
                <div className="inline-block px-3 py-1 mt-1 font-bold text-white bg-zinc-500 rounded-full capitalize text-sm">
                    {userData.plan}
                </div>
            </div>

            <div className="space-y-3">
                {plans.map(plan => (
                    <div key={plan} className={`p-4 rounded-xl border-2 flex justify-between items-center cursor-pointer transition-all ${userData.plan === plan ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-zinc-200 dark:border-zinc-600 hover:border-blue-400'
                        }`}>
                        <div>
                            <h4 className="font-bold text-lg capitalize flex items-center gap-2 dark:text-white">
                                {plan}
                                {userData.plan === plan && <Check size={16} className="text-green-500" />}
                            </h4>
                            <div className="text-xs text-zinc-500 mt-1">
                                {plan === 'pro' && 'More limits, more pins.'}
                                {plan === 'ultra' && 'Unlimited power.'}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">LKR {settings.plans[plan]}</div>
                            {userData.plan !== plan && (
                                <button className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-full mt-1 hover:bg-blue-700">
                                    Upgrade
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

// 3. Buy Slots Modal
export function BuySlotsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings } = useAuth();
    if (!settings) return null;

    return (
        <Modal title="Buy Extra Slots" isOpen={isOpen} onClose={onClose}>
            <div className="space-y-4">
                <div className="text-sm text-zinc-500 mb-2">Purchase additional project capacity or pins.</div>

                {/* Project Slots */}
                {settings.additionalProjectSlots.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-purple-500 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <Briefcase size={20} />
                            </div>
                            <div>
                                <div className="font-bold dark:text-white">{item.label}</div>
                                <div className="text-xs text-zinc-500">Extra Project Space</div>
                            </div>
                        </div>
                        <button className="px-4 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded-full hover:opacity-90">
                            LKR {item.price}
                        </button>
                    </div>
                ))}

                {/* Just mocking Pins if not in settings, or implementing if parsed */}
                {/* Assuming user mentioned logic similar to above */}
            </div>
        </Modal>
    );
}


// 4. Settings Modal (Auto-save)
export function SettingsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData, updateAutoSaveInterval } = useAuth();
    // In real app, we would update DB user pref here
    // For now mocking local state update via console/alert as DB update logic for general user fields wasn't explicitly asked other than Plan logic reading
    // Actually, "auto saving time - user can select". We should verify locking.

    // Helper to check locked status
    const isLocked = (seconds: number) => {
        if (!userData || !settings) return true;

        // Rules from user description:
        // Free: 1800, 1200 only.
        // Pro: 1800, 1200, 600, 300.
        // Ultra: All.

        // Allowed sets
        const freeAllowed = [1800, 1200];
        const proAllowed = [1800, 1200, 600, 300];

        if (userData.plan === 'ultra') return false;
        if (userData.plan === 'pro') return !proAllowed.includes(seconds);
        return !freeAllowed.includes(seconds); // Free
    };

    if (!settings || !userData) return null;

    return (
        <Modal title="Application Settings" isOpen={isOpen} onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
                        <Clock size={16} /> Auto-Save Interval
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {settings.autoSaveOptions.map(seconds => {
                            const locked = isLocked(seconds);
                            const selected = userData.autoSaveInterval === seconds * 1000;
                            return (
                                <button
                                    key={seconds}
                                    disabled={locked}
                                    onClick={() => updateAutoSaveInterval(seconds * 1000)}
                                    className={`relative p-2 rounded border text-sm transition-all ${selected
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                        : locked
                                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200'
                                            : 'border-zinc-200 hover:border-blue-300 dark:border-zinc-600 dark:text-white dark:hover:border-blue-500'
                                        }`}
                                >
                                    {Math.floor(seconds / 60)} min
                                    {locked && <div className="absolute top-1 right-1"><Shield size={10} className="text-zinc-400" /></div>}
                                </button>
                            );
                        })}
                    </div>
                    {userData.plan === 'free' && <p className="text-xs text-orange-500 mt-2">Upgrade to Pro for faster auto-saving.</p>}
                </div>
            </div>
        </Modal>
    );
}

// 5. Main Profile Panel Dropdown
export default function ProfilePanel({ onClose, onAction }: { onClose: () => void, onAction: (modal: 'profile' | 'upgrade' | 'slots' | 'settings') => void }) {
    const { logout } = useAuth();

    // We render a transparent backdrop to catch outside clicks for the dropdown itself
    // But since Header will handle the outside click for the dropdown via a separate overlay, 
    // here we just render the menu.
    // Actually, simpler to put the backdrop here if we want self-contained close.
    // But Header controls visibility. Let's assume Header handles "Click Outside" to hide this component.

    const handleAction = (action: 'profile' | 'upgrade' | 'slots' | 'settings') => {
        onAction(action);
        // onClose(); // We don't close here, Header handles state, but onAction implies switching view.
    };

    return (
        <div className="absolute top-16 right-6 w-64 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-100 dark:border-zinc-700 py-2 animate-in fade-in slide-in-from-top-2 z-[60]">
            <MenuItem icon={<UserIcon size={16} />} label="Profile" onClick={() => handleAction('profile')} />
            <MenuItem icon={<Star size={16} />} label="Upgrade to Pro" onClick={() => handleAction('upgrade')} highlight />
            <MenuItem icon={<Plus size={16} />} label="Buy Project Slots" onClick={() => handleAction('slots')} />
            <div className="h-[1px] bg-zinc-100 dark:bg-zinc-700 my-1" />
            <MenuItem icon={<Settings size={16} />} label="Settings" onClick={() => handleAction('settings')} />
            <MenuItem icon={<LogOut size={16} />} label="Logout" onClick={() => { logout(); onClose(); }} danger />
        </div>
    );
}

function MenuItem({ icon, label, onClick, highlight, danger }: { icon: any, label: string, onClick: () => void, highlight?: boolean, danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' :
                highlight ? 'text-amber-600 bg-amber-50 mx-2 w-auto rounded-lg hover:bg-amber-100' :
                    'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                }`}
        >
            {icon}
            <span className={highlight ? "font-bold" : "font-medium"}>{label}</span>
        </button>
    );
}
