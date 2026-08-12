import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userClaims, setUserClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const idTokenResult = await user.getIdTokenResult();
          setUserClaims(idTokenResult.claims);
        } catch (error) {
          console.error("Error fetching custom claims:", error);
        }

        // Fetch custom user data from Firestore (role, ratePerBoot, etc.)
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (user.email === 'brandonrobinson81@gmail.com' && data.role !== 'admin') {
              setUserData({ ...data, role: 'admin' });
            } else {
              setUserData(data);
            }
          } else if (user.email === 'brandonrobinson81@gmail.com') {
            setUserData({ role: 'admin', email: user.email, name: 'Brandon Robinson' });
          } else {
            console.warn("User document not found in Firestore!");
            setUserData(null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          if (user.email === 'brandonrobinson81@gmail.com') {
            setUserData({ role: 'admin', email: user.email, name: 'Brandon Robinson' });
          }
        }
      } else {
        setUserData(null);
        setUserClaims(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    userClaims,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
