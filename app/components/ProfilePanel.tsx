'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, PlanType } from '../context/AuthProvider';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; // Direct auth & db
import { getUserRealtimeCounts } from '../services/mindmapService';
import { createPaymentRequest } from '../services/paymentService'; // Payment Service
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import Image from 'next/image';
import { X, Check, Star, Settings, LogOut, User as UserIcon, Shield, Briefcase, Clock, Plus, LayoutDashboard, Loader2, AlertTriangle } from 'lucide-react';

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
    const [counts, setCounts] = useState({ maps: 0, books: 0 });
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
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg text-center border border-zinc-100 dark:border-zinc-600">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{counts.maps}</div>
                        <div className="text-xs text-zinc-500">Mind Maps</div>
                    </div>
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg text-center border border-zinc-100 dark:border-zinc-600">
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.books}</div>
                        <div className="text-xs text-zinc-500">Digital Books</div>
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

    const handlePayment = async () => {
        if (!selectedPlan || !userData || !user) return;
        setProcessing(true);
        setStatusMsg('Creating request...');

        try {
            await createPaymentRequest(user.uid, {
                type: 'upgrade',
                itemId: selectedPlan,
                amount: settings.plans[selectedPlan],
                details: `Upgrade to ${selectedPlan}`
            });

            setStatusMsg('Send your slip');
            setTimeLeft(5);

            // Countdown & Redirect
            let count = 5;
            const timer = setInterval(() => {
                count--;
                setTimeLeft(count);
                if (count <= 0) {
                    clearInterval(timer);
                    const msg = `Hi, I want to upgrade to ${selectedPlan} plan (User ID: ${user.uid}). Here is my payment slip.`;
                    window.open(`https://wa.me/94761779019?text=${encodeURIComponent(msg)}`, '_blank');
                    onClose();
                }
            }, 1000);

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
                    {processing && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            {timeLeft > 0 ? (
                                <>
                                    <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                                    <h4 className="text-xl font-bold mb-1 dark:text-white">{statusMsg}</h4>
                                    <p className="text-zinc-500 text-sm">Redirecting in {timeLeft}s...</p>
                                </>
                            ) : statusMsg.includes('Error') || statusMsg.includes('banned') || statusMsg.includes('wait') ? (
                                <>
                                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                                    <h4 className="text-lg font-bold mb-1 text-center text-red-600 px-4">{statusMsg}</h4>
                                </>
                            ) : (
                                <Loader2 size={48} className="text-blue-600 animate-spin" />
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

                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-center text-red-600 dark:text-red-400 text-sm font-bold space-y-2">
                            <p>IMPORTANT: Please send your Payment Slip and Email Address to our WhatsApp.</p>
                            <p>වැදගත්: කරුණාකර ඔබගේ ගෙවීම් පත (Payment Slip) සහ ඔබගේ Email ලිපිනය අපගේ WhatsApp අංකයට එවන්න.</p>
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={processing}
                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        <span>I have Paid & Send Slip</span>
                    </button>
                    <p className="text-center text-xs text-zinc-400 mt-2">Send a photo of your deposit slip/transfer receipt.</p>
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
    const [statusMsg, setStatusMsg] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);

    const handlePayment = async () => {
        if (!selectedItem || !userData || !user) return;
        setProcessing(true);
        setStatusMsg('Creating request...');

        try {
            await createPaymentRequest(user.uid, {
                type: selectedItem.type,
                itemId: selectedItem.label,
                amount: selectedItem.price,
                details: `Buy ${selectedItem.label} (${selectedItem.type})`
            });

            setStatusMsg('Send your slip');
            setTimeLeft(5);

            // Countdown & Redirect
            let count = 5;
            const timer = setInterval(() => {
                count--;
                setTimeLeft(count);
                if (count <= 0) {
                    clearInterval(timer);
                    const msg = `Hi, I want to buy ${selectedItem.label} (${selectedItem.type}) (User ID: ${user.uid}). Here is my payment slip.`;
                    window.open(`https://wa.me/94761779019?text=${encodeURIComponent(msg)}`, '_blank');
                    onClose();
                }
            }, 1000);

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
                    {processing && (
                        <div className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-200">
                            {timeLeft > 0 ? (
                                <>
                                    <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                                    <h4 className="text-xl font-bold mb-1 dark:text-white">{statusMsg}</h4>
                                    <p className="text-zinc-500 text-sm">Redirecting in {timeLeft}s...</p>
                                </>
                            ) : statusMsg.includes('Error') || statusMsg.includes('banned') || statusMsg.includes('wait') ? (
                                <>
                                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                                    <h4 className="text-lg font-bold mb-1 text-center text-red-600 px-4">{statusMsg}</h4>
                                </>
                            ) : (
                                <Loader2 size={48} className="text-blue-600 animate-spin" />
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

                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-center text-red-600 dark:text-red-400 text-sm font-bold space-y-2">
                            <p>IMPORTANT: Please send your Payment Slip and Email Address to our WhatsApp.</p>
                            <p>වැදගත්: කරුණාකර ඔබගේ ගෙවීම් පත (Payment Slip) සහ ඔබගේ Email ලිපිනය අපගේ WhatsApp අංකයට එවන්න.</p>
                        </div>
                    </div>

                    <button
                        onClick={handlePayment}
                        disabled={processing}
                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        <span>I have Paid & Send Slip</span>
                    </button>
                </div>
            )}
        </Modal>
    );
}

// 4. Settings Modal (Auto-save)
export function SettingsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const { settings, userData, updateAutoSaveInterval } = useAuth();

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
            <div className="space-y-4">
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
            </div>
        </Modal>
    );
}




// 5. Main Profile Panel Dropdown
export default function ProfilePanel({ onClose, onAction, position }: { onClose: () => void, onAction: (modal: 'profile' | 'upgrade' | 'slots' | 'settings') => void, position?: { top: number, right: number } }) {
    const { logout, userData } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleAction = (action: 'profile' | 'upgrade' | 'slots' | 'settings') => {
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
            <MenuItem icon={<Star size={16} />} label="Upgrade to Pro" onClick={() => handleAction('upgrade')} />
            <MenuItem icon={<Plus size={16} />} label="Buy Project Slots" onClick={() => handleAction('slots')} />
            <div className="h-[1px] bg-zinc-100 dark:bg-zinc-700 my-1" />
            <MenuItem icon={<Settings size={16} />} label="Settings" onClick={() => handleAction('settings')} />
            <MenuItem icon={<LogOut size={16} />} label="Logout" onClick={() => { logout(); onClose(); }} danger />
        </div>,
        document.body
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
