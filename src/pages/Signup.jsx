import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // 1. Create the user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create the user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        role: 'operator',
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        phone,
        email,
        ratePerBoot: 10 // Default rate, admin can change this later
      });

      // Navigate to operator dashboard
      navigate('/operator');
    } catch (err) {
      setError(err.message || 'Failed to create an account.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem 0' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '450px' }}>
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Operator Signup</h2>
        {error && <div style={{ color: 'var(--status-error)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSignup}>
          <div className="flex gap-4">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">First Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={firstName} 
                onChange={e => setFirstName(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Last Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={lastName} 
                onChange={e => setLastName(e.target.value)} 
                required 
              />
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input 
              type="tel" 
              className="form-input" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input 
              type="email" 
              className="form-input" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary mt-4" style={{ width: '100%' }} disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Already have an account? </span>
            <Link to="/login" style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>Sign In</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
