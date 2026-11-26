'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, PlanType } from '../context/AuthProvider';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase'; // Direct auth & db
import { getUserRealtimeCounts } from '../services/mindmapService';
import { createPaymentRequest } from '../services/paymentService'; // Payment Service
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import Image from 'next/image';
import { X, Check, Star, Settings, LogOut, User as UserIcon, Shield, Briefcase, Clock, Plus, LayoutDashboard, Loader2, AlertTriangle, Crown, HardDrive, Trash2, Lock } from 'lucide-react';
import { getCacheSettings, saveCacheSettings, getCacheStats, clearMediaCache, CacheSettings, CacheStats, DEFAULT_CACHE_SETTINGS } from '../utils/localDB';
import {
    getGoogleDriveClientId,
    hydrateDriveAuth,
    isDriveConnected,
    ensureDriveAccessToken,
    disconnectGoogleDrive,
    getDriveStorageInfo,
    getCachedDriveStorageInfo,
    DriveStorageInfo
} from '../services/googleDriveService';

// --- Reusable Modal Wrapper ---
function Modal({ title, isOpen, onClose, children }: { title: string, isOpen: boolean, onClose: () => void, children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 relative transform transition-all scale-100 border border-zinc-200 dark:border-zinc-700"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-zinc-800 dark:text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body
    );
}

// 1. Profile Modal
export function ProfileModal({ isOpen, onClose, onSwitchModal }: { isOpen: boolean, onClose: () => void, onSwitchModal?: (modal: 'profile' | 'upgrade' | 'slots' | 'settings') => void }) {
    const { user, userData, refreshUserData } = useAuth();
    const [newName, setNewName] = useState(user?.displayName || '');
    const [loading, setLoading] = useState(false);
    const [counts, setCounts] = useState({ maps: 0 });
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (user && isOpen) {
            getUserRealtimeCounts(user.uid).then(setCounts);
        }
    }, [user, isOpen]);

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
                <div className={`relative rounded-full transition-transform mb-3 ${userData?.plan === 'ultra' ? 'p-[4px]' :
                    userData?.plan === 'pro' ? 'p-[3px]' :
                        'p-0 ring-4 ring-zinc-100 dark:ring-zinc-700'
                    }`}>
                    {/* Gradient Background */}
                    {(userData?.plan === 'pro' || userData?.plan === 'ultra') && (
                        <div className={`absolute inset-0 rounded-full animate-spin-slow bg-gradient-to-tr ${userData.plan === 'ultra' ? 'from-purple-600 via-fuchsia-400 to-amber-300' : 'from-yellow-300 via-amber-500 to-yellow-600'
                            }`} />
                    )}

                    <div className="relative z-10 w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-bold shadow-inner overflow-hidden border-4 border-white dark:border-zinc-800">
                        {user.photoURL ? <Image src={user.photoURL} alt="User" width={80} height={80} className="object-cover w-full h-full" /> : (user.displayName?.[0]?.toUpperCase() || 'U')}
                    </div>
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

                <div className="my-4">
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg text-center border border-zinc-100 dark:border-zinc-600">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{counts.maps}</div>
                        <div className="text-xs text-zinc-500">Mind Maps</div>
                    </div>
                </div>

                {/* Plan Info */}
                <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                    <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-bold">Current Plan</div>
                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300 capitalize">{userData.plan}</div>
                        {userData.plan !== 'free' && userData.planExpiresAt && (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex flex-col">
                                <span>Expires: {new Date(userData.planExpiresAt).toLocaleDateString()}</span>
                                <span className={`font-bold ${Math.ceil((userData.planExpiresAt - Date.now()) / (86400000)) <= 3 ? 'text-red-500' : 'text-green-600'}`}>
                                    {Math.max(0, Math.ceil((userData.planExpiresAt - Date.now()) / (86400000)))} days left
                                </span>
                            </div>
                        )}
                    </div>
                    {userData.plan !== 'ultra' && (
                        <button
                            onClick={() => onSwitchModal?.('upgrade')}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-700 transition-colors"
                        >
                            Upgrade
                        </button>
                    )}
                </div>

                {/* Extra Resources */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <div className="flex items-center gap-2">
                            <Briefcase size={16} className="text-purple-500" />
                            <span className="text-sm text-zinc-600 dark:text-zinc-300">Extra Projects</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-800 dark:text-white">{userData.extraSlots}</span>
                            <button onClick={() => onSwitchModal?.('slots')} className="p-1 text-zinc-400 hover:text-green-600 hover:bg-green-50 rounded">
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <div className="flex items-center gap-2">
                            <div className="rotate-45"><Shield size={16} className="text-pink-500" /></div>
                            <span className="text-sm text-zinc-600 dark:text-zinc-300">Extra Pins</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-800 dark:text-white">{userData.extraPins}</span>
                            <button onClick={() => onSwitchModal?.('slots')} className="p-1 text-zinc-400 hover:text-green-600 hover:bg-green-50 rounded">
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-700 space-y-2">
                    <button onClick={handleResetPassword} className="w-full text-left text-sm text-blue-500 hover:underline">Change Password (Reset Email)</button>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-700 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-zinc-400 dark:text-zinc-500">
                    <a href="/terms" className="hover:text-blue-500 hover:underline transition-colors">Terms & Conditions</a>
                    <a href="/privacy" className="hover:text-blue-500 hover:underline transition-colors">Privacy Policy</a>
                    <a href="/about" className="hover:text-blue-500 hover:underline transition-colors">About</a>
                    <a href="/docs" className="hover:text-blue-500 hover:underline transition-colors">Docs</a>
                </div>
            </div>
            {msg && <div className="mt-4 text-sm text-center text-green-500 font-medium">{msg}</div>}
        </Modal>
    );
}


