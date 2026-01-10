'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db, googleProvider } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

// --- Types ---

export type PlanType = 'free' | 'pro' | 'ultra';

export interface UserData {
    uid: string;
    email: string | null;
    displayName: string | null;
    plan: PlanType;
    projectCount: number; // For quickly checking limits
    projectLimit: number; // Calculated based on Plan + Purchased Slots
    extraSlots: number;   // Purchased extra slots
    pinCount: number;     // Current pinned count
    pinLimit: number;     // Calculated based on Plan + Purchased Pins
    extraPins: number;    // Purchased extra pins
    totalMaps: number;    // Statistics
    totalBooks: number;   // Statistics
    autoSaveInterval: number; // User preference
    role: 'member' | 'admin';
    banUntil?: number;
    isPermabanned?: boolean;
}

export interface AppSettings {
    plans: {
        free: number;
        pro: number;
        ultra: number;
    };
    pinLimits: {
        free: number;
        pro: number;
        ultra: number;
    };
    projectLimits: {
        free: number;
        pro: number;
        ultra: number;
    };
    autoSaveOptions: { label: string; value: number; minPlan: 'free' | 'pro' | 'ultra' }[];
    additionalProjectSlots: { label: string; price: number; slots: number }[];
    additionalPinSlots: { label: string; price: number; slots: number }[];
    bankDetails: {
        bankName: string;
        branch: string;
        accountNumber: string;
        accountHolder: string;
    };
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    settings: AppSettings | null;
    loading: boolean;
    logout: () => Promise<void>;
    refreshUserData: () => Promise<void>;
    refreshSettings: () => Promise<void>; // Added for manual refresh
    updateAutoSaveInterval: (ms: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    settings: null,
    loading: true,
    logout: async () => { },
    refreshUserData: async () => { },
    refreshSettings: async () => { },
    updateAutoSaveInterval: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);

