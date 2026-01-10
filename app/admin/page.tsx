'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { approvePayment, getPayments, rejectPayment } from '../services/paymentService';
import { Loader2, Check, X, ShieldAlert, History, Star, Briefcase, Shield, ArrowLeft } from 'lucide-react';
import { getDoc, setDoc, doc } from 'firebase/firestore';

// Helper for Relative Time
function timeAgo(date: number) {
    const seconds = Math.floor((Date.now() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// --- Settings Editor Component ---
function SettingsEditor() {
    const { refreshSettings } = useAuth();
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    const loadSettings = async () => {
        setLoading(true);
        try {
            const docs = {
                plans: await getDoc(doc(db, 'settings', 'plans')),
                pins: await getDoc(doc(db, 'settings', 'pin_settings')),
                limits: await getDoc(doc(db, 'settings', 'default_project_limit')),
                bank: await getDoc(doc(db, 'settings', 'bank_details')),
                addSlots: await getDoc(doc(db, 'settings', 'additional_project_items')),
                addPins: await getDoc(doc(db, 'settings', 'additional_project_pins'))
            };
            setConfig({
                plans: docs.plans.data() || {},
                pins: docs.pins.data() || {},
                limits: docs.limits.data() || {},
                bank: docs.bank.data() || {},
                addSlots: docs.addSlots.data() || {},
                addPins: docs.addPins.data() || {}
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async (section: string, data: any) => {
        if (!confirm('Save changes?')) return;
        setLoading(true);
        try {
            let col = 'settings';
            let docId = '';
            if (section === 'plans') docId = 'plans';
            if (section === 'pins') docId = 'pin_settings';
            if (section === 'limits') docId = 'default_project_limit';
            if (section === 'bank') docId = 'bank_details';
            if (section === 'addSlots') docId = 'additional_project_items';
            if (section === 'addPins') docId = 'additional_project_pins';

            // For dynamic lists (addSlots/addPins), we overwrite to support deletion. For others, merge is fine/safer.
            const overwrite = section === 'addSlots' || section === 'addPins';
            await setDoc(doc(db, col, docId), data, { merge: !overwrite });

            setMsg('Saved!');
            setTimeout(() => setMsg(''), 3000);
            await refreshSettings();
        } catch (e) {
            alert('Error saving');
        } finally {
            setLoading(false);
        }
    };

    // Helper for List Management
    const ListEditor = ({ title, data, type, section }: { title: string, data: any, type: 'Slots' | 'Pins', section: string }) => {
        const [qty, setQty] = useState('');
        const [price, setPrice] = useState('');

        const handleAdd = () => {
            if (!qty || !price) return;
            const key = `${qty} ${type}`; // e.g., "5 Slots"
            const newData = { ...data, [key]: parseInt(price) };
            setConfig({ ...config, [section]: newData });
            setQty('');
            setPrice('');
        };

        const handleDelete = (key: string) => {
            const newData = { ...data };
            delete newData[key];
            setConfig({ ...config, [section]: newData });
        };

        return (
            <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2">
                    {type === 'Slots' ? <Briefcase size={16} /> : <Shield size={16} />}
                    {title}
                </h3>

                {/* Internal CSS for ListEditor can go here or use Tailwind */}
                <div className="space-y-2 mb-4">
                    {Object.entries(data).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center p-2 bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-600">
                            <div>
                                <span className="font-bold dark:text-white">{key}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-zinc-600 dark:text-zinc-300 font-mono">LKR {val as number}</span>
                                <button onClick={() => handleDelete(key)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={14} /></button>
                            </div>
                        </div>
                    ))}
                    {Object.keys(data).length === 0 && <div className="text-center text-zinc-400 text-xs italic">No items defined</div>}
                </div>

                <div className="flex gap-2 items-end border-t border-zinc-200 dark:border-zinc-600 pt-3">
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Qty ({type})</label>
                        <input
                            type="number"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                            placeholder="e.g. 5"
                            className="w-20 p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white text-sm"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Price (LKR)</label>
                        <input
                            type="number"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            placeholder="e.g. 500"
                            className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white text-sm"
                        />
                    </div>
                    <button onClick={handleAdd} disabled={!qty || !price} className="bg-zinc-800 dark:bg-zinc-200 dark:text-black text-white px-3 py-2 rounded text-sm font-bold hover:opacity-90 disabled:opacity-50">
                        Add
                    </button>
                </div>
                <div className="mt-4 text-right">
                    <button onClick={() => handleSave(section, data)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-700">Save List</button>
                </div>
            </div>
        );
    };

    if (loading && !config) return <div className="py-10 text-center"><Loader2 className="animate-spin inline" /></div>;

    if (!config) {
        return (
            <div className="p-8 text-center bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-1">Access Denied or Data Error</h3>
                <p className="text-red-600/80 dark:text-red-400/80 text-sm">Failed to load settings. Ensure you have the correct permissions.</p>
                <button onClick={loadSettings} className="mt-4 text-xs bg-red-100 dark:bg-red-800 hover:bg-red-200 dark:hover:bg-red-700 text-red-700 dark:text-red-200 px-3 py-1.5 rounded font-bold transition-colors">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {msg && <div className="p-3 bg-green-100 text-green-700 rounded text-center font-bold animate-in fade-in">{msg}</div>}

            {/* Plans */}
            <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2"><Star size={16} /> Subscription Prices (LKR)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['free', 'pro', 'ultra'].map(plan => (
                        <div key={plan}>
                            <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">{plan}</label>
                            <input
                                type="number"
                                value={config.plans[plan] || 0}
                                onChange={e => setConfig({ ...config, plans: { ...config.plans, [plan]: parseInt(e.target.value) } })}
                                className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-4 text-right">
                    <button onClick={() => handleSave('plans', config.plans)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700">Save Prices</button>
                </div>
            </div>

            {/* Dynamic Lists */}
            <div className="grid md:grid-cols-2 gap-6">
                <ListEditor title="Additional Project Slots" data={config.addSlots} type="Slots" section="addSlots" />
                <ListEditor title="Additional Pin Slots" data={config.addPins} type="Pins" section="addPins" />
            </div>

            {/* Limits */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2"><Briefcase size={16} /> Default Project Limits (By Plan)</h3>
                    <div className="space-y-3">
                        {['free', 'pro', 'ultra'].map(plan => (
                            <div key={plan} className="flex justify-between items-center">
                                <label className="text-sm capitalize dark:text-zinc-300">{plan}</label>
                                <input
                                    type="number"
                                    value={config.limits[plan] || 0}
                                    onChange={e => setConfig({ ...config, limits: { ...config.limits, [plan]: parseInt(e.target.value) } })}
                                    className="w-24 p-1 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white text-right"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 text-right">
                        <button onClick={() => handleSave('limits', config.limits)} className="bg-zinc-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:opacity-90">Update Limits</button>
                    </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2"><Shield size={16} /> Default Pin Limits (By Plan)</h3>
                    <div className="space-y-3">
                        {['free', 'pro', 'ultra'].map(plan => (
                            <div key={plan} className="flex justify-between items-center">
                                <label className="text-sm capitalize dark:text-zinc-300">{plan}</label>
                                <input
                                    type="number"
                                    value={config.pins[plan] || 0}
                                    onChange={e => setConfig({ ...config, pins: { ...config.pins, [plan]: parseInt(e.target.value) } })}
                                    className="w-24 p-1 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white text-right"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 text-right">
                        <button onClick={() => handleSave('pins', config.pins)} className="bg-zinc-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:opacity-90">Update Pins</button>
                    </div>
                </div>
            </div>

            {/* Bank Details */}
            <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2"><History size={16} /> Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Bank Name</label>
                        <input
                            type="text"
                            value={config.bank.bank_name || ''}
                            onChange={e => setConfig({ ...config, bank: { ...config.bank, bank_name: e.target.value } })}
                            className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Branch</label>
                        <input
                            type="text"
                            value={config.bank.banch || ''}
                            onChange={e => setConfig({ ...config, bank: { ...config.bank, banch: e.target.value } })}
                            className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Account Number</label>
                        <input
                            type="text"
                            value={config.bank.account_number || ''}
                            onChange={e => setConfig({ ...config, bank: { ...config.bank, account_number: e.target.value } })}
                            className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Holder Name</label>
                        <input
                            type="text"
                            value={config.bank.account_holder_name || ''}
                            onChange={e => setConfig({ ...config, bank: { ...config.bank, account_holder_name: e.target.value } })}
                            className="w-full p-2 rounded border dark:bg-zinc-800 dark:border-zinc-600 dark:text-white"
                        />
                    </div>
                </div>
                <div className="mt-4 text-right">
                    <button onClick={() => handleSave('bank', config.bank)} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-700">Update Bank Details</button>
                </div>
            </div>
        </div>
    );
}

// --- Main Admin Page ---
export default function AdminPage() {
    const { userData, loading } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'settings'>('pending');
    const [payments, setPayments] = useState<any[]>([]);
    const [fetching, setFetching] = useState(false);

    // Check Permissions
    useEffect(() => {
        if (!loading && userData?.role !== 'admin') {
            router.push('/');
        }
    }, [userData, loading, router]);

    // Fetch Data
    const loadData = async () => {
        if (activeTab === 'settings') return;
        setFetching(true);
        try {
            const data = await getPayments(activeTab);
            // Sort by new
            data.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setPayments(data);
        } catch (e) {
            console.error(e);
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        if (userData?.role === 'admin') {
            loadData();
        }
    }, [activeTab, userData]); // eslint-disable-line

    const handleApprove = async (req: any) => {
        if (!confirm(`Approve ${req.details} for ${req.userName}?`)) return;
        try {
            await approvePayment(req.id, req.userId, req.type, req.itemId, req.amount);
            loadData(); // Refresh
        } catch (e) {
            alert('Error approving');
        }
    };

    const handleReject = async (req: any) => {
        if (!confirm(`Reject request from ${req.userName}?`)) return;
        try {
            await rejectPayment(req.id, req.userId);
            loadData();
        } catch (e) {
            alert('Error rejecting');
        }
    };

    if (loading || userData?.role !== 'admin') {
        return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => router.push('/')}
                        className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-3xl font-bold dark:text-white">Admin Dashboard</h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-700">
                    {['pending', 'approved', 'rejected', 'settings'].map((tab: any) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 px-4 text-sm font-medium capitalize transition-all ${activeTab === tab
                                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                        >
                            {tab} {tab === 'pending' && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">Live</span>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="bg-white dark:bg-zinc-800 rounded-xl shadow border border-zinc-200 dark:border-zinc-700 p-6">
                    {activeTab === 'settings' ? (
                        <SettingsEditor />
                    ) : (
                        <div className="overflow-x-auto">
                            {fetching ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
                            ) : payments.length === 0 ? (
                                <div className="text-center text-zinc-500 py-10">No {activeTab} payments found.</div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-zinc-100 dark:border-zinc-700 text-zinc-500">
                                        <tr>
                                            <th className="pb-3 pl-2">User</th>
                                            <th className="pb-3">Item</th>
                                            <th className="pb-3">Amount</th>
                                            <th className="pb-3">Time</th>
                                            <th className="pb-3 text-right pr-2">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                                        {payments.map(req => (
                                            <tr key={req.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
                                                <td className="py-4 pl-2">
                                                    <div className="font-bold dark:text-white">{req.userName}</div>
                                                    <div className="text-xs text-zinc-400">{req.userId}</div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="font-medium dark:text-zinc-200">{req.details}</div>
                                                    <div className="text-xs text-zinc-400 capitalize">{req.type}</div>
                                                </td>
                                                <td className="py-4 font-bold text-zinc-700 dark:text-zinc-300">
                                                    LKR {req.amount}
                                                </td>
                                                <td className="py-4 text-zinc-500">
                                                    {timeAgo(req.createdAt || req.timestamp?.toMillis?.() || Date.now())}
                                                </td>
                                                <td className="py-4 text-right pr-2">
                                                    {activeTab === 'pending' && (
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleApprove(req)}
                                                                className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                                                            >
                                                                <Check size={14} /> Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(req)}
                                                                className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                                                            >
                                                                <X size={14} /> Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                    {activeTab === 'approved' && (
                                                        <div className="flex justify-end">
                                                            {/* Revoke Logic - Only < 3 days */}
                                                            {(Date.now() - (req.approvedAt?.toMillis?.() || 0)) < 3 * 24 * 60 * 60 * 1000 ? (
                                                                <button
                                                                    onClick={() => handleReject(req)} // Reuse reject mostly for now or separate revoke function? User said "Reject" button
                                                                    className="flex items-center gap-1 border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                                                                >
                                                                    <ShieldAlert size={14} /> Revoke (Reject)
                                                                </button>
                                                            ) : (
                                                                <span className="text-xs text-zinc-400 italic">Locked</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
