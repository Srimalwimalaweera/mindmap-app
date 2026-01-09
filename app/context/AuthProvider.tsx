'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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
    autoSaveOptions: number[]; // Array of allowed seconds e.g. [30, 60, ... 1800]
    additionalProjectSlots: { label: string; price: number; slots: number }[];
    additionalPinSlots: { label: string; price: number; slots: number }[];
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    settings: AppSettings | null;
    loading: boolean;
    logout: () => Promise<void>;
    refreshUserData: () => Promise<void>;
    updateAutoSaveInterval: (ms: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    settings: null,
    loading: true,
    logout: async () => { },
    refreshUserData: async () => { },
    updateAutoSaveInterval: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);

    // 1. Fetch System Settings (Run once)
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // We'll fetch the individual documents from 'settings' collection
                // Structure assumed based on user request:
                // settings/plans
                // settings/pin_settings
                // settings/default_project_limit
                // settings/auto_saving_times (Wait, user said fields are 1:30, 2:60. We'll convert vals to array)
                // settings/additional_project_items 
                // settings/additional_project_pins (guessing name based on pattern)

                const plansDoc = await getDoc(doc(db, 'settings', 'plans'));
                const pinsDoc = await getDoc(doc(db, 'settings', 'pin_settings'));
                const limitsDoc = await getDoc(doc(db, 'settings', 'default_project_limit'));
                const autoSaveDoc = await getDoc(doc(db, 'settings', 'auto_saving_times'));

                // Additional Items (Might be in subcollections or just fields, assuming fields based on screenshot "10 slots: 200")
                const addProjDoc = await getDoc(doc(db, 'settings', 'additional_project_items'));
                // const addPinsDoc = await getDoc(doc(db, 'settings', 'additional_project_pins')); // Assuming existing or empty

                const parsedSettings: AppSettings = {
                    plans: {
                        free: plansDoc.data()?.free ?? 0,
                        pro: plansDoc.data()?.pro ?? 900,
                        ultra: plansDoc.data()?.ultra ?? 1650,
                    },
                    pinLimits: {
                        free: pinsDoc.data()?.free ?? 5,
                        pro: pinsDoc.data()?.pro ?? 10,
                        ultra: pinsDoc.data()?.ultra ?? 9999, // 0 usually means unlimited, we'll implement logic
                    },
                    projectLimits: {
                        free: limitsDoc.data()?.free ?? 10,
                        pro: limitsDoc.data()?.pro ?? 20,
                        ultra: limitsDoc.data()?.ultra ?? 50,
                    },
                    autoSaveOptions: [],
                    additionalProjectSlots: [],
                    additionalPinSlots: [],
                };

                // Parse Auto/Save Times
                if (autoSaveDoc.exists()) {
                    // Fields are "1": 30, "2": 60... map values to array
                    const times = Object.values(autoSaveDoc.data()).map(v => Number(v)).sort((a, b) => a - b);
                    parsedSettings.autoSaveOptions = times;
                }

                // Parse Add Project Slots
                if (addProjDoc.exists()) {
                    // "10 slots": 200
                    // We need to parse "10 slots" to get 10.
                    Object.entries(addProjDoc.data()).forEach(([key, price]) => {
                        const match = key.match(/(\d+)\s+slots/i);
                        if (match) {
                            parsedSettings.additionalProjectSlots.push({
                                label: key,
                                slots: parseInt(match[1]),
                                price: Number(price)
                            });
                        }
                    });
                }

                setSettings(parsedSettings);
            } catch (err) {
                console.error("Failed to load settings:", err);
            }
        };

        fetchSettings();
    }, []);


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
                    autoSaveInterval: data.autoSaveInterval || 1800000 // Default 30 min
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
                    autoSaveInterval: 1800000 // 30 min
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

    return (
        <AuthContext.Provider value={{ user, userData, settings, loading, logout, refreshUserData, updateAutoSaveInterval }}>
            {children}
        </AuthContext.Provider>
    );
}
