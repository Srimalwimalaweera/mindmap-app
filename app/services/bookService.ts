
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

export interface BookData {
    id: string;
    userId: string;
    title: string;
    subject?: string;
    orientation: 'portrait' | 'landscape';
    thumbUrl?: string;
    createdAt?: any;
    updatedAt?: any;
    type: 'book';
    isPinned?: boolean;
    isTrashed?: boolean;
    trashedAt?: string;
}

const COLLECTION_NAME = 'books';

export const createBook = async (userId: string, title: string, orientation: 'portrait' | 'landscape', subject?: string): Promise<string> => {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        userId,
        title,
        orientation,
        subject: subject || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isTrashed: false,
        type: 'book'
    });
    return docRef.id;
};

export const getBooks = async (userId: string): Promise<BookData[]> => {
    const q = query(collection(db, COLLECTION_NAME), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'book' } as BookData));
};

export const getBook = async (bookId: string): Promise<BookData | null> => {
    const docRef = doc(db, COLLECTION_NAME, bookId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as BookData;
    }
    return null;
};

export const updateBook = async (bookId: string, data: Partial<BookData>) => {
    const docRef = doc(db, COLLECTION_NAME, bookId);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
};

export const saveBookPages = async (uid: string, bookId: string, pages: any[]) => {
    const jsonString = JSON.stringify(pages);
    const storageRef = ref(storage, `books/${uid}/${bookId}.json`);
    await uploadString(storageRef, jsonString);
};

export const loadBookPages = async (uid: string, bookId: string): Promise<any[]> => {
    try {
        const storageRef = ref(storage, `books/${uid}/${bookId}.json`);
        const url = await getDownloadURL(storageRef);
        const res = await fetch(url);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn("No saved pages found or error loading:", e);
        return [];
    }
};

export const softDeleteBook = async (bookId: string) => {
    console.log(`[BookService] Soft deleting book: ${bookId}`);
    try {
        const docRef = doc(db, COLLECTION_NAME, bookId);
        await updateDoc(docRef, {
            isTrashed: true,
            trashedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
        });
        console.log(`[BookService] Successfully marked book ${bookId} as trashed.`);
    } catch (e) {
        console.error(`[BookService] Error soft deleting book ${bookId}`, e);
        throw e;
    }
};

export const restoreBook = async (bookId: string) => {
    await updateBook(bookId, { isTrashed: false, trashedAt: undefined });
};

export const permanentDeleteBook = async (userId: string, bookId: string) => {
    const docRef = doc(db, COLLECTION_NAME, bookId);
    await deleteDoc(docRef);

    // Try delete storage
    try {
        const storageRef = ref(storage, `books/${userId}/${bookId}.json`);
        await deleteObject(storageRef);
    } catch (e) {
        console.warn("Storage file not found or already deleted", e);
    }
};

export const emptyBooksTrash = async (userId: string) => {
    const q = query(
        collection(db, COLLECTION_NAME),
        where("userId", "==", userId),
        where("isTrashed", "==", true)
    );
    const querySnapshot = await getDocs(q);

    // We cannot use batch for storage deletions, so we iterate
    const deletePromises = querySnapshot.docs.map(async (docSnap) => {
        // Delete Firestore Doc
        await deleteDoc(doc(db, COLLECTION_NAME, docSnap.id));

        // Delete Storage File
        try {
            const storageRef = ref(storage, `books/${userId}/${docSnap.id}.json`);
            await deleteObject(storageRef);
        } catch (e) {
            // Ignore storage not found
            console.warn(`[BookService] Storage clean for ${docSnap.id} skipped/failed`, e);
        }
    });

    await Promise.all(deletePromises);
};
