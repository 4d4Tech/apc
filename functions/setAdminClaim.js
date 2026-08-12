const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: 'austinparkingcompany-1b8c6'
});

async function setAdminByEmail(email) {
  try {
    console.log(`Searching for user with email: ${email}`);
    const user = await getAuth().getUserByEmail(email);
    console.log(`Found UID: ${user.uid}`);

    // Set Custom Auth Claim
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Successfully set custom claim { admin: true } for UID: ${user.uid}`);

    // Set Firestore User Role to admin
    await getFirestore().collection('users').doc(user.uid).set({
      role: 'admin',
      email: user.email,
      name: user.displayName || 'Admin User',
      updatedAt: new Date()
    }, { merge: true });

    console.log(`Successfully set role: 'admin' in Firestore for ${user.uid}`);
  } catch (err) {
    console.error('Error setting admin claim:', err.message);
  }
}

const targetEmail = process.argv[2] || 'brandonrobinson81@gmail.com';
setAdminByEmail(targetEmail);
