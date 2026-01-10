import { db } from "@/lib/firebase";
import { collection, doc, getDoc, addDoc, updateDoc, serverTimestamp, query, where, getDocs, increment } from "firebase/firestore";

export async function createPaymentRequest(userId: string, data: { type: string, itemId: string, amount: number, details: string }) {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("User not found");

    const userData = userSnap.data();
    const now = Date.now();

    // 1. Check if Banned
    if (userData.isPermabanned) throw new Error("User is permanently banned");
    if (userData.banUntil && userData.banUntil > now) {
        const daysLeft = Math.ceil((userData.banUntil - now) / (1000 * 60 * 60 * 24));
        throw new Error(`User is banned for ${daysLeft} more days`);
    }

    // 2. Check Rate Limit (30s)
    const lastTime = userData.lastPaymentReq || 0;
    if (now - lastTime < 30 * 1000) {
        throw new Error("Please wait 30 seconds between requests.");
    }

    // 3. Spam Check (Window: 2 mins, Max: 3 calls allowed, 4th triggers ban)
    let spamCount = userData.spamReqCount || 0;
    let spamWindow = userData.spamReqWindow || now;

    if (now - spamWindow > 2 * 60 * 1000) {
        // Reset window if older than 2 mins
        spamCount = 1;
        spamWindow = now;
    } else {
        spamCount++;
    }

    // Trigger Ban if count > 3 (i.e., this is the 4th request in 2 mins)
    if (spamCount > 3) {
        const currentBanLevel = userData.banLevel || 0;
        const newBanLevel = currentBanLevel + 1;

        let banDuration = 0;
        let dateString = "";

        if (newBanLevel === 1) {
            banDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
            dateString = "7 days";
        } else if (newBanLevel === 2) {
            banDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
            dateString = "30 days";
        } else {
            // Permanent
            await updateDoc(userRef, {
                banLevel: 3,
                isPermabanned: true,
                banReason: "Excessive spam requests"
            });
            throw new Error("You have been permanently banned due to excessive spam.");
        }

        await updateDoc(userRef, {
            banUntil: now + banDuration,
            banLevel: newBanLevel,
            spamReqCount: 0 // Reset count so they are fresh after ban
        });

        throw new Error(`You interpret spamming? Account banned for ${dateString}.`);
    }

    // 4. Create Request
    await addDoc(collection(db, "payment_requests"), {
        userId,
        userName: userData.displayName || "Unknown",
        userEmail: userData.email || "No Email",
        ...data,
        status: 'pending',
        timestamp: serverTimestamp(), // Firestore server time for ordering
        createdAt: now // Client time for display if needed
    });

    // 5. Update User Stats
    await updateDoc(userRef, {
        lastPaymentReq: now,
        spamReqCount: spamCount,
        spamReqWindow: spamWindow
    });

    return { success: true };
}

// --- Admin Functions ---

export async function getPayments(status: 'pending' | 'approved' | 'rejected') {
    const q = query(collection(db, "payment_requests"), where("status", "==", status)); // Order by in client or need index
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approvePayment(reqId: string, userId: string, type: string, itemId: string, amount: number) {
    const reqRef = doc(db, "payment_requests", reqId);
    const userRef = doc(db, "users", userId);

    await updateDoc(reqRef, { status: 'approved', approvedAt: serverTimestamp() });

    // Grant Items
    if (type === 'upgrade') {
        await updateDoc(userRef, {
            plan: itemId,
            // Reset limits to defaults of that plan? Or dynamic calc handles it.
            // But we should update limits if hardcoded in user doc.
            // Actually AuthProvider logic uses plan to determine limits mostly, but we store projectLimit?
            // Let's just update the plan. AuthProvider logic should handle derived limits or we update them here if we want to be safe.
        });
    } else if (type === 'slots') {
        // itemId is like "5 Slots"
        const match = itemId.match(/(\d+)/);
        const count = match ? parseInt(match[1]) : 0;
        await updateDoc(userRef, {
            extraSlots: increment(count)
        });
    } else if (type === 'pins') {
        const match = itemId.match(/(\d+)/);
        const count = match ? parseInt(match[1]) : 0;
        await updateDoc(userRef, {
            extraPins: increment(count)
        });
    }
}

export async function rejectPayment(reqId: string, userId: string) {
    const reqRef = doc(db, "payment_requests", reqId);
    const userRef = doc(db, "users", userId);
    const now = Date.now();

    await updateDoc(reqRef, { status: 'rejected', rejectedAt: serverTimestamp() });

    // Penalty Logic
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    const userData = userSnap.data();

    // Track Rejections
    const rejectionHistory = userData.rejectionHistory || [];
    rejectionHistory.push(now);

    // Filter windows
    const last2Days = rejectionHistory.filter((t: number) => now - t < 2 * 24 * 60 * 60 * 1000).length;
    const last7Days = rejectionHistory.filter((t: number) => now - t < 7 * 24 * 60 * 60 * 1000).length;
    const last30Days = rejectionHistory.filter((t: number) => now - t < 30 * 24 * 60 * 60 * 1000).length;

    let banDuration = 0;
    if (last30Days >= 15) {
        banDuration = 90 * 24 * 60 * 60 * 1000; // 90 days
    } else if (last7Days >= 8) {
        banDuration = 21 * 24 * 60 * 60 * 1000; // 3 weeks
    } else if (last2Days >= 4) {
        banDuration = 5 * 24 * 60 * 60 * 1000; // 5 days
    }

    if (banDuration > 0) {
        await updateDoc(userRef, {
            banUntil: now + banDuration,
            banReason: "Too many rejected payments",
            rejectionHistory // Save history
        });
    } else {
        await updateDoc(userRef, { rejectionHistory });
    }
}
