import { db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, getDocs, query, where, addDoc, updateDoc } from "firebase/firestore";

export interface MindMapData {
    id: string;
    userId: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

export async function createMindMap(userId: string, title: string) {
    if (!userId) throw new Error("User ID is required");

    // Initial content with the title as the root node
    const content = `# ${title}`;

    const docData = {
        userId,
        title,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "markmaps"), docData);
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
