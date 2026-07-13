const fs = require('fs');

let content = fs.readFileSync('src/firebase.ts', 'utf8');

const importReplacement = `import { getFirestore, doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';`;
content = content.replace(`import { getFirestore } from 'firebase/firestore';`, importReplacement);

const newFunction = `
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
`;

fs.writeFileSync('src/firebase.ts', content + newFunction);
