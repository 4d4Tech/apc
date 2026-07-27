import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MessageSquare, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
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
        let batchData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        batchData.sort((a, b) => {
          const getSortTime = (batch) => {
            if (batch.date) return batch.date.seconds ? batch.date.seconds * 1000 : new Date(batch.date).getTime();
            return 0;
          };
          return getSortTime(b) - getSortTime(a);
        });
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Overview</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Overview of your recent batches and pending pay.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => navigate('/operator/new-batch')}>
            + New Batch Submission
          </button>
          <button className="btn btn-secondary" onClick={() => alert('Tax documents will be generated and available here at year end.')}>
            Tax Documents (1099)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Total Boots */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Boots (All Time)</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalBoots}</div>
        </div>

        {/* Pending Pay */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-pending)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Clock size={20} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pending Pay</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>${pendingPay.toFixed(2)}</div>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1rem' }}>Recent Batches</h3>
        {loading ? (
          <div className="flex flex-col gap-2 mt-4">
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {batches.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No batches found.</p> : null}
            {batches.map(batch => (
              <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)', boxShadow: 'none', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontWeight: 500 }}>
                    {batch.paidAt
                      ? `${new Date(batch.paidAt.seconds ? batch.paidAt.seconds * 1000 : batch.paidAt).toLocaleDateString()} (Paid)`
                      : (batch.date ? new Date(batch.date.seconds ? batch.date.seconds * 1000 : batch.date).toLocaleDateString() : 'N/A')}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {batch.expectedItemCount} boots
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ flex: 1, justifyContent: 'center', minWidth: '150px' }}>
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

                <div style={{ flex: 1, textAlign: 'right', minWidth: '80px' }}>
                  <span style={{ fontWeight: 200, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {['paid', 'processing', 'archived'].includes(batch.status) ? `$${getBatchPayout(batch).toFixed(2)}` : '--'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
