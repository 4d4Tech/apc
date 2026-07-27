import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Edit2, History } from 'lucide-react';

export default function OperatorManagement() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingOperator, setEditingOperator] = useState(null);
  const [editFormData, setEditFormData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      ratePerBoot: 0
  });

  const [historyOperator, setHistoryOperator] = useState(null);
  const [operatorBatches, setOperatorBatches] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const navigate = useNavigate();

  const fetchOperators = async () => {
    setLoading(true);
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

  useEffect(() => {
    fetchOperators();
  }, []);

  const handleOpenEdit = (op) => {
      setEditingOperator(op.id);
      setEditFormData({
          firstName: op.firstName || '',
          lastName: op.lastName || '',
          email: op.email || '',
          phone: op.phone || '',
          ratePerBoot: op.ratePerBoot || 0
      });
  };

  const handleCloseEdit = () => {
      setEditingOperator(null);
  };

  const handleOpenHistory = async (op) => {
      setHistoryOperator(op);
      setHistoryLoading(true);
      try {
          const q = query(
              collection(db, 'batches'),
              where('operatorId', '==', op.id)
          );
          const snap = await getDocs(q);
          const batches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // Filter and sort in memory to avoid needing a Firestore composite index
          const filteredBatches = batches
              .filter(b => ['paid', 'processing', 'archived'].includes(b.status))
              .sort((a, b) => {
                  const dateA = a.date?.seconds || 0;
                  const dateB = b.date?.seconds || 0;
                  return dateB - dateA;
              });

          setOperatorBatches(filteredBatches);
      } catch (err) {
          console.error("Error fetching operator history:", err);
          alert("Failed to fetch history.");
      } finally {
          setHistoryLoading(false);
      }
  };

  const handleCloseHistory = () => {
      setHistoryOperator(null);
      setOperatorBatches([]);
  };

  const handleSaveEdit = async (e) => {
      e.preventDefault();
      if (!editingOperator) return;
      
      try {
          const updatedData = {
              firstName: editFormData.firstName,
              lastName: editFormData.lastName,
              email: editFormData.email,
              phone: editFormData.phone,
              ratePerBoot: Number(editFormData.ratePerBoot)
          };
          
          await updateDoc(doc(db, 'users', editingOperator), updatedData);
          setOperators(operators.map(op => op.id === editingOperator ? { ...op, ...updatedData } : op));
          handleCloseEdit();
      } catch (err) {
          console.error(err);
          alert("Failed to update operator details.");
      }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Employees</h1>
              <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Manage your team, salaries, and employment details.</p>
          </div>
      </div>

      <div className="glass-card mt-4">
        {loading ? <div className="spinner mt-4"></div> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone Number</th>
                  <th>Pay Rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {operators.map(op => (
                  <tr key={op.id} className="table-row-hover">
                    <td>
                        <div style={{ fontWeight: 600 }}>{`${op.firstName || ''} ${op.lastName || ''}`.trim() || op.name || 'Unknown Operator'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)'}}>UID: {op.id.slice(0, 8)}...</div>
                    </td>
                    <td>{op.email || 'N/A'}</td>
                    <td>{op.phone || 'N/A'}</td>
                    <td style={{ fontWeight: 600 }}>${Number(op.ratePerBoot || 0).toFixed(2)}/boot</td>
                    <td>
                        <div className="flex gap-2">
                            <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.5rem' }} 
                                onClick={() => handleOpenEdit(op)}
                                title="Edit Operator"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.5rem' }} 
                                onClick={() => handleOpenHistory(op)}
                                title="View History"
                            >
                                <History size={16} />
                            </button>
                        </div>
                    </td>
                  </tr>
                ))}
                {operators.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No operators found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingOperator && (
          <div className="modal-overlay">
              <div className="modal-content glass-card" style={{ maxWidth: '500px' }}>
                  <button className="modal-close" onClick={handleCloseEdit}>X</button>
                  <h3 className="mb-4">Edit Operator Profile</h3>
                  <form onSubmit={handleSaveEdit}>
                      <div className="flex gap-4">
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">First Name</label>
                              <input 
                                  type="text" 
                                  className="form-input" 
                                  value={editFormData.firstName} 
                                  onChange={e => setEditFormData({...editFormData, firstName: e.target.value})} 
                              />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Last Name</label>
                              <input 
                                  type="text" 
                                  className="form-input" 
                                  value={editFormData.lastName} 
                                  onChange={e => setEditFormData({...editFormData, lastName: e.target.value})} 
                              />
                          </div>
                      </div>
                      
                      <div className="form-group">
                          <label className="form-label">Email Address</label>
                          <input 
                              type="email" 
                              className="form-input" 
                              value={editFormData.email} 
                              onChange={e => setEditFormData({...editFormData, email: e.target.value})} 
                          />
                          <small style={{color: 'var(--text-secondary)'}}>Updates profile contact info only, not auth credentials.</small>
                      </div>

                      <div className="form-group">
                          <label className="form-label">Phone Number</label>
                          <input 
                              type="tel" 
                              className="form-input" 
                              value={editFormData.phone} 
                              onChange={e => setEditFormData({...editFormData, phone: e.target.value})} 
                          />
                      </div>

                      <div className="form-group">
                          <label className="form-label">Rate Per Boot ($)</label>
                          <input 
                              type="number" 
                              step="0.01"
                              className="form-input" 
                              value={editFormData.ratePerBoot} 
                              onChange={e => setEditFormData({...editFormData, ratePerBoot: e.target.value})} 
                          />
                      </div>

                      <div className="flex justify-end gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                          <button type="button" className="btn btn-secondary" onClick={handleCloseEdit}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save Changes</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* History Modal */}
      {historyOperator && (
          <div className="modal-overlay">
              <div className="modal-content glass-card" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                  <button className="modal-close" onClick={handleCloseHistory}>X</button>
                  <h3 className="mb-4">Financial History</h3>
                  
                  <div className="flex justify-between items-center mb-6 pb-4">
                      <div>
                          <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                              {`${historyOperator.firstName || ''} ${historyOperator.lastName || ''}`.trim() || historyOperator.name || 'Unknown Operator'}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                              UID: {historyOperator.id}
                          </div>
                      </div>
                  </div>

                  <div className="flex gap-4 mb-6 flex-stack-mobile">
                      <div className="glass-card flex-1 text-center" style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Lifetime Earnings</div>
                          <div style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--status-paid)' }}>
                              ${(
                                  historyOperator.ytdEarnings 
                                      ? Object.values(historyOperator.ytdEarnings).reduce((sum, val) => sum + val, 0) 
                                      : operatorBatches.reduce((acc, b) => acc + Number(b.finalPayoutAmount || b.calculatedPay || 0), 0)
                              ).toFixed(2)}
                          </div>
                      </div>
                      <div className="glass-card flex-1 text-center" style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Bonuses</div>
                          <div style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--accent-primary)' }}>
                              ${operatorBatches.reduce((acc, b) => acc + (b.adjustments ? b.adjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + Number(a.amount), 0) : 0), 0).toFixed(2)}
                          </div>
                      </div>
                      <div className="glass-card flex-1 text-center" style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Boots</div>
                          <div style={{ fontWeight: 600, fontSize: '1.5rem' }}>
                              {operatorBatches.reduce((acc, b) => acc + (b.expectedItemCount || 0), 0)}
                          </div>
                      </div>
                  </div>

                  {historyLoading ? (
                      <div className="spinner my-8 mx-auto"></div>
                  ) : (
                      <div className="table-container">
                          {operatorBatches.length === 0 ? (
                              <p className="text-center" style={{ color: 'var(--text-secondary)' }}>No financial history found.</p>
                          ) : (
                              <table>
                                  <thead>
                                      <tr>
                                          <th>Date</th>
                                          <th>Boots</th>
                                          <th>Status</th>
                                          <th>Payout</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {operatorBatches.map(batch => (
                                          <tr key={batch.id} className="table-row-hover">
                                              <td>
                                                  {batch.date ? new Date(batch.date.seconds ? batch.date.seconds * 1000 : batch.date).toLocaleDateString() : 'N/A'}
                                              </td>
                                              <td>{batch.expectedItemCount || 0}</td>
                                              <td>
                                                  <span className={`badge badge-${batch.status}`}>
                                                      {batch.status}
                                                  </span>
                                              </td>
                                              <td style={{ fontWeight: 600, color: 'var(--status-paid)' }}>
                                                  ${(batch.finalPayoutAmount || 0).toFixed(2)}
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          )}
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}
