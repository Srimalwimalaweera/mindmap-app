import React from 'react';
import { X, Check } from 'lucide-react';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan: 'free' | 'pro' | 'ultra';
}

export default function PricingModal({ isOpen, onClose, currentPlan }: PricingModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl overflow-hidden relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                    <X size={24} />
                </button>
                
                <div className="text-center mb-8 mt-2">
                    <h2 className="text-2xl font-bold text-white mb-2">Upgrade Your Mind Mapping Experience</h2>
                    <p className="text-slate-400">Unlock advanced media features and higher quotas.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Free Plan */}
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 relative">
                        {currentPlan === 'free' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">Current Plan</div>}
                        <h3 className="text-xl font-bold text-white mb-1">Free</h3>
                        <div className="text-3xl font-bold text-white mb-4">$0 <span className="text-sm font-normal text-slate-400">/mo</span></div>
                        <ul className="space-y-3 mb-6">
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-blue-400 shrink-0 mt-0.5" /> Basic Text Nodes</li>
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-blue-400 shrink-0 mt-0.5" /> Checklists & Links</li>
                            <li className="flex items-start gap-2 text-sm text-slate-500"><X size={16} className="text-slate-600 shrink-0 mt-0.5" /> No Media Uploads</li>
                        </ul>
                        <button className="w-full py-2 rounded-lg bg-slate-700 text-slate-300 cursor-not-allowed font-medium text-sm">Active</button>
                    </div>

                    {/* Pro Plan */}
                    <div className="bg-gradient-to-b from-purple-900/40 to-slate-800/50 rounded-xl p-6 border border-purple-500/50 relative transform md:-translate-y-2 shadow-xl shadow-purple-500/10">
                        {currentPlan === 'pro' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">Current Plan</div>}
                        <h3 className="text-xl font-bold text-purple-400 mb-1">Pro</h3>
                        <div className="text-3xl font-bold text-white mb-4">$5 <span className="text-sm font-normal text-slate-400">/mo</span></div>
                        <ul className="space-y-3 mb-6">
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-purple-400 shrink-0 mt-0.5" /> Everything in Free</li>
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-purple-400 shrink-0 mt-0.5" /> <strong className="text-white">Image Uploads</strong></li>
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-purple-400 shrink-0 mt-0.5" /> 20MB Image Quota per map</li>
                            <li className="flex items-start gap-2 text-sm text-slate-500"><X size={16} className="text-slate-600 shrink-0 mt-0.5" /> No Video Uploads</li>
                        </ul>
                        <button onClick={() => alert('Stripe Checkout Flow Initiated')} className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${currentPlan === 'pro' ? 'bg-slate-700 text-slate-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25'}`}>
                            {currentPlan === 'pro' ? 'Active' : 'Upgrade to Pro'}
                        </button>
                    </div>

                    {/* Ultra Plan */}
                    <div className="bg-gradient-to-b from-amber-900/40 to-slate-800/50 rounded-xl p-6 border border-amber-500/50 relative">
                        {currentPlan === 'ultra' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">Current Plan</div>}
                        <h3 className="text-xl font-bold text-amber-400 mb-1">Ultra</h3>
                        <div className="text-3xl font-bold text-white mb-4">$12 <span className="text-sm font-normal text-slate-400">/mo</span></div>
                        <ul className="space-y-3 mb-6">
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400 shrink-0 mt-0.5" /> Everything in Pro</li>
                            <li className="flex items-start gap-2 text-sm text-white font-medium"><Check size={16} className="text-amber-400 shrink-0 mt-0.5" /> Video Uploads</li>
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400 shrink-0 mt-0.5" /> 50MB Image Quota per map</li>
                            <li className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-amber-400 shrink-0 mt-0.5" /> 150MB Video Quota per map</li>
                        </ul>
                        <button onClick={() => alert('Stripe Checkout Flow Initiated')} className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${currentPlan === 'ultra' ? 'bg-slate-700 text-slate-300 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/25'}`}>
                            {currentPlan === 'ultra' ? 'Active' : 'Upgrade to Ultra'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
