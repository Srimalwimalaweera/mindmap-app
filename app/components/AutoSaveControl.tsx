'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthProvider';
import { Shield, Lock } from 'lucide-react';

interface AutoSaveControlProps {
    onSave: () => void;
    isSaving: boolean;
    onIntervalChange: (intervalMs: number) => void;
    scheduledSaveTime: number | null;
}

// Removed static INTERVALS


export default function AutoSaveControl({ onSave, isSaving, onIntervalChange, scheduledSaveTime }: AutoSaveControlProps) {
    const { userData, settings } = useAuth();
    const [selectedInterval, setSelectedInterval] = useState({ label: '30 min', value: 30 * 60 * 1000, minPlan: 'free' });
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [timeLeft, setTimeLeft] = useState<string | null>(null);

    const intervals = settings?.autoSaveOptions || []; // Use dynamic settings

    useEffect(() => {
        if (intervals.length > 0 && selectedInterval.value === 30 * 60 * 1000) {
            // Try to set initial interval matching user preference
            const match = intervals.find(i => i.value === userData?.autoSaveInterval);
            if (match) setSelectedInterval(match as any);
        }
    }, [intervals, userData]);

    const isLocked = (minPlan: string) => {
        if (!userData) return true;
        if (userData.plan === 'ultra') return false;
        if (userData.plan === 'pro') return minPlan === 'ultra';
        return minPlan === 'pro' || minPlan === 'ultra';
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Timer Logic for Countdown Display
    useEffect(() => {
        if (!scheduledSaveTime) {
            setTimeLeft(null);
            return;
        }

        const updateTimer = () => {
            const now = Date.now();
            const diff = scheduledSaveTime - now;

            if (diff <= 0) {
                setTimeLeft('saving...');
                return;
            }

            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            // Format: MM:SS or SSs if less than a minute
            if (minutes > 0) {
                setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
            } else {
                setTimeLeft(`${seconds}s`);
            }
        };

        updateTimer(); // Initial call
        const intervalId = setInterval(updateTimer, 1000);

        return () => clearInterval(intervalId);
    }, [scheduledSaveTime]);

    const handleIntervalSelect = (interval: typeof INTERVALS[0]) => {
        setSelectedInterval(interval);
        onIntervalChange(interval.value);
        setIsOpen(false);
    };

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative flex items-center shadow-lg shadow-black/10 rounded-full" ref={dropdownRef}>
                {/* Main Save Button */}
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 rounded-l-full border-r border-gray-700 dark:border-gray-200 min-w-[120px] select-none"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>

                {/* Dropdown Trigger */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="px-2 py-2 text-white bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-r-full transition-colors focus:outline-none select-none"
                    title="Auto-save settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 py-1 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-700/50 select-none">
                            Auto-save Interval
                        </div>
                        {intervals.map((interval) => {
                            const locked = isLocked(interval.minPlan);
                            return (
                                <button
                                    key={interval.label}
                                    onClick={() => !locked && handleIntervalSelect(interval as any)}
                                    disabled={locked}
                                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors
                                        ${selectedInterval.label === interval.label ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10' :
                                            locked ? 'text-zinc-400 cursor-not-allowed bg-zinc-50 dark:bg-zinc-800/50' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {interval.label}
                                        {locked && (
                                            <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-500 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                                                <Shield size={10} /> {interval.minPlan}
                                            </span>
                                        )}
                                    </span>
                                    {selectedInterval.label === interval.label && (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Countdown Display - Positioned Below */}
            {timeLeft && (
                <div className="text-[10px] font-mono text-white/80 select-none tabular-nums">
                    auto save: {timeLeft}
                </div>
            )}
        </div>
    );
}
