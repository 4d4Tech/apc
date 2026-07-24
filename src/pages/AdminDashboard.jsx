import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';

export default function AdminDashboard() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [txDetails, setTxDetails] = useState([]);
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [newOpData, setNewOpData] = useState({ firstName: '', lastName: '', phone: '', email: '', password: '' });
  const [isAddingOp, setIsAddingOp] = useState(false);
  const [addOpError, setAddOpError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      // Need an index for this or just fetch all and sort on client if small
      const q = query(collection(db, 'batches'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      const batchData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBatches(batchData);
    } catch (err) {
      console.error("Error fetching batches:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocs = async (batch) => {
    setSelectedBatch(batch);
    try {
        const txSnap = await getDocs(collection(db, `batches/${batch.id}/transactions`));
        setTxDetails(txSnap.docs.map(d => d.data()));
    } catch (err) {
        console.error(err);
    }
  };

  const handleCloseModal = () => {
      setSelectedBatch(null);
      setTxDetails([]);
  };

  const updateBatchStatus = async (batchId, status) => {
    try {
      await updateDoc(doc(db, 'batches', batchId), { status });
      fetchBatches();
      if (selectedBatch?.id === batchId) setSelectedBatch({...selectedBatch, status});
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddOperator = async (e) => {
    e.preventDefault();
    setAddOpError('');
    setIsAddingOp(true);
    try {
      const addOperatorFn = httpsCallable(functions, 'addOperator');
      await addOperatorFn(newOpData);
      setShowAddOpModal(false);
      setNewOpData({ firstName: '', lastName: '', phone: '', email: '', password: '' });
      alert("Operator added successfully!");
    } catch (err) {
      console.error(err);
      setAddOpError(err.message || "Failed to add operator.");
    } finally {
      setIsAddingOp(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="container mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2>Admin Dashboard</h2>
        <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => setShowAddOpModal(true)}>Add Operator</button>
            <button className="btn btn-secondary" onClick={() => navigate('/admin/rates')}>Operator Rates</button>
            <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </div>
      
      <div className="glass-card mt-4">
        <h3>Pending Batches</h3>
        {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
            <div className="flex flex-col gap-2 mt-4">
               {batches.filter(b => b.status === 'pending').map(batch => (
                  <div key={batch.id} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)'}}>
                      <div>
                          <div style={{ fontWeight: 600 }}>Operator: {batch.operatorId}</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                              {batch.date ? new Date(batch.date.toDate()).toLocaleDateString() : 'N/A'} - {batch.expectedItemCount} boots
                          </div>
                      </div>
                      <div className="flex items-center gap-4">
                          <div style={{ fontWeight: 600 }}>${batch.calculatedPay?.toFixed(2) || '0.00'}</div>
                          <button className="btn btn-secondary" onClick={() => handleViewDocs(batch)}>View Docs</button>
                      </div>
                  </div>
               ))}
               {batches.filter(b => b.status === 'pending').length === 0 && <p>No pending batches.</p>}
            </div>
        )}
      </div>

      <div className="glass-card mt-8">
        <h3>Approved Batches (Ready for Payroll)</h3>
        {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
            <div className="flex flex-col gap-2 mt-4">
               {batches.filter(b => b.status === 'approved').map(batch => (
                  <div key={batch.id} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)'}}>
                      <div>
                          <div style={{ fontWeight: 600 }}>Operator: {batch.operatorId}</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                              {batch.date ? new Date(batch.date.toDate()).toLocaleDateString() : 'N/A'}
                          </div>
                      </div>
                      <div className="flex items-center gap-4">
                          <button className="btn btn-secondary" onClick={() => updateBatchStatus(batch.id, 'pending')}>Undo</button>
                          <button className="btn btn-primary" style={{backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={() => updateBatchStatus(batch.id, 'paid')}>
                              Pay & Email Stub
                          </button>
                      </div>
                  </div>
               ))}
               {batches.filter(b => b.status === 'approved').length === 0 && <p>No approved batches.</p>}
            </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedBatch && (
          <div className="modal-overlay">
              <div className="modal-content glass-card">
                  <button className="modal-close" onClick={handleCloseModal}>X</button>
                  <h3 className="mb-4">Review Batch</h3>
                  
                  <div className="flex gap-4">
                      <div style={{ flex: 1 }}>
                          <h4 className="mb-2">Daily Summary Ticket</h4>
                          <img src={selectedBatch.batchTicketUrl} alt="Batch Ticket" style={{ width: '100%', borderRadius: '0.5rem' }}/>
                      </div>
                      <div style={{ flex: 1, maxHeight: '60vh', overflowY: 'auto' }}>
                          <h4 className="mb-2">Transactions ({txDetails.length})</h4>
                          {txDetails.map((tx, idx) => (
                              <div key={idx} className="glass-card mb-2" style={{ padding: '1rem' }}>
                                  <div className="flex justify-between mb-2">
                                      <div>{tx.licensePlate}</div>
                                      <div>${tx.amountPaid} (*{tx.cardLast4})</div>
                                  </div>
                                  <div className="flex gap-2">
                                      <a href={tx.photos.vehicle} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Vehicle</a>
                                      <a href={tx.photos.receipt} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Receipt</a>
                                      <a href={tx.photos.release} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Release</a>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div className="flex justify-end gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                      {selectedBatch.status === 'pending' && (
                          <button className="btn btn-primary" onClick={() => updateBatchStatus(selectedBatch.id, 'approved')}>
                              Approve Batch
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Add Operator Modal */}
      {showAddOpModal && (
          <div className="modal-overlay">
              <div className="modal-content glass-card" style={{ maxWidth: '450px' }}>
                  <button className="modal-close" onClick={() => setShowAddOpModal(false)}>X</button>
                  <h3 className="mb-4">Add Boot Operator</h3>
                  {addOpError && <div style={{ color: 'var(--status-error)', marginBottom: '1rem' }}>{addOpError}</div>}
                  <form onSubmit={handleAddOperator}>
                      <div className="flex gap-4">
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">First Name</label>
                              <input type="text" className="form-input" required
                                  value={newOpData.firstName} onChange={e => setNewOpData({...newOpData, firstName: e.target.value})} />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Last Name</label>
                              <input type="text" className="form-input" required
                                  value={newOpData.lastName} onChange={e => setNewOpData({...newOpData, lastName: e.target.value})} />
                          </div>
                      </div>
                      <div className="form-group">
                          <label className="form-label">Phone Number</label>
                          <input type="tel" className="form-input" required
                              value={newOpData.phone} onChange={e => setNewOpData({...newOpData, phone: e.target.value})} />
                      </div>
                      <div className="form-group">
                          <label className="form-label">Email</label>
                          <input type="email" className="form-input" required
                              value={newOpData.email} onChange={e => setNewOpData({...newOpData, email: e.target.value})} />
                      </div>
                      <div className="form-group">
                          <label className="form-label">Password</label>
                          <input type="text" className="form-input" required minLength={6}
                              value={newOpData.password} onChange={e => setNewOpData({...newOpData, password: e.target.value})} />
                      </div>
                      <div className="flex justify-end gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setShowAddOpModal(false)}>Cancel</button>
                          <button type="submit" className="btn btn-primary" disabled={isAddingOp}>
                              {isAddingOp ? 'Adding...' : 'Add Operator'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}
