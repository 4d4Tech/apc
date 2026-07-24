import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';

export default function Onboarding() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isLinking, setIsLinking] = useState(false);

  const handleLinkBank = async () => {
    setIsLinking(true);
    try {
      // In a real implementation, this would trigger Stripe Connect OAuth or Elements
      // For now, we simulate a successful link
      setTimeout(async () => {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          stripeAccountId: 'acct_simulated123',
          payoutsEnabled: true
        });
        navigate('/operator');
      }, 1500);
    } catch (err) {
      console.error(err);
      setIsLinking(false);
    }
  };

  return (
    <div className="container flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem 0' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '450px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Link Bank Account</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          To receive your direct deposits for payroll, please link your bank account via Stripe securely.
        </p>

        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', backgroundColor: '#635BFF', borderColor: '#635BFF' }} onClick={handleLinkBank} disabled={isLinking}>
          {isLinking ? 'Linking Bank...' : 'Link Bank with Stripe'}
        </button>

        <div style={{ marginTop: '2rem' }}>
           <button className="btn btn-secondary" onClick={() => navigate('/operator')}>Skip for now</button>
        </div>
      </div>
    </div>
  );
}
