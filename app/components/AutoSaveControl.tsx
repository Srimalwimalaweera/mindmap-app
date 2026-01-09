'use client';

import { useState, useEffect, useRef } from 'react';

interface AutoSaveControlProps {
    onSave: () => void;
    isSaving: boolean;
    onIntervalChange: (intervalMs: number) => void;
    scheduledSaveTime: number | null;
}

const INTERVALS = [
    { label: '30 sec', value: 30 * 1000 },
    { label: '1 min', value: 60 * 1000 },
    { label: '3 min', value: 3 * 60 * 1000 },
    { label: '5 min', value: 5 * 60 * 1000 },
    { label: '10 min', value: 10 * 60 * 1000 },
    { label: '30 min', value: 30 * 60 * 1000 },
];

export default function AutoSaveControl({ onSave, isSaving, onIntervalChange, scheduledSaveTime }: AutoSaveControlProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedInterval, setSelectedInterval] = useState(INTERVALS[5]); // Default 30 min
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [timeLeft, setTimeLeft] = useState<string | null>(null);

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
        <div className="flex items-center gap-3">
            {/* Countdown Display - Positioned to the Left */}
            {timeLeft && (
                <div className="px-2 py-1 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700/50 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-sm animate-in fade-in duration-200 select-none tabular-nums">
                    auto save: {timeLeft}
                </div>
            )}

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
                        {INTERVALS.map((interval) => (
                            <button
                                key={interval.label}
                                onClick={() => handleIntervalSelect(interval)}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${selectedInterval.label === interval.label ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10' : 'text-zinc-700 dark:text-zinc-200'}`}
                            >
                                {interval.label}
                                {selectedInterval.label === interval.label && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
