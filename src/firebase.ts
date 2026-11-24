import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export type TripSubcollection = 'members' | 'groups' | 'itineraries' | 'rollcalls' | 'settings';

let currentActiveTripId: string | null = null;

export function setActiveTripId(tripId: string | null) {
  currentActiveTripId = tripId;
}

export function getActiveTripId(): string | null {
  return currentActiveTripId;
}

export function tripCollection(subcollectionName: TripSubcollection, explicitTripId?: string) {
  const tid = explicitTripId || currentActiveTripId;
  if (!tid) {
    throw new Error('尚未選擇行程 (No active trip selected)');
  }
  return collection(db, 'trips', tid, subcollectionName);
}

export function tripDoc(subcollectionName: TripSubcollection, docId: string, explicitTripId?: string) {
  const tid = explicitTripId || currentActiveTripId;
  if (!tid) {
    throw new Error('尚未選擇行程 (No active trip selected)');
  }
  return doc(db, 'trips', tid, subcollectionName, docId);
}

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
  const sanitizedErrInfo = {
    error: errInfo.error,
    operationType: errInfo.operationType,
    path: errInfo.path,
    authInfo: {
      userId: errInfo.authInfo.userId,
      isAnonymous: errInfo.authInfo.isAnonymous,
      tenantId: errInfo.authInfo.tenantId,
      // PII (email, emailVerified, providerInfo) intentionally omitted from console logs
    },
  };
  const errorString = JSON.stringify(sanitizedErrInfo);
  console.error('Firestore Error: ', errorString);
  alert(`操作失敗 (Operation Failed): ${errInfo.error}`);
}
