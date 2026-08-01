import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Zap, Crown, Star } from 'lucide-react';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan: 'free' | 'pro' | 'ultra';
}

export default function PricingModal({ isOpen, onClose, currentPlan }: PricingModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900/95 border border-slate-700/50 rounded-3xl max-w-5xl w-full p-8 md:p-12 shadow-2xl overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-300">
                
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    className="absolute top-6 right-6 p-2 bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-all"
                >
                    <X size={24} />
                </button>
                
                {/* Header */}
                <div className="text-center mb-12 max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
                        Unlock Your Full Potential
                    </h2>
                    <p className="text-lg text-slate-400">
                        Choose the plan that fits your creative workflow. Upgrade to add rich media, higher quotas, and advanced mapping capabilities.
                    </p>
                </div>

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
                    
                    {/* 1. Free Plan */}
                    <div className="bg-slate-800/40 rounded-3xl p-8 border border-slate-700/50 relative flex flex-col h-full transition-transform hover:scale-[1.02]">
                        {currentPlan === 'free' && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500/20 text-blue-400 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider border border-blue-500/30 backdrop-blur-md">
                                Current Plan
                            </div>
                        )}
                        <div className="mb-6 text-center">
                            <h3 className="text-2xl font-bold text-slate-200 mb-2">Free</h3>
                            <div className="text-4xl font-extrabold text-white mb-2">$0 <span className="text-lg font-medium text-slate-500">/mo</span></div>
                            <p className="text-sm text-slate-400">Perfect for getting started.</p>
                        </div>
                        <div className="flex-1">
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-blue-400 shrink-0 mt-0.5" /> <span>Basic Text & Code Nodes</span></li>
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-blue-400 shrink-0 mt-0.5" /> <span>Checklists & Hyperlinks</span></li>
                                <li className="flex items-start gap-3 text-slate-500"><X size={20} className="text-slate-600 shrink-0 mt-0.5" /> <span>No Image Uploads</span></li>
                                <li className="flex items-start gap-3 text-slate-500"><X size={20} className="text-slate-600 shrink-0 mt-0.5" /> <span>No Video Uploads</span></li>
                            </ul>
                        </div>
                        <button className="w-full py-3.5 rounded-xl bg-slate-800 text-slate-400 cursor-not-allowed font-bold text-sm border border-slate-700/50">
                            Active
                        </button>
                    </div>

                    {/* 2. Pro Plan (Yellow/Amber Theme) */}
                    <div className="bg-gradient-to-b from-amber-900/20 to-slate-800/60 rounded-3xl p-8 border-2 border-amber-500/40 relative flex flex-col h-full transform md:-translate-y-4 shadow-2xl shadow-amber-500/10 transition-transform hover:scale-[1.02]">
                        {currentPlan === 'pro' && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
                                Current Plan
                            </div>
                        )}
                        <div className="absolute top-4 right-4 text-amber-500/30">
                            <Star size={48} />
                        </div>
                        <div className="mb-6 text-center relative z-10">
                            <h3 className="text-2xl font-bold text-amber-400 mb-2 flex items-center justify-center gap-2">
                                <Star size={20} className="fill-amber-400" /> Pro
                            </h3>
                            <div className="text-4xl font-extrabold text-white mb-2">$5 <span className="text-lg font-medium text-amber-500/60">/mo</span></div>
                            <p className="text-sm text-slate-300">Unlock visual mapping capabilities.</p>
                        </div>
                        <div className="flex-1 relative z-10">
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-amber-400 shrink-0 mt-0.5" /> <span>Everything in Free</span></li>
                                <li className="flex items-start gap-3 text-white font-medium"><Check size={20} className="text-amber-400 shrink-0 mt-0.5" /> <span>Image Uploads (Up to 4MB)</span></li>
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-amber-400 shrink-0 mt-0.5" /> <span>Auto Image Compression</span></li>
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-amber-400 shrink-0 mt-0.5" /> <span>20MB Media Quota per map</span></li>
                                <li className="flex items-start gap-3 text-slate-500"><X size={20} className="text-slate-600 shrink-0 mt-0.5" /> <span>No Video Uploads</span></li>
                            </ul>
                        </div>
                        <button 
                            onClick={() => currentPlan !== 'pro' && alert('Stripe Checkout Flow Initiated')} 
                            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all relative z-10 ${currentPlan === 'pro' ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700/50' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/25'}`}
                        >
                            {currentPlan === 'pro' ? 'Active' : 'Upgrade to Pro'}
                        </button>
                    </div>

                    {/* 3. Ultra Plan (Purple/Fuchsia Theme) */}
                    <div className="bg-gradient-to-b from-purple-900/20 to-slate-800/60 rounded-3xl p-8 border-2 border-purple-500/30 relative flex flex-col h-full transition-transform hover:scale-[1.02]">
                        {currentPlan === 'ultra' && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg">
                                Current Plan
                            </div>
                        )}
                        <div className="absolute top-4 right-4 text-purple-500/20">
                            <Crown size={48} />
                        </div>
                        <div className="mb-6 text-center relative z-10">
                            <h3 className="text-2xl font-bold text-purple-400 mb-2 flex items-center justify-center gap-2">
                                <Crown size={20} className="fill-purple-400" /> Ultra
                            </h3>
                            <div className="text-4xl font-extrabold text-white mb-2">$12 <span className="text-lg font-medium text-purple-500/60">/mo</span></div>
                            <p className="text-sm text-slate-300">The ultimate power user experience.</p>
                        </div>
                        <div className="flex-1 relative z-10">
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-purple-400 shrink-0 mt-0.5" /> <span>Everything in Pro</span></li>
                                <li className="flex items-start gap-3 text-white font-medium"><Check size={20} className="text-purple-400 shrink-0 mt-0.5" /> <span>Video Uploads (Up to 25MB)</span></li>
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-purple-400 shrink-0 mt-0.5" /> <span>50MB Image Quota per map</span></li>
                                <li className="flex items-start gap-3 text-slate-300"><Check size={20} className="text-purple-400 shrink-0 mt-0.5" /> <span>150MB Video Quota per map</span></li>
                                <li className="flex items-start gap-3 text-purple-200 font-bold bg-purple-500/10 px-3 py-2 rounded-lg border border-purple-500/20"><Zap size={16} className="text-purple-400 shrink-0 mt-0.5 inline mr-2" /> Priority Support</li>
                            </ul>
                        </div>
                        <button 
                            onClick={() => currentPlan !== 'ultra' && alert('Stripe Checkout Flow Initiated')} 
                            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all relative z-10 ${currentPlan === 'ultra' ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700/50' : 'bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-400 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'}`}
                        >
                            {currentPlan === 'ultra' ? 'Active' : 'Upgrade to Ultra'}
                        </button>
                    </div>

                </div>
            </div>
        </div>,
        document.body
    );
}
