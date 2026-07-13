const fs = require('fs');

let content = fs.readFileSync('src/firebase.ts', 'utf8');

const importReplacement = `import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';`;
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
    // 60 seconds validity
    if (now - timestamp > 60000) {
      throw new Error('QR Code has expired. Please refresh the code.');
    }

    // We assume the rollcallId is same as itineraryId or we can look it up.
    // Wait, let's check RollCall system to see how rollcalls are created.
    // In RollCallSystem.tsx, when a rollcall is created, its id is generated:
    // addDoc(collection(db, 'rollcalls'), { itineraryId: selectedItineraryId ... })
    // Let's modify the function to query the rollcall first.
  } catch (err) {
    console.error(err);
    throw err;
  }
}
`;

fs.writeFileSync('src/firebase.ts', content);
