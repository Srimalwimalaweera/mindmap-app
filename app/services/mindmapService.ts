import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc, writeBatch, increment, getCountFromServer } from "firebase/firestore";

export interface MindMapData {
    id: string;
    userId: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    type: 'map' | 'book';
    isPinned?: boolean;
    isTrashed?: boolean;
    trashedAt?: string;
}

export async function createMindMap(userId: string, title: string, type: 'map' | 'book' = 'map') {
    if (!userId) throw new Error("User ID is required");

    // Initial content with the title as the root node and a ghost node
    const content = `# ${title}\n## @[[ADD_NEW]]`;

    const docData = {
        userId,
        title,
        content,
        type,
        isPinned: false,
        isTrashed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "markmaps"), docData);

    // Update User Stats
    try {
        const userRef = doc(db, "users", userId);
        const updatePayload: any = {
            projectCount: increment(1),
            totalMaps: increment(1) // Total created all time
        };
        if (type === 'book') {
            updatePayload.totalBooks = increment(1);
        }
        await updateDoc(userRef, updatePayload);
    } catch (e) {
        console.error("Error updating user stats", e);
    }

    return docRef.id;
}

export async function getUserMindMaps(userId: string): Promise<MindMapData[]> {
    if (!userId) return [];

    const q = query(collection(db, "markmaps"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as MindMapData[];
}

export async function saveMindMap(mapId: string, content: string) {
    if (!mapId) throw new Error("Map ID is required");

    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, {
        content,
        updatedAt: new Date().toISOString()
    });
}

export async function getMindMap(mapId: string): Promise<string | null> {
    if (!mapId) return null;

    const mapRef = doc(db, "markmaps", mapId);
    const snapshot = await getDoc(mapRef);

    if (snapshot.exists()) {
        return snapshot.data().content as string;
    }
    return null;
}

export async function togglePinMindMap(mapId: string, isPinned: boolean) {
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, { isPinned });
}

export async function softDeleteMindMap(mapId: string) {
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, {
        isTrashed: true,
        trashedAt: new Date().toISOString()
    });
}

export async function restoreMindMap(mapId: string) {
    const mapRef = doc(db, "markmaps", mapId);
    await updateDoc(mapRef, {
        isTrashed: false,
        trashedAt: null
    });
}

export async function permanentDeleteMindMap(mapId: string) {
    const mapRef = doc(db, "markmaps", mapId);

    // Attempt to get doc to find userId for decrementing stats
    // Note: If doc is already deleted (race condition), this might fail to decrement.
    // For strict consistency, cloud functions are better, but client-side is acceptable here.
    try {
        const snap = await getDoc(mapRef);
        if (snap.exists()) {
            const data = snap.data();
            const userId = data.userId;
            if (userId) {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    projectCount: increment(-1)
                });
            }
        }
    } catch (e) {
        console.error("Error updating stats on delete", e);
    }

    await deleteDoc(mapRef);
}

export async function emptyTrash(userId: string) {
    const q = query(
        collection(db, "markmaps"),
        where("userId", "==", userId),
        where("isTrashed", "==", true)
    );
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
}

export async function getUserRealtimeCounts(userId: string) {
    if (!userId) return { maps: 0, books: 0 };

    try {
        const coll = collection(db, "markmaps");

        // Count Maps
        const qMaps = query(
            coll,
            where("userId", "==", userId),
            where("type", "==", "map"),
            where("isTrashed", "==", false)
        );
        const snapMaps = await getCountFromServer(qMaps);

        // Count Books
        const qBooks = query(
            coll,
            where("userId", "==", userId),
            where("type", "==", "book"),
            where("isTrashed", "==", false)
        );
        const snapBooks = await getCountFromServer(qBooks);

        return {
            maps: snapMaps.data().count,
            books: snapBooks.data().count
        };
    } catch (e) {
        console.error("Error fetching counts", e);
        return { maps: 0, books: 0 };
    }
}
