import React, { useState, useEffect } from 'react';
import { Tag, X, Plus, Edit2 } from 'lucide-react';

export default function OffersEditor({ config, onSave }: { config: any, onSave: (data: any) => void }) {
    const offers = config.offers || {};

    const [label, setLabel] = useState('');
    const [targetPackageId, setTargetPackageId] = useState('');
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [durationDays, setDurationDays] = useState('30');
    const [maxUses, setMaxUses] = useState(''); // Empty means unlimited
    const [editingId, setEditingId] = useState<string | null>(null);

    // Generate flat list of available packages
    const availablePackages: { id: string, label: string, type: string, price: number }[] = [];
    
    // Plans
    ['free', 'pro', 'ultra'].forEach(plan => {
        availablePackages.push({ id: plan, label: `${plan.toUpperCase()} Plan`, type: 'plans', price: config.plans?.[plan] || 0 });
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

    const selectedPkg = availablePackages.find(p => p.id === targetPackageId);

    const handleSaveOffer = () => {
        if (!label || !targetPackageId || !discountValue) return;
        
        const origPrice = selectedPkg?.price || 0;
        const val = Number(discountValue);
        let finalPrice = origPrice;
        if (discountType === 'percentage') {
            finalPrice = origPrice - (origPrice * (val / 100));
        } else {
            finalPrice = origPrice - val;
        }
        if (finalPrice < 0) finalPrice = 0;

        const newOffer = {
            label,
            targetPackageId,
            targetPackageType: selectedPkg?.type,
            discountType,
            discountValue: val,
            durationDays: Number(durationDays),
            maxUses: maxUses ? Number(maxUses) : null,
            finalPrice: Math.round(finalPrice),
            createdAt: editingId ? offers[editingId].createdAt : Date.now()
        };

        const offerId = editingId || `offer_${Date.now()}`;
        onSave({ ...offers, [offerId]: newOffer });
        
        resetForm();
    };

    const resetForm = () => {
        setLabel('');
        setTargetPackageId('');
        setDiscountValue('');
        setDurationDays('30');
        setMaxUses('');
        setEditingId(null);
    };

    const handleEdit = (id: string) => {
        const offer = offers[id];
        setLabel(offer.label);
        setTargetPackageId(offer.targetPackageId);
        setDiscountType(offer.discountType);
        setDiscountValue(offer.discountValue.toString());
        setDurationDays(offer.durationDays.toString());
        setMaxUses(offer.maxUses ? offer.maxUses.toString() : '');
        setEditingId(id);
    };

    const handleDelete = (id: string) => {
        const newData = { ...offers };
        delete newData[id];
        onSave(newData);
        if (editingId === id) resetForm();
    };

    return (
        <div className="bg-zinc-50 dark:bg-zinc-700/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 md:col-span-2">
            <h3 className="font-bold mb-4 dark:text-white flex items-center gap-2">
                <Tag size={16} /> Special Offers Builder
            </h3>

            {/* Form */}
            <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg border border-zinc-200 dark:border-zinc-600 mb-6">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-bold dark:text-white">{editingId ? 'Edit Offer' : 'Create New Offer'}</h4>
                    {editingId && <button onClick={resetForm} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel Edit</button>}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Offer Title</label>
                        <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Summer Sale 50% Off" className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target Package</label>
                        <select value={targetPackageId} onChange={e => setTargetPackageId(e.target.value)} className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm">
                            <option value="">Select Package...</option>
                            {availablePackages.map(pkg => (
                                <option key={pkg.id} value={pkg.id}>{pkg.label} (LKR {pkg.price})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Discount</label>
                        <div className="flex gap-2">
                            <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder="Value" className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" />
                            <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="w-24 p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm">
                                <option value="percentage">%</option>
                                <option value="fixed">LKR</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Duration (Days)</label>
                        <select value={durationDays} onChange={e => setDurationDays(e.target.value)} className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm">
                            <option value="1">1 Day</option>
                            <option value="3">3 Days</option>
                            <option value="7">7 Days</option>
                            <option value="14">2 Weeks</option>
                            <option value="21">3 Weeks</option>
                            <option value="30">1 Month</option>
                            <option value="60">2 Months</option>
                            <option value="90">3 Months</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Max Users (Limit)</label>
                        <input 
                            type="number" 
                            value={maxUses} 
                            onChange={e => setMaxUses(e.target.value)} 
                            placeholder="Leave empty for Unlimited" 
                            className="w-full p-2 rounded border dark:bg-zinc-900 dark:border-zinc-700 dark:text-white text-sm" 
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">If empty, unlimited users can claim it.</p>
                    </div>
                </div>
                <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-700 pt-3">
                    <div className="text-sm dark:text-white">
                        Preview Final Price: <strong className="text-green-500">
                            {selectedPkg ? 
                                (discountType === 'percentage' ? 
                                    Math.max(0, selectedPkg.price - (selectedPkg.price * (Number(discountValue)/100))) 
                                    : Math.max(0, selectedPkg.price - Number(discountValue))
                                ) 
                                : '0'} LKR
                        </strong>
                    </div>
                    <button onClick={handleSaveOffer} disabled={!label || !targetPackageId || !discountValue} className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                        {editingId ? <Edit2 size={16} /> : <Plus size={16} />} 
                        {editingId ? 'Update Offer' : 'Add Offer'}
                    </button>
                </div>
            </div>

            {/* List Existing */}
            <div className="space-y-2">
                <h4 className="text-sm font-bold dark:text-white mb-2">Created Offers</h4>
                {Object.entries(offers).map(([id, offer]: [string, any]) => (
                    <div key={id} className={`flex justify-between items-center p-3 bg-white dark:bg-zinc-800 rounded border ${editingId === id ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-600'}`}>
                        <div>
                            <span className="font-bold dark:text-white text-sm block">{offer.label}</span>
                            <span className="text-xs text-zinc-500">
                                Target: {offer.targetPackageId} | {offer.discountValue}{offer.discountType === 'percentage' ? '%' : ' LKR'} off | {offer.durationDays} Days 
                                | Limit: {offer.maxUses ? `${offer.maxUses} users` : 'Unlimited'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <span className="text-xs text-zinc-400 line-through block">LKR {availablePackages.find(p=>p.id===offer.targetPackageId)?.price || 0}</span>
                                <span className="text-sm font-bold text-green-500">LKR {offer.finalPrice}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-1">
                                <button onClick={() => handleEdit(id)} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded"><X size={16} /></button>
                            </div>
                        </div>
                    </div>
                ))}
                {Object.keys(offers).length === 0 && <div className="text-center text-zinc-400 text-xs italic">No special offers defined</div>}
            </div>

        </div>
    );
}
