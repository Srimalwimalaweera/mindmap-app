import React, { useState, useEffect } from 'react';
import { Gift, X, Plus, Edit2 } from 'lucide-react';
import { collection, onSnapshot, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function RedeemCodeEditor({ config, onSave }: { config: any, onSave: (codeData: any) => Promise<void> }) {
    const [code, setCode] = useState('');
    const [targetPackageId, setTargetPackageId] = useState('');
    const [maxUses, setMaxUses] = useState('1');
    const [codeExpiresAt, setCodeExpiresAt] = useState(''); // YYYY-MM-DD
    const [perkDurationDays, setPerkDurationDays] = useState('');
    const [existingCodes, setExistingCodes] = useState<any[]>([]);
    const [editingCodeId, setEditingCodeId] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'redeem_codes'), (snapshot) => {
            const codes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort by createdAt descending
            codes.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
            setExistingCodes(codes);
        });
        return () => unsubscribe();
    }, []);

    // Generate flat list of available packages
    const availablePackages: { id: string, label: string, type: string, price: number }[] = [];
    
    // Plans
    ['free', 'pro', 'ultra'].forEach(plan => {
        availablePackages.push({ id: plan, label: `${plan.toUpperCase()} Plan`, type: 'plans', price: config.plans[plan] || 0 });
    });
    
    // Slots
    Object.entries(config.addSlots || {}).forEach(([key, price]) => {
        availablePackages.push({ id: key, label: `${key} (Slots)`, type: 'addSlots', price: price as number });
    });
    
    // Pins
    Object.entries(config.addPins || {}).forEach(([key, price]) => {
        availablePackages.push({ id: key, label: `${key} (Pins)`, type: 'addPins', price: price as number });
    });
    
    // Storage
    Object.entries(config.addStorage || {}).forEach(([key, price]) => {
        availablePackages.push({ id: key, label: `${key} (Storage)`, type: 'addStorage', price: price as number });
    });

    const handleCreate = async () => {
        if (!code.trim() || !targetPackageId || !maxUses) return;
        
        const finalCode = code.trim().toUpperCase();

        // Check for duplicates if not editing the SAME code
        if (!editingCodeId || editingCodeId !== finalCode) {
            const existing = existingCodes.find(c => c.id === finalCode);
            if (existing) {
                alert('This code already exists! Please use a different code.');
                return;
            }
        }
        
        const selectedPkg = availablePackages.find(p => p.id === targetPackageId);
        if (!selectedPkg) return;

        const codeData = {
            code: finalCode,
            packageId: selectedPkg.id,
            packageType: selectedPkg.type,
            maxUses: parseInt(maxUses) || 1,
            codeExpiresAt: codeExpiresAt ? new Date(codeExpiresAt).getTime() : null,
            perkDurationDays: perkDurationDays ? parseInt(perkDurationDays) : null,
            usedBy: editingCodeId ? existingCodes.find(c => c.id === editingCodeId)?.usedBy || [] : [],
            createdAt: editingCodeId ? existingCodes.find(c => c.id === editingCodeId)?.createdAt || Date.now() : Date.now()
        };

        // If editing and the code string changed, we should ideally delete the old doc and create new one.
        // But to keep things safe and simple, let's just use `onSave` which uses `setDoc(doc(db, 'redeem_codes', codeData.code))`.
        // If the code string changed, we must delete the old document!
        if (editingCodeId && editingCodeId !== finalCode) {
            await deleteDoc(doc(db, 'redeem_codes', editingCodeId));
        }

        await onSave(codeData);
        resetForm();
    };

    const resetForm = () => {
        setCode('');
        setMaxUses('1');
        setTargetPackageId('');
        setCodeExpiresAt('');
        setPerkDurationDays('');
        setEditingCodeId(null);
    };

    const handleEdit = (c: any) => {
        setCode(c.code);
        setTargetPackageId(c.packageId);
        setMaxUses(c.maxUses.toString());
        setCodeExpiresAt(c.codeExpiresAt ? new Date(c.codeExpiresAt).toISOString().split('T')[0] : '');
        setPerkDurationDays(c.perkDurationDays ? c.perkDurationDays.toString() : '');
        setEditingCodeId(c.id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm(`Are you sure you want to delete ${id}?`)) return;
        try {
            await deleteDoc(doc(db, 'redeem_codes', id));
            if (editingCodeId === id) resetForm();
        } catch (e) {
            alert('Failed to delete code.');
        }
    };

    return (
        <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 md:col-span-2">
            <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2">
                <Gift size={16} /> Redeem Code Generator
            </h3>

            {/* Form */}
            <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg border border-zinc-200 dark:border-zinc-600 mb-6">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-bold dark:text-white">{editingCodeId ? 'Edit Redeem Code' : 'Create New Redeem Code'}</h4>
                    {editingCodeId && <button onClick={resetForm} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel Edit</button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Redeem Code</label>
                        <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. VIP2026" className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm uppercase" />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Gift Package</label>
                        <select value={targetPackageId} onChange={e => setTargetPackageId(e.target.value)} className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm">
                            <option value="">Select Package...</option>
                            {availablePackages.map(pkg => (
                                <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Usage Limit</label>
                        <input type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)} min="1" className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Code Expiry Date (Optional)</label>
                        <input type="date" value={codeExpiresAt} onChange={e => setCodeExpiresAt(e.target.value)} className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Perk Duration in Days (Optional)</label>
                        <input type="number" value={perkDurationDays} onChange={e => setPerkDurationDays(e.target.value)} min="1" placeholder="Leave empty for Lifetime" className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" />
                    </div>
                </div>
                <div className="flex justify-end items-center border-t border-zinc-100 dark:border-zinc-700 pt-3">
                    <button onClick={handleCreate} disabled={!code.trim() || !targetPackageId || !maxUses} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                        {editingCodeId ? <Edit2 size={16} /> : <Plus size={16} />} 
                        {editingCodeId ? 'Update Code' : 'Create Code'}
                    </button>
                </div>
            </div>
            
            {/* List Existing Codes */}
            <div className="space-y-2">
                <h4 className="text-sm font-bold dark:text-white mb-2">Available Codes</h4>
                {existingCodes.map((c: any) => (
                    <div key={c.id} className={`flex justify-between items-center p-3 bg-white dark:bg-zinc-800 rounded border ${editingCodeId === c.id ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-600'}`}>
                        <div>
                            <span className="font-bold dark:text-white text-sm block tracking-widest text-pink-500">{c.code}</span>
                            <span className="text-xs text-zinc-500">
                                Package: {availablePackages.find(p=>p.id===c.packageId)?.label || c.packageId} 
                                | Used: {c.usedBy?.length || 0} / {c.maxUses}
                                {c.codeExpiresAt && ` | Exp: ${new Date(c.codeExpiresAt).toLocaleDateString()}`}
                                {c.perkDurationDays && ` | Perk: ${c.perkDurationDays} Days`}
                            </span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1">
                            <button onClick={() => handleEdit(c)} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded"><X size={16} /></button>
                        </div>
                    </div>
                ))}
                {existingCodes.length === 0 && <div className="text-center text-zinc-400 text-xs italic">No redeem codes defined</div>}
            </div>
        </div>
    );
}
