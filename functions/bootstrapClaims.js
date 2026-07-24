const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Note: To run this script, we'd normally need a service account key if running locally outside of the emulator.
// But since we have the emulator running, we can just connect to it.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

initializeApp({ projectId: 'demo-apc' });

async function bootstrap() {
    console.log("Starting claim bootstrap process...");
    try {
        const db = getFirestore();
        const usersSnap = await db.collection('users').get();
        
        console.log(`Found ${usersSnap.size} users.`);
        
        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const uid = doc.id;
            const role = data.role;
            
            if (role === 'admin') {
                console.log(`Setting admin claim for ${uid}`);
                await getAuth().setCustomUserClaims(uid, { admin: true });
            } else if (role === 'operator') {
                console.log(`Setting operator claim for ${uid}`);
                await getAuth().setCustomUserClaims(uid, { operator: true });
            }
        }
        console.log("Bootstrap complete.");
    } catch (err) {
        console.error("Bootstrap failed:", err);
    }
}

bootstrap();