// 2. Upgrade Modal
// 2. Upgrade Modal
export function UpgradeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData, refreshSettings, user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            refreshSettings?.();
        }
    }, [isOpen, refreshSettings]);

    if (!settings) return null;

    const currentPlan = userData?.plan || 'free';
    const plans: PlanType[] = ['pro', 'ultra'];
    const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);

    const [processing, setProcessing] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState('');
    const [success, setSuccess] = useState(false);

    const handlePayment = async () => {
        if (!selectedPlan || !userData || !user) return;
        if (!file) {
            setFileError('Please attach your payment slip first.');
            return;
        }

        setProcessing(true);

        try {
            setStatusMsg('Uploading slip...');
            const slipRef = ref(storage, `slips/${user.uid}_${Date.now()}_${file.name}`);
            await uploadBytes(slipRef, file);
            const slipUrl = await getDownloadURL(slipRef);

            setStatusMsg('Creating request...');
            await createPaymentRequest(user.uid, user.email, {
                type: 'upgrade',
                itemId: selectedPlan,
                amount: settings.plans[selectedPlan],
                details: `Upgrade to ${selectedPlan}`,
                slipUrl
            });

            setProcessing(false);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setStatusMsg(err.message || 'Error occurred');
            setTimeout(() => {
                setProcessing(false);
                setStatusMsg('');
            }, 3000);
        }
    };

    return (
        <Modal title="Upgrade Plan" isOpen={isOpen} onClose={onClose}>
            {!selectedPlan ? (
                <>
                    <div className="mb-4 text-center">
                        <p className="text-sm text-zinc-500">Current Plan</p>
                        <div className="inline-block px-3 py-1 mt-1 font-bold text-white bg-zinc-500 rounded-full capitalize text-sm">
                            {currentPlan}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {plans.map(plan => (
                            <div key={plan} className={`p-4 rounded-xl border-2 flex justify-between items-center cursor-pointer transition-all ${currentPlan === plan ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-zinc-200 dark:border-zinc-600 hover:border-blue-400'
                                }`}>
                                <div>
                                    <h4 className="font-bold text-lg capitalize flex items-center gap-2 dark:text-white">
                                        {plan}
                                        {currentPlan === plan && <Check size={16} className="text-green-500" />}
                                    </h4>
                                    <div className="text-xs text-zinc-500 mt-1">
                                        {plan === 'pro' && 'More limits, more pins.'}
                                        {plan === 'ultra' && 'Unlimited power.'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">LKR {settings.plans[plan]}</div>
                                    {currentPlan !== plan && (
                                        <button
                                            onClick={() => {
                                                if (userData) {
                                                    setSelectedPlan(plan);
                                                } else {
                                                    // Redirect to login or show msg
                                                    // For now, let's close and maybe redirect? 
                                                    // Or just show button as "Login"
                                                    router.push('/login');
                                                    onClose();
                                                }
                                            }}
                                            className={`text-xs px-3 py-1.5 rounded-full mt-1 ${userData ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-zinc-800 text-white hover:bg-zinc-900'} `}
                                        >
                                            {userData ? 'Upgrade' : 'Login to Upgrade'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="animate-in slide-in-from-right duration-200 relative">
                    {success && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-4">
                                <Check size={32} />
                            </div>
                            <h4 className="text-xl font-bold mb-2 dark:text-white text-center">Submit Successful!</h4>
                            <p className="text-zinc-500 text-sm text-center px-6">Thank you for purchasing. Please wait until an admin approves your request.</p>
                            <button onClick={onClose} className="mt-8 bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30">
                                Close Window
                            </button>
                        </div>
                    )}

                    {processing && !success && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            {statusMsg.includes('Error') || statusMsg.includes('banned') || statusMsg.includes('wait') ? (
                                <>
                                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                                    <h4 className="text-lg font-bold mb-1 text-center text-red-600 px-4">{statusMsg}</h4>
                                </>
                            ) : (
                                <>
                                    <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                                    <h4 className="text-xl font-bold mb-1 dark:text-white">{statusMsg}</h4>
                                </>
                            )}
                        </div>
                    )}

                    <button onClick={() => setSelectedPlan(null)} disabled={processing} className="text-xs text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">
                        ← Back to plans
                    </button>

                    <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-600 mb-4">
                        <h4 className="font-bold text-lg mb-2 dark:text-white capitalize">Upgrade to {selectedPlan}</h4>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-4">LKR {settings.plans[selectedPlan]}</div>

                        <div className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 mb-4">
                            <p>To initialize the upgrade, please deposit the amount to the following bank account:</p>
                        </div>

                        <div className="bg-white dark:bg-zinc-800 p-3 rounded border border-zinc-200 dark:border-zinc-600 text-sm space-y-1">
                            <div className="flex justify-between"><span className="text-zinc-500">Bank:</span> <span className="font-bold dark:text-white">{settings.bankDetails.bankName}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Branch:</span> <span className="font-bold dark:text-white">{settings.bankDetails.branch}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Acc No:</span> <span className="font-bold dark:text-white tracking-widest">{settings.bankDetails.accountNumber}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Name:</span> <span className="font-bold dark:text-white">{settings.bankDetails.accountHolder}</span></div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg text-sm space-y-2">
                            <label className="block font-bold text-blue-800 dark:text-blue-300 mb-1">Upload Payment Slip (Max 2MB)</label>
                            <input 
                                type="file" 
                                accept="image/*,.pdf" 
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const selected = e.target.files[0];
                                        if (selected.size > 2 * 1024 * 1024) {
                                            setFileError('File size must be less than 2MB');
                                            setFile(null);
                                        } else {
                                            setFileError('');
                                            setFile(selected);
                                        }
                                    }
                                }}
                                className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"
                            />
                            {fileError && <p className="text-red-500 text-xs font-bold mt-1">{fileError}</p>}
                            {file && !fileError && <p className="text-green-600 text-xs font-bold mt-1">File attached: {file.name}</p>}
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={processing || !file}
                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        <span>Submit Request</span>
                    </button>
                </div>
            )}
        </Modal>
    );
}

// 3. Buy Slots Modal
export function BuySlotsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData, refreshSettings, user } = useAuth();
    const router = useRouter();
    const [selectedItem, setSelectedItem] = useState<{ label: string, price: number, type: 'slots' | 'pins' } | null>(null);

    useEffect(() => {
        if (isOpen) {
            refreshSettings?.();
        }
    }, [isOpen, refreshSettings]);

    if (!settings) return null;

    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState('');

    const handlePayment = async () => {
        if (!selectedItem || !userData || !user) return;
        if (!file) {
            setFileError('Please attach your payment slip first.');
            return;
        }

        setProcessing(true);

        try {
            setStatusMsg('Uploading slip...');
            const slipRef = ref(storage, `slips/${user.uid}_${Date.now()}_${file.name}`);
            await uploadBytes(slipRef, file);
            const slipUrl = await getDownloadURL(slipRef);

            setStatusMsg('Creating request...');

            await createPaymentRequest(user.uid, user.email, {
                type: selectedItem.type,
                itemId: selectedItem.label,
                amount: selectedItem.price,
                details: `Buy ${selectedItem.label} (${selectedItem.type})`,
                slipUrl
            });

            setProcessing(false);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setStatusMsg(err.message || 'Error occurred');
            setTimeout(() => {
                setProcessing(false);
                setStatusMsg('');
            }, 3000);
        }
    };

    const handleItemClick = (item: any, type: 'slots' | 'pins') => {
        if (userData) {
            setSelectedItem({ ...item, type });
        } else {
            router.push('/login');
            onClose();
        }
    };

    return (
        <Modal title={selectedItem ? "Confirm Purchase" : "Buy Extra Resources"} isOpen={isOpen} onClose={onClose}>
            {!selectedItem ? (
                <div className="space-y-4">
                    <div className="text-sm text-zinc-500 mb-2">Purchase additional project capacity or pins.</div>

                    {/* Project Slots */}
                    {settings.additionalProjectSlots.map((item, i) => (
                        <div key={'proj' + i} className="flex justify-between items-center p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-purple-500 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Briefcase size={20} />
                                </div>
                                <div>
                                    <div className="font-bold dark:text-white capitalize">{item.label}</div>
                                    <div className="text-xs text-zinc-500">Extra Project Space</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleItemClick(item, 'slots')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-full hover:opacity-90 ${userData ? 'bg-zinc-900 dark:bg-white text-white dark:text-black' : 'bg-zinc-200 text-zinc-500'}`}
                            >
                                {userData ? `LKR ${item.price}` : 'Login'}
                            </button>
                        </div>
                    ))}

                    {/* Pin Slots */}
                    {settings.additionalPinSlots.map((item, i) => (
                        <div key={'pin' + i} className="flex justify-between items-center p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-pink-500 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <div className="font-bold dark:text-white capitalize">{item.label}</div>
                                    <div className="text-xs text-zinc-500">Extra Pins</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleItemClick(item, 'pins')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-full hover:opacity-90 ${userData ? 'bg-zinc-900 dark:bg-white text-white dark:text-black' : 'bg-zinc-200 text-zinc-500'}`}
                            >
                                {userData ? `LKR ${item.price}` : 'Login'}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="animate-in slide-in-from-right duration-200 relative">
                    {success && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-4">
                                <Check size={32} />
                            </div>
                            <h4 className="text-xl font-bold mb-2 dark:text-white text-center">Submit Successful!</h4>
                            <p className="text-zinc-500 text-sm text-center px-6">Thank you for purchasing. Please wait until an admin approves your request.</p>
                            <button onClick={onClose} className="mt-8 bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30">
                                Close Window
                            </button>
                        </div>
                    )}

                    {processing && !success && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            {statusMsg.includes('Error') || statusMsg.includes('banned') || statusMsg.includes('wait') ? (
                                <>
                                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                                    <h4 className="text-lg font-bold mb-1 text-center text-red-600 px-4">{statusMsg}</h4>
                                </>
                            ) : (
                                <>
                                    <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                                    <h4 className="text-xl font-bold mb-1 dark:text-white">{statusMsg}</h4>
                                </>
                            )}
                        </div>
                    )}

                    <button onClick={() => setSelectedItem(null)} disabled={processing} className="text-xs text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">
                        ← Back to items
                    </button>

                    <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-600 mb-4">
                        <h4 className="font-bold text-lg mb-2 dark:text-white capitalize">Buy {selectedItem.label}</h4>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-4">LKR {selectedItem.price}</div>

                        <div className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 mb-4">
                            <p>To purchase this item, please deposit the amount to the following bank account:</p>
                        </div>

                        <div className="bg-white dark:bg-zinc-800 p-3 rounded border border-zinc-200 dark:border-zinc-600 text-sm space-y-1">
                            <div className="flex justify-between"><span className="text-zinc-500">Bank:</span> <span className="font-bold dark:text-white">{settings.bankDetails.bankName}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Branch:</span> <span className="font-bold dark:text-white">{settings.bankDetails.branch}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Acc No:</span> <span className="font-bold dark:text-white tracking-widest">{settings.bankDetails.accountNumber}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Name:</span> <span className="font-bold dark:text-white">{settings.bankDetails.accountHolder}</span></div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg text-sm space-y-2">
                            <label className="block font-bold text-blue-800 dark:text-blue-300 mb-1">Upload Payment Slip (Max 2MB)</label>
                            <input 
                                type="file" 
                                accept="image/*,.pdf" 
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const selected = e.target.files[0];
                                        if (selected.size > 2 * 1024 * 1024) {
                                            setFileError('File size must be less than 2MB');
                                            setFile(null);
                                        } else {
                                            setFileError('');
                                            setFile(selected);
                                        }
                                    }
                                }}
                                className="w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"
                            />
                            {fileError && <p className="text-red-500 text-xs font-bold mt-1">{fileError}</p>}
                            {file && !fileError && <p className="text-green-600 text-xs font-bold mt-1">File attached: {file.name}</p>}
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={processing || !file}
                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        <span>Submit Request</span>
                    </button>
                </div>
            )}
        </Modal>
    );
}

