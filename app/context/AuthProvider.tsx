'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db, googleProvider } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

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
    autoSaveInterval: number; // User preference
    storageUsed: number;  // Current media storage used in bytes
    extraStorage?: number; // Purchased extra storage in bytes
    storageLimit: number; // Maximum allowed storage in bytes based on plan
    role: 'member' | 'admin';
    banUntil?: number;
    isPermabanned?: boolean;
    planExpiresAt?: number;
    activePerks?: { type: string; amount: number; expiresAt: number; packageId: string }[];
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
    storageLimits: {
        free: number;
        pro: number;
        ultra: number;
    };
    autoSaveOptions: { label: string; value: number; minPlan: 'free' | 'pro' | 'ultra' }[];
    additionalProjectSlots: { label: string; price: number; slots: number }[];
    additionalPinSlots: { label: string; price: number; slots: number }[];
    additionalStoragePackages: { label: string; price: number; amount: number }[];
    offers: {
        id: string;
        label: string;
        targetPackageId: string;
        targetPackageType: 'plans' | 'addSlots' | 'addPins' | 'addStorage';
        discountType: 'percentage' | 'fixed';
        discountValue: number;
        durationDays: number | null;
        finalPrice: number;
        expiresAt: number | null;
        maxUses: number | null;
    }[];
    bankDetails: {
        bankName: string;
        branch: string;
        accountNumber: string;
        accountHolder: string;
    };
    maintenanceMode: boolean;
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
            // Check Cache (7 days) - Skip if forced
            if (!force) {
                const cached = localStorage.getItem('appSettings');
                const cacheTime = localStorage.getItem('appSettingsTime');
                if (cached && cacheTime) {
                    const age = Date.now() - parseInt(cacheTime);
                    if (age < 7 * 24 * 60 * 60 * 1000) { // 7 Days
                        setSettings(JSON.parse(cached));
                        return;
                    }
                }
            }

            const plansDoc = await getDoc(doc(db, 'settings', 'plans'));
            const pinsDoc = await getDoc(doc(db, 'settings', 'pin_settings'));
            const limitsDoc = await getDoc(doc(db, 'settings', 'default_project_limit'));
            const storageLimitsDoc = await getDoc(doc(db, 'settings', 'storage_limits'));
            // Fetch auto_saving_times for Mind Maps (Restoring logic)
            const autoSaveDoc = await getDoc(doc(db, 'settings', 'auto_saving_times'));
            const addProjDoc = await getDoc(doc(db, 'settings', 'additional_project_items'));
            const addPinsDoc = await getDoc(doc(db, 'settings', 'additional_project_pins'));
            const addStorageDoc = await getDoc(doc(db, 'settings', 'additional_storage_items'));
            const offersDoc = await getDoc(doc(db, 'settings', 'offers'));
            const bankDoc = await getDoc(doc(db, 'settings', 'bank_details'));
            const systemDoc = await getDoc(doc(db, 'settings', 'system'));

            // Helper to format Duration
            const fmtDuration = (val: number | string) => {
                if (val === 'desable' || val === 0) return 'Disable Auto-save';
                const sec = Number(val);
                if (sec < 60) return `${sec} min`; // Screenshot shows 10, 15, 20, 30 which are likely minutes based on request context ("20 min")
                return `${Math.floor(sec / 60)} hr`;
            };

            // Helper to map plan for autosave
            const getMinPlan = (val: number | string): 'free' | 'pro' | 'ultra' => {
                if (val === 'desable' || val === 0) return 'free';
                const min = Number(val);
                if (min >= 20) return 'pro';  // 20, 30 mins
                return 'ultra';               // 10, 15 mins
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
                storageLimits: {
                    free: storageLimitsDoc.exists() ? storageLimitsDoc.data()?.free : 100 * 1024 * 1024,
                    pro: storageLimitsDoc.exists() ? storageLimitsDoc.data()?.pro : 1024 * 1024 * 1024,
                    ultra: storageLimitsDoc.exists() ? storageLimitsDoc.data()?.ultra : 10 * 1024 * 1024 * 1024,
                },
                autoSaveOptions: [],
                additionalProjectSlots: [],
                additionalPinSlots: [],
                additionalStoragePackages: [],
                offers: [],
                bankDetails: {
                    bankName: bankDoc.data()?.bank_name || '',
                    branch: bankDoc.data()?.banch || '',
                    accountNumber: bankDoc.data()?.account_number || '',
                    accountHolder: bankDoc.data()?.account_holder_name || ''
                },
                maintenanceMode: systemDoc.exists() ? systemDoc.data()?.maintenanceMode || false : false
            };

            // Parse Auto/Save Times for Mind Maps (auto_saving_times)
            if (autoSaveDoc.exists()) {
                const data = autoSaveDoc.data();
                const options: any[] = [];
                Object.values(data).forEach((val: any) => {
                    const isDisable = val === 'desable';
                    const minutes = isDisable ? 0 : Number(val);
                    options.push({
                        label: isDisable ? 'Disable Auto-save' : `${minutes} min`,
                        value: isDisable ? 0 : minutes * 60 * 1000,
                        minPlan: getMinPlan(isDisable ? 'desable' : minutes)
                    });
                });
                parsedSettings.autoSaveOptions = options.sort((a, b) => a.value - b.value);
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
                    const match = key.match(/(\d+)\s+Pins/i);
                    const slots = match ? parseInt(match[1]) : 0;
                    parsedSettings.additionalPinSlots.push({
                        label: key.replace(/_/g, ' '),
                        price: Number(price),
                        slots: slots
                    });
                });
            }

            // Parse Add Storage Packages
            if (addStorageDoc.exists()) {
                Object.entries(addStorageDoc.data()).forEach(([key, price]) => {
                    const match = key.match(/(\d+)\s+GB/i);
                    const amount = match ? parseInt(match[1]) : 0;
                    parsedSettings.additionalStoragePackages.push({
                        label: key.replace(/_/g, ' '),
                        price: Number(price),
                        amount: amount
                    });
                });
            }

            // Parse Offers
            if (offersDoc.exists()) {
                Object.entries(offersDoc.data()).forEach(([key, offerObj]: [string, any]) => {
                    // Type check to avoid crashes during migration
                    if (typeof offerObj === 'object' && offerObj !== null && offerObj.targetPackageId) {
                        parsedSettings.offers.push({
                            id: key,
                            label: offerObj.label || key,
                            targetPackageId: offerObj.targetPackageId,
                            targetPackageType: offerObj.targetPackageType,
                            discountType: offerObj.discountType,
                            discountValue: Number(offerObj.discountValue),
                            durationDays: Number(offerObj.durationDays),
                            finalPrice: Number(offerObj.finalPrice),
                            expiresAt: offerObj.expiresAt || null,
                            maxUses: offerObj.maxUses ?? null
                        });
                    }
                });
            }

            // Optional: Sort them logically by slots/amount
            parsedSettings.additionalProjectSlots.sort((a, b) => a.slots - b.slots);
            parsedSettings.additionalPinSlots.sort((a, b) => a.slots - b.slots);
            parsedSettings.additionalStoragePackages.sort((a, b) => a.amount - b.amount);

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

                // Check Plan Expiration
                if (data.planExpiresAt && Date.now() > data.planExpiresAt && data.plan !== 'free') {
                    // Expired - Downgrade in DB
                    try {
                        await updateDoc(userRef, {
                            plan: 'free',
                            planExpiresAt: null
                        });
                        console.log("Plan expired. Auto-downgraded to free.");
                        data.plan = 'free'; // Update local
                        data.planExpiresAt = null;
                    } catch (e) {
                        console.error("Error auto-downgrading", e);
                    }
                }

                // Check Perk Expirations
                let activePerks = data.activePerks || [];
                let needsPerkUpdate = false;
                let expiredSlots = 0, expiredPins = 0, expiredStorage = 0;
                const now = Date.now();

                const validPerks = activePerks.filter((perk: any) => {
                    if (perk.expiresAt && now > perk.expiresAt) {
                        needsPerkUpdate = true;
                        if (perk.type === 'slots') expiredSlots += perk.amount;
                        if (perk.type === 'pins') expiredPins += perk.amount;
                        if (perk.type === 'storage') expiredStorage += perk.amount;
                        return false; // remove from valid
                    }
                    return true;
                });

                if (needsPerkUpdate) {
                    try {
                        const newExtraSlots = Math.max(0, (data.extraSlots || 0) - expiredSlots);
                        const newExtraPins = Math.max(0, (data.extraPins || 0) - expiredPins);
                        const newExtraStorage = Math.max(0, (data.extraStorage || 0) - expiredStorage);
                        
                        await updateDoc(userRef, {
                            activePerks: validPerks,
                            extraSlots: newExtraSlots,
                            extraPins: newExtraPins,
                            extraStorage: newExtraStorage
                        });
                        
                        data.activePerks = validPerks;
                        data.extraSlots = newExtraSlots;
                        data.extraPins = newExtraPins;
                        data.extraStorage = newExtraStorage;
                        console.log("Expired perks cleaned up.");
                    } catch (e) {
                        console.error("Error cleaning up expired perks", e);
                    }
                }

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
                    autoSaveInterval: data.autoSaveInterval ?? 1800000, // Default 30 min if undefined
                    role: data.role || 'member',
                    banUntil: data.banUntil,
                    isPermabanned: data.isPermabanned,
                    planExpiresAt: data.planExpiresAt,
                    activePerks: data.activePerks || [],
                    storageUsed: data.storageUsed || 0,
                    extraStorage: data.extraStorage || 0,
                    storageLimit: data.storageLimit || (data.plan === 'ultra' ? 10 * 1024 * 1024 * 1024 : data.plan === 'pro' ? 1024 * 1024 * 1024 : 100 * 1024 * 1024)
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
                    autoSaveInterval: 1800000, // 30 min
                    role: 'member',
                    activePerks: [],
                    storageUsed: 0,
                    storageLimit: 100 * 1024 * 1024
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
