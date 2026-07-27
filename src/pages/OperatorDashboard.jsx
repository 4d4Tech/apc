import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MessageSquare } from 'lucide-react';
import { SkeletonLoader } from '../components/SkeletonLoader';

export default function OperatorDashboard() {
  const { userData } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const q = query(
          collection(db, 'batches'),
          where('operatorId', '==', auth.currentUser.uid),
          orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const batchData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBatches(batchData);
      } catch (err) {
        // Requires index error might happen if not created, but we can catch it
        console.error("Error fetching batches:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBatches();
  }, []);

  const getBatchPayout = (batch) => {
      if (batch.finalPayoutAmount != null) return batch.finalPayoutAmount;
      
      let total = batch.calculatedPay || 0;
      if (batch.adjustments) {
          batch.adjustments.forEach(adj => {
              const amount = Number(adj.amount) || 0;
              if (adj.type === 'bonus') total += amount;
              if (adj.type === 'reimbursement') total += amount;
              if (adj.type === 'deduction') total -= amount;
          });
      }
      return total;
  };

  const totalBoots = batches.reduce((acc, batch) => acc + (batch.expectedItemCount || 0), 0);
  const pendingPay = batches
    .filter(b => ['pending', 'verified', 'processing'].includes(b.status))
    .reduce((acc, batch) => acc + getBatchPayout(batch), 0);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="container mt-8">
      <div className="flex justify-between items-center mb-4 flex-responsive">
        <h2>Operator Dashboard</h2>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </div>
      
      <div className="flex gap-4 mb-4 flex-responsive">
        <div className="glass-card" style={{ flex: 1 }}>
          <div className="form-label">Total Boots (All Time)</div>
          <h3>{totalBoots}</h3>
        </div>
        <div className="glass-card" style={{ flex: 1 }}>
          <div className="form-label">Pending Pay</div>
          <h3>${pendingPay.toFixed(2)}</h3>
        </div>
      </div>

      <div className="flex gap-4 mb-4 flex-responsive">
        <button className="btn btn-primary" onClick={() => navigate('/operator/new-batch')} style={{ flex: 1 }}>
          + New Batch Submission
        </button>
        <button className="btn btn-secondary" onClick={() => alert('Tax documents will be generated and available here at year end.')} style={{ flex: 1 }}>
          Tax Documents (1099)
        </button>
      </div>

      <h3>Recent Batches</h3>
      {loading ? (
        <div className="flex flex-col gap-2 mt-4">
           <SkeletonLoader type="card" />
           <SkeletonLoader type="card" />
           <SkeletonLoader type="card" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-4">
          {batches.length === 0 ? <p>No batches found.</p> : null}
          {batches.map(batch => (
            <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile">
              <div>
                <div style={{ fontWeight: 500 }}>{batch.date ? new Date(batch.date.seconds ? batch.date.seconds * 1000 : batch.date).toLocaleDateString() : 'N/A'}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {batch.expectedItemCount} boots
                  {['paid', 'processing', 'archived'].includes(batch.status) && ` • $${getBatchPayout(batch).toFixed(2)} paid`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`badge badge-${batch.status === 'archived' ? 'paid' : batch.status}`}>
                  {batch.status === 'archived' ? 'paid' : batch.status}
                </div>
                {batch.reviewNotes && (
                    <MessageSquare 
                        size={16} 
                        style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                        title={batch.reviewNotes}
                        onClick={() => alert(`Admin Note:\n\n${batch.reviewNotes}`)}
                    />
                )}
                {(batch.status === 'rejected' || batch.status === 'draft') && (
                    <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} 
                        onClick={() => navigate(`/operator/batch/${batch.id}`)}
                    >
                        {batch.status === 'draft' ? 'Resume Draft' : 'Fix & Resubmit'}
                    </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
