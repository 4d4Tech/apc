// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
    apiKey: "AIzaSyBNtQsOnH7VuBZlKdt6WgqLY9MwpfaHWW0",
    authDomain: "austinparkingcompany-1b8c6.firebaseapp.com",
    projectId: "austinparkingcompany-1b8c6",
    storageBucket: "austinparkingcompany-1b8c6.firebasestorage.app",
    messagingSenderId: "306092490828",
    appId: "1:306092490828:web:1fc979ac6eddcd2a5134e9",
    measurementId: "G-14F6L0X5DH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;