    // 1. Fetch System Settings (Run once)
    const fetchSettings = useCallback(async (force: boolean = false) => {
        try {
            // Check Cache (24 hours) - Skip if forced
            if (!force) {
                const cached = localStorage.getItem('appSettings');
                const cacheTime = localStorage.getItem('appSettingsTime');
                if (cached && cacheTime) {
                    const age = Date.now() - parseInt(cacheTime);
                    if (age < 24 * 60 * 60 * 1000) {
                        setSettings(JSON.parse(cached));
                        return;
                    }
                }
            }

            const plansDoc = await getDoc(doc(db, 'settings', 'plans'));
            const pinsDoc = await getDoc(doc(db, 'settings', 'pin_settings'));
            const limitsDoc = await getDoc(doc(db, 'settings', 'default_project_limit'));
            const autoSaveDoc = await getDoc(doc(db, 'settings', 'auto_saving_times'));

            const addProjDoc = await getDoc(doc(db, 'settings', 'additional_project_items'));
            const addPinsDoc = await getDoc(doc(db, 'settings', 'additional_project_pins'));
            const bankDoc = await getDoc(doc(db, 'settings', 'bank_details'));

            // Helper to format Duration
            const fmtDuration = (sec: number) => {
                if (sec < 60) return `${sec} sec`;
                return `${Math.floor(sec / 60)} min`;
            };

            // Helper to map plan for autosave
            const getMinPlan = (sec: number): 'free' | 'pro' | 'ultra' => {
                if (sec >= 1200) return 'free'; // 20m+
                if (sec >= 300) return 'pro';   // 5m+
                return 'ultra';                 // <5m
            };

            const parsedSettings: AppSettings = {
                plans: {
                    free: plansDoc.data()?.free ?? 0,
                    pro: plansDoc.data()?.pro ?? 900,
                    ultra: plansDoc.data()?.ultra ?? 1650,
                },
                pinLimits: {
                    free: pinsDoc.data()?.free ?? 5,
                    pro: pinsDoc.data()?.pro ?? 10,
                    ultra: pinsDoc.data()?.ultra ?? 9999,
                },
                projectLimits: {
                    free: limitsDoc.data()?.free ?? 10,
                    pro: limitsDoc.data()?.pro ?? 20,
                    ultra: limitsDoc.data()?.ultra ?? 50,
                },
                autoSaveOptions: [],
                additionalProjectSlots: [],
                additionalPinSlots: [],
                bankDetails: {
                    bankName: bankDoc.data()?.bank_name || '',
                    branch: bankDoc.data()?.banch || '',
                    accountNumber: bankDoc.data()?.account_number || '',
                    accountHolder: bankDoc.data()?.account_holder_name || ''
                }
            };

            // Parse Auto/Save Times
            if (autoSaveDoc.exists()) {
                const values = Object.values(autoSaveDoc.data()).map(v => Number(v)).sort((a, b) => a - b);
                parsedSettings.autoSaveOptions = values.map(val => ({
                    label: fmtDuration(val),
                    value: val * 1000,
                    minPlan: getMinPlan(val)
                }));
            }

            // Parse Add Project Slots
            if (addProjDoc.exists()) {
                Object.entries(addProjDoc.data()).forEach(([key, price]) => {
                    const match = key.match(/(\d+)\s+slots/i);
                    const slots = match ? parseInt(match[1]) : 0;
                    parsedSettings.additionalProjectSlots.push({
                        label: key.replace(/_/g, ' '),
                        price: Number(price),
                        slots: slots
                    });
                });
            }
            // Parse Add Pin Slots
            if (addPinsDoc.exists()) {
                Object.entries(addPinsDoc.data()).forEach(([key, price]) => {
                    const match = key.match(/(\d+)\s+pins/i);
                    const slots = match ? parseInt(match[1]) : 0;
                    parsedSettings.additionalPinSlots.push({
                        label: key.replace(/_/g, ' '),
                        price: Number(price),
                        slots: slots
                    });
                });
            }

            setSettings(parsedSettings);
            // Cache It
            localStorage.setItem('appSettings', JSON.stringify(parsedSettings));
            localStorage.setItem('appSettingsTime', Date.now().toString());

        } catch (err) {
            console.error("Failed to load settings:", err);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);


    // 2. Auth State & User Data
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser); // Set basic auth user immediately

            if (currentUser) {
                await loadUserData(currentUser.uid, currentUser);
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const loadUserData = async (uid: string, currentUser?: User) => {
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                setUserData({
                    uid,
                    email: data.email,
                    displayName: data.displayName,
                    plan: data.plan || 'free',
                    projectCount: data.projectCount || 0,
                    projectLimit: data.projectLimit || 10,
                    extraSlots: data.extraSlots || 0,
                    pinCount: data.pinCount || 0,
                    pinLimit: data.pinLimit || 5,
                    extraPins: data.extraPins || 0,
                    totalMaps: data.totalMaps || 0,
                    totalBooks: data.totalBooks || 0,
                    autoSaveInterval: data.autoSaveInterval || 1800000, // Default 30 min
                    role: data.role || 'member',
                    banUntil: data.banUntil,
                    isPermabanned: data.isPermabanned
                });
            } else {
                // Initialize New User
                const newUser: UserData = {
                    uid,
                    email: currentUser?.email || null,
                    displayName: currentUser?.displayName || null,
                    plan: 'free',
                    projectCount: 0,
                    projectLimit: 10, // Default free
                    extraSlots: 0,
                    pinCount: 0,
                    pinLimit: 5,      // Default free
                    extraPins: 0,
                    totalMaps: 0,
                    totalBooks: 0,
                    autoSaveInterval: 1800000, // 30 min
                    role: 'member'
                };
                await setDoc(userRef, newUser as any);
                setUserData(newUser);
            }
        } catch (err) {
            console.error("Error loading user data:", err);
        }
    };

    const logout = async () => {
        await firebaseSignOut(auth);
        setUser(null);
        setUserData(null);
    };

    const refreshUserData = async () => {
        if (user) await loadUserData(user.uid);
    };

    const updateAutoSaveInterval = async (ms: number) => {
        if (!user) return;
        try {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, { autoSaveInterval: ms }, { merge: true });
            setUserData(prev => prev ? { ...prev, autoSaveInterval: ms } : null);
        } catch (e) {
            console.error("Error updating settings", e);
        }
    };

    const value = {
        user,
        userData,
        settings,
        loading,
        logout,
        refreshUserData,
        refreshSettings: () => fetchSettings(true), // Expose fetcher with force=true
        updateAutoSaveInterval
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
