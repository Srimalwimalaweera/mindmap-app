'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { approvePayment, getPayments, rejectPayment } from '../services/paymentService';
import { Loader2, Check, X, ShieldAlert, History, Star, Briefcase, Shield, ArrowLeft, RefreshCw, AlertTriangle, ToggleLeft, ToggleRight, LayoutDashboard, Users, HardDrive, Search, Calendar, Filter, XCircle } from 'lucide-react';
import { getDoc, setDoc, doc, getCountFromServer, collection } from 'firebase/firestore';

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

// --- Usage Viewer Component ---
function UsageViewer() {
    const [counts, setCounts] = useState({ users: 0, maps: 0 });
    const [loading, setLoading] = useState(false);

    const fetchCounts = async () => {
        setLoading(true);
        try {
            const userColl = collection(db, 'users');
            const mapColl = collection(db, 'markmaps');

            const userSnap = await getCountFromServer(userColl);
            const mapSnap = await getCountFromServer(mapColl);

            setCounts({
                users: userSnap.data().count,
                maps: mapSnap.data().count
            });
        } catch (e) {
            console.error("Error fetching counts", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                    <LayoutDashboard className="text-blue-500" /> System Usage
                </h2>
                <button
                    onClick={fetchCounts}
                    disabled={loading}
                    className="flex items-center gap-2 bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    Refresh Stats
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Users Card */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Users size={100} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-2">Total Users</p>
                        <h3 className="text-5xl font-black">{loading ? '...' : counts.users}</h3>
                        <p className="text-blue-200 text-xs mt-4">Registered accounts in database</p>
                    </div>
                </div>

                {/* Maps Card */}
                <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <HardDrive size={100} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-purple-100 text-sm font-bold uppercase tracking-wider mb-2">Total Mind Maps</p>
                        <h3 className="text-5xl font-black">{loading ? '...' : counts.maps}</h3>
                        <p className="text-purple-200 text-xs mt-4">Projects stored in database</p>
                    </div>
                </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 mt-8">
                <div className="flex items-start gap-4">
                    <AlertTriangle className="text-yellow-600 dark:text-yellow-500 shrink-0 mt-1" />
                    <div>
                        <h4 className="font-bold text-yellow-800 dark:text-yellow-400 mb-2">Usage Note (Blaze Plan)</h4>
                        <p className="text-sm text-yellow-700 dark:text-yellow-500/80 leading-relaxed">
                            Firebase usage is billed based on document reads, writes, and storage.
                            These counts represent the total number of documents.
                            To control costs, use the <strong>Limit Users</strong> toggle in Settings to restrict new project creation during high traffic.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
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
                addPins: await getDoc(doc(db, 'settings', 'additional_project_pins')),
                system: await getDoc(doc(db, 'settings', 'system')) // Fetch system settings
            };
            setConfig({
                plans: docs.plans.data() || {},
                pins: docs.pins.data() || {},
                limits: docs.limits.data() || {},
                bank: docs.bank.data() || {},
                addSlots: docs.addSlots.data() || {},
                addPins: docs.addPins.data() || {},
                system: docs.system.data() || { maintenanceMode: false }
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
            if (section === 'system') docId = 'system';

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

            {/* System Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2"><ToggleLeft size={16} /> Usage Controls</h3>
                <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-4 rounded-lg border border-zinc-200 dark:border-zinc-600">
                    <div>
                        <div className="font-bold dark:text-white">Limit Users (Maintenance Mode)</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">If enabled, limits new actions to reduce costs.</div>
                    </div>
                    <button
                        onClick={() => {
                            const newValue = !config.system.maintenanceMode;
                            setConfig({ ...config, system: { ...config.system, maintenanceMode: newValue } });
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.system.maintenanceMode ? 'bg-red-500' : 'bg-zinc-200 dark:bg-zinc-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.system.maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <button onClick={() => handleSave('system', config.system)} className="ml-4 bg-zinc-800 text-white px-3 py-1.5 rounded text-xs font-bold hover:opacity-90">
                        Update
                    </button>
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

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
    const [customRange, setCustomRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

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

    // Filter Logic
    const filteredPayments = payments.filter(req => {
        // 1. Search (Fuzzy)
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            req.userName?.toLowerCase().includes(searchLower) ||
            req.userEmail?.toLowerCase().includes(searchLower) ||
            req.userId?.toLowerCase().includes(searchLower) ||
            req.details?.toLowerCase().includes(searchLower) ||
            req.id?.toLowerCase().includes(searchLower);

        if (!matchesSearch) return false;

        // 2. Date Filter
        if (timeFilter === 'all') return true;

        const date = new Date(req.createdAt || req.timestamp?.toMillis?.() || Date.now());
        const timestamp = date.getTime();
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (timeFilter === 'today') return timestamp >= startOfDay;
        if (timeFilter === 'week') return timestamp >= startOfDay - (7 * 86400000); // Last 7 days
        if (timeFilter === 'month') return timestamp >= startOfDay - (30 * 86400000); // Last 30 days
        if (timeFilter === 'year') return timestamp >= startOfDay - (365 * 86400000); // Last year

        if (timeFilter === 'custom') {
            const startStr = customRange.start;
            const endStr = customRange.end;
            if (!startStr && !endStr) return true;

            const start = startStr ? new Date(startStr).getTime() : 0;
            const end = endStr ? new Date(endStr).getTime() + 86400000 : Infinity;
            return timestamp >= start && timestamp < end;
        }

        return true;
    });

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
                <div className="flex gap-4 mb-6 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
                    {['pending', 'approved', 'rejected', 'settings', 'usage'].map((tab: any) => (
                        <button
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                setSearchTerm('');
                                setTimeFilter('all');
                                setCustomRange({ start: '', end: '' });
                            }}
                            className={`pb-3 px-4 text-sm font-medium capitalize transition-all whitespace-nowrap ${activeTab === tab
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
                    ) : activeTab === 'usage' ? (
                        <UsageViewer />
                    ) : (
                        <div>
                            {/* Search & Filter Controls */}
                            <div className="flex flex-col md:flex-row gap-4 mb-6">
                                {/* Search */}
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search by name, ID or details..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-10 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Time Filter */}
                                <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto no-scrollbar">
                                    {['all', 'today', 'week', 'month', 'year'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setTimeFilter(t as any)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition-colors ${timeFilter === t
                                                ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                                                : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700/50'
                                                }`}
                                        >
                                            {t === 'all' ? 'All Time' : t}
                                        </button>
                                    ))}
                                    <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-600 mx-1"></div>
                                    <button
                                        onClick={() => setTimeFilter('custom')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition-colors flex items-center gap-1 ${timeFilter === 'custom'
                                            ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                                            : 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700/50'
                                            }`}
                                    >
                                        <Calendar size={12} /> Custom
                                    </button>
                                </div>
                            </div>

                            {/* Custom Date Range Inputs */}
                            {timeFilter === 'custom' && (
                                <div className="flex items-center gap-3 mb-6 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-700/50 animate-in slide-in-from-top-2 fade-in">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500">From</label>
                                        <input
                                            type="date"
                                            value={customRange.start}
                                            onChange={e => setCustomRange({ ...customRange, start: e.target.value })}
                                            className="px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white text-sm"
                                        />
                                    </div>
                                    <div className="pt-4 text-zinc-400">→</div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500">To</label>
                                        <input
                                            type="date"
                                            value={customRange.end}
                                            onChange={e => setCustomRange({ ...customRange, end: e.target.value })}
                                            className="px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white text-sm"
                                        />
                                    </div>
                                    <div className="pt-4 ml-auto">
                                        <button
                                            onClick={() => { setCustomRange({ start: '', end: '' }); setTimeFilter('all'); }}
                                            className="text-xs text-red-500 hover:underline font-medium"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                {fetching ? (
                                    <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
                                ) : filteredPayments.length === 0 ? (
                                    <div className="text-center py-16">
                                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
                                            <Search className="text-zinc-400" size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300">No requests found</h3>
                                        <p className="text-zinc-500 text-sm mt-1">
                                            {searchTerm || timeFilter !== 'all' ? 'Try adjusting your filters.' : `No ${activeTab} payments yet.`}
                                        </p>
                                        {(searchTerm || timeFilter !== 'all') && (
                                            <button
                                                onClick={() => { setSearchTerm(''); setTimeFilter('all'); }}
                                                className="mt-4 text-blue-600 hover:underline text-sm font-bold"
                                            >
                                                Clear Filtering
                                            </button>
                                        )}
                                    </div>
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
                                            {filteredPayments.map(req => (
                                                <tr key={req.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
                                                    <td className="py-4 pl-2">
                                                        <div className="font-bold dark:text-white">{req.userName}</div>
                                                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{req.userEmail}</div>
                                                        <div className="text-[10px] text-zinc-400 font-mono">{req.userId}</div>
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
