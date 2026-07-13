import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  const errorString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorString);
  alert(`操作失敗 (Operation Failed): ${errInfo.error}`);
}

export async function markAttendance(itineraryId: string, scannedPayload: string) {
  try {
    const payload = JSON.parse(scannedPayload);
    const { uid, timestamp } = payload;

    if (!uid || !timestamp) {
      throw new Error('Invalid QR Code');
    }

    const now = Date.now();
    if (now - timestamp > 60000) {
      throw new Error('QR Code has expired. Please refresh the code.');
    }

    // Find the rollcall for the current itinerary
    const rollcallsRef = collection(db, 'rollcalls');
    const q = query(rollcallsRef, where('itineraryId', '==', itineraryId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('No active rollcall found for this itinerary.');
    }

    // Assume one rollcall per itinerary
    const rollcallDoc = querySnapshot.docs[0];
    const rollcallId = rollcallDoc.id;
    const data = rollcallDoc.data();

    // Update status Map
    const currentStatusMap = data.statusMap || {};
    currentStatusMap[uid] = 'present';

    await updateDoc(doc(db, 'rollcalls', rollcallId), {
      statusMap: currentStatusMap
    });

    return { success: true, memberId: uid };

  } catch (err: any) {
    console.error(err);
    throw new Error(err.message || 'Error processing QR code');
  }
}
