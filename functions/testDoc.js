const admin = require('firebase-admin');
admin.initializeApp({ projectId: "apc-project" });
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const db = admin.firestore();

async function checkDoc() {
    const docRef = db.collection('batches').doc('CX5UrzEdwDpQixW4qQQk');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        console.log(JSON.stringify(docSnap.data(), null, 2));
    } else {
        console.log("Document does not exist");
    }
}
checkDoc();