// 4. Settings Modal (Auto-save + Smart Cache Manager)
export function SettingsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData, updateAutoSaveInterval } = useAuth();
    const [cacheSettings, setCacheSettings] = useState<CacheSettings>(DEFAULT_CACHE_SETTINGS);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [clearingType, setClearingType] = useState<'image' | 'video' | null>(null);
    const [driveConnected, setDriveConnected] = useState(false);
    const [driveInfo, setDriveInfo] = useState<DriveStorageInfo | null>(null);
    const [driveBusy, setDriveBusy] = useState(false);
    const hasDriveClient = !!getGoogleDriveClientId();

    const loadCacheInfo = async () => {
        try {
            const [cs, stats] = await Promise.all([getCacheSettings(), getCacheStats(), hydrateDriveAuth()]);
            setCacheSettings(cs);
            setCacheStats(stats);
            const connected = isDriveConnected();
            setDriveConnected(connected);
            if (connected) {
                const cached = getCachedDriveStorageInfo();
                setDriveInfo(cached || (await getDriveStorageInfo(false)));
            } else {
                setDriveInfo(null);
            }
        } catch (e) {
            console.error("Failed to load cache stats", e);
        }
    };

    useEffect(() => {
        if (isOpen) loadCacheInfo();
    }, [isOpen]);

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const handleToggleCache = async (field: 'imagesCache' | 'videosCache') => {
        const updated = await saveCacheSettings({ [field]: !cacheSettings[field] });
        setCacheSettings(updated);
    };

    const handleLimitChange = async (field: 'maxImageCacheMB' | 'maxVideoCacheMB', mb: number) => {
        const clamped = Math.max(10, Math.min(field === 'maxImageCacheMB' ? 5120 : 10240, mb));
        const updated = await saveCacheSettings({ [field]: clamped });
        setCacheSettings(updated);
        await loadCacheInfo();
    };

    const handleClearCache = async (type: 'image' | 'video') => {
        setClearingType(type);
        try {
            await clearMediaCache(type);
            await loadCacheInfo();
        } finally {
            setClearingType(null);
        }
    };

    // Helper to check locked status
    const isLocked = (minPlan: string) => {
        if (!userData) return true;
        if (userData.plan === 'ultra') return false;
        if (userData.plan === 'pro') return minPlan === 'ultra';
        return minPlan === 'pro' || minPlan === 'ultra';
    };

    if (!settings || !userData) return null;

    return (
        <Modal title="Application Settings" isOpen={isOpen} onClose={onClose}>
            <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
                        <Clock size={16} /> Auto-Save Interval
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {settings.autoSaveOptions.map((option, i) => {
                            const locked = isLocked(option.minPlan);
                            const selected = userData.autoSaveInterval === option.value;
                            return (
                                <button
                                    key={i}
                                    disabled={locked}
                                    onClick={() => updateAutoSaveInterval(option.value)}
                                    className={`relative p-2 rounded border text-sm transition-all ${selected
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                        : locked
                                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border-zinc-200'
                                            : 'border-zinc-200 hover:border-blue-300 dark:border-zinc-600 dark:text-white dark:hover:border-blue-500'
                                        }`}
                                >
                                    {option.label}
                                    {locked && <div className="absolute top-1 right-1"><Shield size={10} className="text-zinc-400" /></div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Smart Cache & Local Storage Manager */}
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                            <HardDrive size={16} className="text-blue-500" /> Smart Local Cache (IndexedDB)
                        </label>
                        {cacheStats && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                Total: {formatBytes(cacheStats.totalBytes)}
                            </span>
                        )}
                    </div>

                    <div className="space-y-2.5">
                        {/* Google Drive Media Connection */}
                        {hasDriveClient && (
                            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <svg width="20" height="20" viewBox="0 0 87.3 78" className="shrink-0">
                                        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                    </svg>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Google Drive</div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                            {driveConnected
                                                ? driveInfo
                                                    ? `Connected • Free: ${(driveInfo.freeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                                                    : 'Connected for media storage'
                                                : 'Not connected'}
                                        </p>
                                    </div>
                                </div>
                                {driveConnected ? (
                                    <button
                                        type="button"
                                        disabled={driveBusy}
                                        onClick={async () => {
                                            setDriveBusy(true);
                                            try {
                                                await disconnectGoogleDrive();
                                                await loadCacheInfo();
                                            } finally {
                                                setDriveBusy(false);
                                            }
                                        }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 shrink-0"
                                    >
                                        {driveBusy ? '...' : 'Disconnect'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={driveBusy}
                                        onClick={async () => {
                                            setDriveBusy(true);
                                            try {
                                                await ensureDriveAccessToken(true);
                                                await getDriveStorageInfo(true);
                                                await loadCacheInfo();
                                            } catch (err) {
                                                console.error(err);
                                            } finally {
                                                setDriveBusy(false);
                                            }
                                        }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white shrink-0"
                                    >
                                        {driveBusy ? '...' : 'Connect'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Maps Cache (Always ON) */}
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700">
                            <div>
                                <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                    <span>Maps Cache</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                        <Lock size={9} /> Always ON
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {cacheStats ? `${cacheStats.mapsCount} maps • ${formatBytes(cacheStats.mapsBytes)}` : 'Instant offline & zero-read loading'}
                                </p>
                            </div>
                            <div className="w-10 h-5 rounded-full bg-emerald-500/80 flex items-center justify-end px-0.5 cursor-not-allowed opacity-80" title="Required for fast loading">
                                <div className="w-4 h-4 rounded-full bg-white shadow" />
                            </div>
                        </div>

                        {/* Images Cache (Default ON) */}
                        <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Images Cache</div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {cacheStats ? `${cacheStats.imagesCount} cached • ${formatBytes(cacheStats.imagesBytes)} / ${cacheSettings.maxImageCacheMB} MB` : 'Skip re-downloading loaded images'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {cacheStats && cacheStats.imagesBytes > 0 && (
                                        <button
                                            onClick={() => handleClearCache('image')}
                                            disabled={clearingType === 'image'}
                                            className="p-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                            title="Clear Images Cache"
                                        >
                                            {clearingType === 'image' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleToggleCache('imagesCache')}
                                        className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${cacheSettings.imagesCache ? 'bg-blue-500 justify-end' : 'bg-zinc-300 dark:bg-zinc-600 justify-start'}`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-white shadow" />
                                    </button>
                                </div>
                            </div>
                            {cacheSettings.imagesCache && (
                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-200/70 dark:border-zinc-700/70">
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Storage Limit:</span>
                                    <div className="flex items-center gap-1 flex-wrap justify-end">
                                        {[50, 100, 200, 500, 1024].map((mb) => (
                                            <button
                                                key={mb}
                                                type="button"
                                                onClick={() => handleLimitChange('maxImageCacheMB', mb)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${cacheSettings.maxImageCacheMB === mb
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600 hover:border-blue-400'
                                                }`}
                                            >
                                                {mb >= 1024 ? '1GB' : `${mb}MB`}
                                            </button>
                                        ))}
                                        <input
                                            type="number"
                                            min={10}
                                            max={5120}
                                            value={cacheSettings.maxImageCacheMB}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (!isNaN(v)) setCacheSettings(prev => ({ ...prev, maxImageCacheMB: v }));
                                            }}
                                            onBlur={(e) => handleLimitChange('maxImageCacheMB', parseInt(e.target.value, 10) || 200)}
                                            className="w-14 px-1.5 py-0.5 text-[10px] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-right"
                                            title="Custom limit in MB (10 - 5120)"
                                        />
                                        <span className="text-[10px] text-zinc-400">MB</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Videos Cache (Default OFF) */}
                        <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Videos Cache</div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {cacheStats ? `${cacheStats.videosCount} cached • ${formatBytes(cacheStats.videosBytes)} / ${cacheSettings.maxVideoCacheMB} MB` : 'Uses more device storage (Default OFF)'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {cacheStats && cacheStats.videosBytes > 0 && (
                                        <button
                                            onClick={() => handleClearCache('video')}
                                            disabled={clearingType === 'video'}
                                            className="p-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                            title="Clear Videos Cache"
                                        >
                                            {clearingType === 'video' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleToggleCache('videosCache')}
                                        className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${cacheSettings.videosCache ? 'bg-blue-500 justify-end' : 'bg-zinc-300 dark:bg-zinc-600 justify-start'}`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-white shadow" />
                                    </button>
                                </div>
                            </div>
                            {cacheSettings.videosCache && (
                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-200/70 dark:border-zinc-700/70">
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Storage Limit:</span>
                                    <div className="flex items-center gap-1 flex-wrap justify-end">
                                        {[100, 300, 500, 1024, 2048].map((mb) => (
                                            <button
                                                key={mb}
                                                type="button"
                                                onClick={() => handleLimitChange('maxVideoCacheMB', mb)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${cacheSettings.maxVideoCacheMB === mb
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600 hover:border-blue-400'
                                                }`}
                                            >
                                                {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
                                            </button>
                                        ))}
                                        <input
                                            type="number"
                                            min={10}
                                            max={10240}
                                            value={cacheSettings.maxVideoCacheMB}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (!isNaN(v)) setCacheSettings(prev => ({ ...prev, maxVideoCacheMB: v }));
                                            }}
                                            onBlur={(e) => handleLimitChange('maxVideoCacheMB', parseInt(e.target.value, 10) || 300)}
                                            className="w-14 px-1.5 py-0.5 text-[10px] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-right"
                                            title="Custom limit in MB (10 - 10240)"
                                        />
                                        <span className="text-[10px] text-zinc-400">MB</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}




// 5. Main Profile Panel Dropdown
export default function ProfilePanel({ onClose, onAction, position }: { onClose: () => void, onAction: (modal: 'profile' | 'upgrade' | 'slots' | 'settings' | 'shop-plans' | 'shop-slots') => void, position?: { top: number, right: number } }) {
    const { logout, userData } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleAction = (action: 'profile' | 'upgrade' | 'slots' | 'settings' | 'shop-plans' | 'shop-slots') => {
        onAction(action);
    };

    if (!mounted) return null;

    const style = position ? { top: position.top, right: position.right } : { top: '100%', right: 0 }; // Fallback if no position passed

    return createPortal(
        <div
            className="fixed w-64 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-100 dark:border-zinc-700 py-2 animate-in fade-in slide-in-from-top-2 z-[60]"
            style={style}
        >
            <MenuItem icon={<UserIcon size={16} />} label="Profile" onClick={() => handleAction('profile')} />
            {userData?.role === 'admin' && (
                <MenuItem icon={<LayoutDashboard size={16} />} label="Admin Panel" onClick={() => { onClose(); router.push('/admin'); }} highlight />
            )}
            
            {/* Dynamic Upgrade Button */}
            {userData?.plan === 'ultra' ? (
                <MenuItem icon={<Crown size={16} className="text-purple-400" />} label="Ultra Active" onClick={() => {}} disabled />
            ) : userData?.plan === 'pro' ? (
                <button
                    onClick={() => handleAction('shop-plans')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-purple-400 hover:bg-purple-500/10 font-bold"
                >
                    <Crown size={16} />
                    <span>Upgrade to Ultra</span>
                </button>
            ) : (
                <button
                    onClick={() => handleAction('shop-plans')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative overflow-hidden hover:bg-amber-500/10 font-bold group"
                >
                    <Star size={16} className="text-amber-500" />
                    <span className="bg-[linear-gradient(110deg,#f59e0b,45%,#fde68a,55%,#f59e0b)] bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]">
                        Upgrade to Pro
                    </span>
                </button>
            )}

            <MenuItem icon={<Plus size={16} />} label="Buy Project Slots" onClick={() => handleAction('shop-slots')} />
            <div className="h-[1px] bg-zinc-100 dark:bg-zinc-700 my-1" />
            <MenuItem icon={<Settings size={16} />} label="Settings" onClick={() => handleAction('settings')} />
            <MenuItem icon={<LogOut size={16} />} label="Logout" onClick={() => { logout(); onClose(); }} danger />
        </div>,
        document.body
    );
}

function MenuItem({ icon, label, onClick, highlight, danger, disabled }: { icon: any, label: string, onClick: () => void, highlight?: boolean, danger?: boolean, disabled?: boolean }) {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${disabled ? 'opacity-50 cursor-default' : danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' :
                highlight ? 'text-amber-600 bg-amber-50 mx-2 w-auto rounded-lg hover:bg-amber-100' :
                    'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                }`}
        >
            {icon}
            <span className={highlight ? "font-bold" : disabled ? "font-medium text-zinc-400" : "font-medium"}>{label}</span>
        </button>
    );
}
