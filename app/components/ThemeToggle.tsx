'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        // Check localStorage
        const storedTheme = localStorage.getItem('theme');

        // Default is already true (Dark). Only update if stored is explicitly 'light'.
        if (storedTheme === 'light') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDark(false);
            document.documentElement.classList.remove('dark');
        } else {
            // If stored is 'dark' or null (default), ensure class is present
            document.documentElement.classList.add('dark');
            // No need to call setIsDark(true) as it's default
        }
    }, []);

    const toggleTheme = () => {
        const newMode = !isDark;
        setIsDark(newMode);
        if (newMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    return (
        <button
            onClick={toggleTheme}
            className={`relative p-2 rounded-full transition-colors duration-300 hover:bg-gray-200 dark:hover:bg-zinc-700 focus:outline-none`}
            aria-label="Toggle Theme"
        >
            <div className="relative w-6 h-6 overflow-hidden">
                {/* Sun Icon */}
                <svg
                    className={`absolute top-0 left-0 w-6 h-6 text-yellow-500 transition-all duration-500 transform ${isDark ? 'rotate-90 opacity-0 translate-y-4' : 'rotate-0 opacity-100 translate-y-0'
                        }`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                </svg>

                {/* Moon Icon */}
                <svg
                    className={`absolute top-0 left-0 w-6 h-6 text-blue-400 transition-all duration-500 transform ${isDark ? 'rotate-0 opacity-100 translate-y-0' : '-rotate-90 opacity-0 -translate-y-4'
                        }`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                </svg>
            </div>
        </button>
    );
}
