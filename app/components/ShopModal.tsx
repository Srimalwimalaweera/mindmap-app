'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthProvider';
import { X, Crown, HardDrive, Briefcase, Tag, Sparkles, Check, ChevronRight, Gift } from 'lucide-react';
import { db } from '@/lib/firebase';
import { runTransaction, doc } from 'firebase/firestore';

interface ShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'plans' | 'slots' | 'storage' | 'offers' | 'redeem';
}

export default function ShopModal({ isOpen, onClose, initialTab = 'plans' }: ShopModalProps) {
    const { settings, userData, refreshUserData } = useAuth();
    const [activeTab, setActiveTab] = useState<'plans' | 'slots' | 'storage' | 'offers' | 'redeem'>(initialTab);
    
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [initialTab, isOpen]);

    const [redeemCode, setRedeemCode] = useState('');
    const [isRedeeming, setIsRedeeming] = useState(false);

    if (!isOpen || !settings || !mounted) return null;

    const handleBuy = (item: string) => {
        alert(`Purchase flow for ${item} coming soon!`);
    };

    const handleRedeem = async () => {
        if (!redeemCode.trim() || !userData) return;
        const codeUpper = redeemCode.trim().toUpperCase();
        setIsRedeeming(true);
        try {
            const codeRef = doc(db, 'redeem_codes', codeUpper);
            const userRef = doc(db, 'users', userData.uid);
            
            await runTransaction(db, async (transaction) => {
                const codeDoc = await transaction.get(codeRef);
                if (!codeDoc.exists()) {
                    throw new Error('Invalid code');
                }
                
                const data = codeDoc.data();
                const usedBy = data.usedBy || [];
                
                if (usedBy.includes(userData.uid)) {
                    throw new Error('You have already used this code');
                }
                
                if (usedBy.length >= data.maxUses) {
                    throw new Error('This code has reached its usage limit');
                }

                if (data.codeExpiresAt && Date.now() > data.codeExpiresAt) {
                    throw new Error('This code has expired');
                }
                
                // Read user
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error('User not found');
                const uData = userDoc.data();
                
                // Apply the gift
                let updates: any = {};
                let perkType = '';
                let perkAmount = 0;
                
                if (data.packageType === 'plans') {
                    updates.plan = data.packageId;
                    if (data.perkDurationDays) {
                        updates.planExpiresAt = Date.now() + (data.perkDurationDays * 24 * 60 * 60 * 1000);
                    } else {
                        updates.planExpiresAt = null; // lifetime
                    }
                } else if (data.packageType === 'addSlots') {
                    const match = data.packageId.match(/(\d+)\s+slots/i);
                    const slots = match ? parseInt(match[1]) : 0;
                    updates.extraSlots = (uData.extraSlots || 0) + slots;
                    perkType = 'slots';
                    perkAmount = slots;
                } else if (data.packageType === 'addPins') {
                    const match = data.packageId.match(/(\d+)\s+Pins/i);
                    const pins = match ? parseInt(match[1]) : 0;
                    updates.extraPins = (uData.extraPins || 0) + pins;
                    perkType = 'pins';
                    perkAmount = pins;
                } else if (data.packageType === 'addStorage') {
                    const match = data.packageId.match(/(\d+)\s+GB/i);
                    const gb = match ? parseInt(match[1]) : 0;
                    updates.extraStorage = (uData.extraStorage || 0) + (gb * 1024 * 1024 * 1024);
                    perkType = 'storage';
                    perkAmount = gb * 1024 * 1024 * 1024;
                }

                // If this non-plan perk has a duration, record it in activePerks
                if (perkType && data.perkDurationDays) {
                    const activePerks = uData.activePerks || [];
                    activePerks.push({
                        type: perkType,
                        amount: perkAmount,
                        expiresAt: Date.now() + (data.perkDurationDays * 24 * 60 * 60 * 1000),
                        packageId: data.packageId
                    });
                    updates.activePerks = activePerks;
                }
                
                // Add user to usedBy
                transaction.update(codeRef, {
                    usedBy: [...usedBy, userData.uid]
                });
                
                // Update user
                if (Object.keys(updates).length > 0) {
                    transaction.update(userRef, updates);
                }
            });
            
            await refreshUserData();
            alert(`Successfully redeemed: ${codeUpper}!`);
            setRedeemCode('');
        } catch (e: any) {
            alert(e.message || 'Failed to redeem code. It might be invalid or expired.');
        } finally {
            setIsRedeeming(false);
        }
    };

    const currentPlan = userData?.plan || 'free';
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-700/50 rounded-[30px] w-full max-w-4xl h-[90vh] md:h-[650px] overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                
                {/* Header */}
                <div className="p-6 pb-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Sparkles className="text-yellow-400" />
                            Upgrade Store
                        </h2>
                        <p className="text-sm text-zinc-400 mt-1">Unlock premium features, extra slots, and storage.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[400px]">
                    {/* Sidebar Tabs */}
                    <div className="w-full md:w-64 bg-zinc-800/20 border-b md:border-b-0 md:border-r border-zinc-800 p-2 md:p-4 flex flex-row md:flex-col gap-1 md:gap-2">
                        <button
                            onClick={() => setActiveTab('plans')}
                            className={`flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl text-[10px] md:text-sm font-bold transition-all h-[60px] md:h-auto ${activeTab === 'plans' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <Crown size={20} className="w-[18px] h-[18px]" /> 
                            <span>Plans</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('slots')}
                            className={`flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl text-[10px] md:text-sm font-bold transition-all h-[60px] md:h-auto ${activeTab === 'slots' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <Briefcase size={20} className="w-[18px] h-[18px]" /> 
                            <span>Slots</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('storage')}
                            className={`flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl text-[10px] md:text-sm font-bold transition-all h-[60px] md:h-auto ${activeTab === 'storage' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <HardDrive size={20} className="w-[18px] h-[18px]" /> 
                            <span>Storage</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('offers')}
                            className={`flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl text-[10px] md:text-sm font-bold transition-all h-[60px] md:h-auto ${activeTab === 'offers' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <Tag size={20} className="w-[18px] h-[18px]" /> 
                            <span>Offers</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('redeem')}
                            className={`flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl text-[10px] md:text-sm font-bold transition-all h-[60px] md:h-auto ${activeTab === 'redeem' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <Gift size={20} className="w-[18px] h-[18px]" /> 
                            <span>Redeem</span>
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-zinc-900/50">
                        
                        {/* PLANS TAB */}
                        {activeTab === 'plans' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <h3 className="text-lg font-bold text-white mb-4">Choose Your Plan</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Free */}
                                    <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700 relative">
                                        {currentPlan === 'free' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-lg">Current</div>}
                                        <h4 className="text-xl font-bold text-white">Free</h4>
                                        <p className="text-3xl font-black text-white mt-2 mb-1">LKR {settings.plans.free}</p>
                                        <p className="text-xs text-zinc-400 mb-6">/ month</p>
                                        <ul className="space-y-3 mb-6">
                                            <li className="flex items-center gap-2 text-sm text-zinc-300"><Check size={16} className="text-green-500"/> {settings.projectLimits.free} Projects</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-300"><Check size={16} className="text-green-500"/> {settings.pinLimits.free} Pinned Maps</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-300"><Check size={16} className="text-green-500"/> {Math.round(settings.storageLimits.free / (1024*1024))}MB Storage</li>
                                        </ul>
                                        {currentPlan === 'free' ? (
                                            <button disabled className="w-full py-2 rounded-lg bg-zinc-700 text-white font-bold text-sm disabled:opacity-50">Current Plan</button>
                                        ) : (
                                            <button disabled className="w-full py-2 rounded-lg bg-zinc-800/50 text-zinc-500 font-bold text-sm disabled:opacity-50">Included</button>
                                        )}
                                    </div>
                                    {/* Pro */}
                                    <div className={`rounded-2xl p-6 border relative ${currentPlan === 'pro' ? 'bg-gradient-to-b from-blue-900/40 to-zinc-800 border-blue-500 transform md:-translate-y-2 shadow-[0_10px_30px_rgba(59,130,246,0.2)]' : 'bg-zinc-800 border-zinc-700'}`}>
                                        {currentPlan === 'pro' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-lg">Current</div>}
                                        <h4 className="text-xl font-bold text-blue-400 flex items-center gap-2">Pro <Sparkles size={16}/></h4>
                                        <p className="text-3xl font-black text-white mt-2 mb-1">LKR {settings.plans.pro}</p>
                                        <p className="text-xs text-blue-200/50 mb-6">/ month</p>
                                        <ul className="space-y-3 mb-6">
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-blue-400"/> {settings.projectLimits.pro} Projects</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-blue-400"/> {settings.pinLimits.pro} Pinned Maps</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-blue-400"/> {Math.round(settings.storageLimits.pro / (1024*1024))}MB Storage</li>
                                        </ul>
                                        {currentPlan === 'free' ? (
                                            <button onClick={() => handleBuy('Pro Plan')} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">Upgrade to Pro</button>
                                        ) : currentPlan === 'pro' ? (
                                            <button disabled className="w-full py-2 rounded-lg bg-zinc-700 text-white font-bold text-sm disabled:opacity-50">Current Plan</button>
                                        ) : (
                                            <button disabled className="w-full py-2 rounded-lg bg-zinc-800/50 text-zinc-500 font-bold text-sm disabled:opacity-50">Included</button>
                                        )}
                                    </div>
                                    {/* Ultra */}
                                    <div className={`rounded-2xl p-6 border relative ${currentPlan === 'ultra' ? 'bg-gradient-to-b from-purple-900/40 to-zinc-800 border-purple-500 transform md:-translate-y-2 shadow-[0_10px_30px_rgba(168,85,247,0.2)]' : 'bg-zinc-800 border-zinc-700'}`}>
                                        {currentPlan === 'ultra' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full shadow-lg">Current</div>}
                                        <h4 className="text-xl font-bold text-purple-400 flex items-center gap-2">Ultra <Crown size={16}/></h4>
                                        <p className="text-3xl font-black text-white mt-2 mb-1">LKR {settings.plans.ultra}</p>
                                        <p className="text-xs text-purple-200/50 mb-6">/ month</p>
                                        <ul className="space-y-3 mb-6">
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-purple-400"/> {settings.projectLimits.ultra} Projects</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-purple-400"/> {settings.pinLimits.ultra === 9999 ? 'Unlimited' : settings.pinLimits.ultra} Pinned Maps</li>
                                            <li className="flex items-center gap-2 text-sm text-zinc-200"><Check size={16} className="text-purple-400"/> {Math.round(settings.storageLimits.ultra / (1024*1024*1024))}GB Storage</li>
                                        </ul>
                                        {currentPlan === 'ultra' ? (
                                            <button disabled className="w-full py-2 rounded-lg bg-zinc-700 text-white font-bold text-sm disabled:opacity-50">Current Plan</button>
                                        ) : (
                                            <button onClick={() => handleBuy('Ultra Plan')} className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors">Upgrade to Ultra</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SLOTS TAB */}
                        {activeTab === 'slots' && (
                            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-4">Additional Project Slots</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {settings.additionalProjectSlots.map((item, idx) => (
                                            <div key={idx} className="bg-zinc-800/50 border border-zinc-700 hover:border-blue-500/50 p-4 rounded-xl flex items-center justify-between group transition-colors">
                                                <div>
                                                    <p className="text-white font-bold">{item.label}</p>
                                                    <p className="text-sm text-zinc-400">LKR {item.price}</p>
                                                </div>
                                                <button onClick={() => handleBuy(item.label)} className="bg-white/10 hover:bg-blue-500 group-hover:text-white text-zinc-300 px-4 py-2 rounded-lg text-sm font-bold transition-colors">Buy</button>
                                            </div>
                                        ))}
                                        {settings.additionalProjectSlots.length === 0 && <p className="text-zinc-500 text-sm">No packages available.</p>}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-4">Additional Pin Slots</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {settings.additionalPinSlots.map((item, idx) => (
                                            <div key={idx} className="bg-zinc-800/50 border border-zinc-700 hover:border-blue-500/50 p-4 rounded-xl flex items-center justify-between group transition-colors">
                                                <div>
                                                    <p className="text-white font-bold">{item.label}</p>
                                                    <p className="text-sm text-zinc-400">LKR {item.price}</p>
                                                </div>
                                                <button onClick={() => handleBuy(item.label)} className="bg-white/10 hover:bg-blue-500 group-hover:text-white text-zinc-300 px-4 py-2 rounded-lg text-sm font-bold transition-colors">Buy</button>
                                            </div>
                                        ))}
                                        {settings.additionalPinSlots.length === 0 && <p className="text-zinc-500 text-sm">No packages available.</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STORAGE TAB */}
                        {activeTab === 'storage' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <h3 className="text-lg font-bold text-white mb-4">Media Storage Packages</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {settings.additionalStoragePackages.map((item, idx) => (
                                        <div key={idx} className="bg-gradient-to-br from-zinc-800 to-zinc-800/50 border border-zinc-700 hover:border-teal-500/50 p-5 rounded-2xl flex items-center justify-between group transition-all hover:shadow-[0_10px_30px_rgba(20,184,166,0.1)]">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center">
                                                    <HardDrive size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-black text-lg">{item.label}</p>
                                                    <p className="text-sm text-zinc-400">LKR {item.price}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => handleBuy(item.label)} className="bg-white/10 hover:bg-teal-500 group-hover:text-white text-zinc-300 px-4 py-2 rounded-lg text-sm font-bold transition-colors">Buy</button>
                                        </div>
                                    ))}
                                    {settings.additionalStoragePackages.length === 0 && <p className="text-zinc-500 text-sm">No packages available.</p>}
                                </div>
                            </div>
                        )}

                        {/* OFFERS TAB */}
                        {activeTab === 'offers' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 relative min-h-[300px]">
                                <h3 className="text-lg font-bold text-white mb-4">Special Offers</h3>
                                
                                <div className="grid grid-cols-1 gap-4 pb-4">
                                    {settings.offers.map((item: any, idx) => (
                                        <div key={idx} className="relative overflow-hidden bg-gradient-to-br from-orange-500/10 to-rose-500/10 border border-orange-500/20 hover:border-orange-500/50 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 group transition-all">
                                            {/* decorative background glow */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-3xl rounded-full pointer-events-none"></div>
                                            
                                            <div className="flex flex-col relative z-10 w-full sm:w-auto">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="inline-flex items-center justify-center bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                                                        {item.durationDays ? `Valid for ${item.durationDays} Days` : 'Limited Time'}
                                                    </span>
                                                    {item.maxUses && (
                                                        <span className="inline-flex items-center justify-center bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                            Only {item.maxUses} Left
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-white font-black text-2xl tracking-tight leading-none mb-3 capitalize">{item.label}</p>
                                                <div className="flex flex-wrap items-end gap-3">
                                                    <p className="text-3xl font-black text-green-400 leading-none">LKR {item.finalPrice}</p>
                                                    <div className="flex flex-col justify-end pb-0.5">
                                                        <p className="text-xs font-bold text-zinc-400 bg-black/40 px-2 py-1 rounded shadow-inner">
                                                            {item.discountType === 'percentage' ? `${item.discountValue}% OFF` : `LKR ${item.discountValue} OFF`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => handleBuy(item.id)} className="relative z-10 w-full sm:w-auto bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white px-6 py-3.5 rounded-xl text-sm font-black shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] transition-all flex items-center justify-center gap-2 uppercase tracking-wider">
                                                <Tag size={16} className="text-white/80" /> Claim Offer
                                            </button>
                                        </div>
                                    ))}
                                    {settings.offers.length === 0 && (
                                        <div className="text-center py-10">
                                            <Tag size={40} className="text-zinc-700 mx-auto mb-4" />
                                            <p className="text-zinc-500 font-bold text-lg">No Special Offers right now.</p>
                                            <p className="text-zinc-600 text-sm mt-1">Check back later for exclusive deals!</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* REDEEM TAB */}
                        {activeTab === 'redeem' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                <h3 className="text-lg font-bold text-white mb-4">Redeem Gift Code</h3>
                                
                                <div className="bg-gradient-to-br from-zinc-800 to-zinc-800/50 border border-zinc-700 p-8 rounded-2xl flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center mb-6">
                                        <Gift size={32} />
                                    </div>
                                    <h4 className="text-xl font-bold text-white mb-2">Have a special code?</h4>
                                    <p className="text-sm text-zinc-400 mb-8 max-w-sm">
                                        Enter your promo or gift code below to unlock plans, extra slots, or media storage instantly.
                                    </p>
                                    
                                    <div className="w-full max-w-md flex flex-col sm:flex-row gap-3">
                                        <input 
                                            type="text" 
                                            value={redeemCode} 
                                            onChange={e => setRedeemCode(e.target.value)} 
                                            placeholder="ENTER REDEEM CODE" 
                                            className="flex-1 bg-zinc-900 border border-zinc-600 rounded-xl px-4 py-3 text-white uppercase focus:border-pink-500 focus:outline-none transition-colors"
                                        />
                                        <button 
                                            onClick={handleRedeem} 
                                            disabled={isRedeeming || !redeemCode}
                                            className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 rounded-xl font-bold disabled:opacity-50 transition-colors whitespace-nowrap shadow-lg shadow-pink-600/20"
                                        >
                                            {isRedeeming ? 'Validating...' : 'Apply Code'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
