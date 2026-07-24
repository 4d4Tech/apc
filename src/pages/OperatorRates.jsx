import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function OperatorRates() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOperators = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'operator'));
        const querySnapshot = await getDocs(q);
        const opsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOperators(opsData);
      } catch (err) {
        console.error("Error fetching operators:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOperators();
  }, []);

  const handleRateChange = async (id, newRate) => {
    try {
      await updateDoc(doc(db, 'users', id), { ratePerBoot: Number(newRate) });
      setOperators(operators.map(op => op.id === id ? { ...op, ratePerBoot: Number(newRate) } : op));
    } catch (err) {
      console.error(err);
      alert("Failed to update rate.");
    }
  };

  return (
    <div className="container mt-8">
      <div className="flex items-center gap-4 mb-4">
        <button className="btn btn-secondary" style={{padding: '0.5rem'}} onClick={() => navigate('/admin')}><ChevronLeft size={20}/></button>
        <h2>Operator Rates</h2>
      </div>

      <div className="glass-card">
        {loading ? <div className="spinner mt-4"></div> : (
          <div className="flex flex-col gap-4">
             {operators.map(op => (
                <div key={op.id} className="flex justify-between items-center" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)'}}>
                    <div>
                        <div style={{ fontWeight: 600 }}>{op.name || op.email}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>{op.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="form-label mb-0">$</span>
                        <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: '100px' }}
                            value={op.ratePerBoot || 0}
                            onChange={(e) => handleRateChange(op.id, e.target.value)}
                        />
                        <span className="form-label mb-0">per boot</span>
                    </div>
                </div>
             ))}
             {operators.length === 0 && <p>No operators found.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
