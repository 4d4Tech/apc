import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, setDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Edit2, History, UserX, UserCheck, UserPlus, Plus, X } from 'lucide-react';

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

  // Add Employee State
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [addFormData, setAddFormData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      ratePerBoot: 10,
      password: '',
      ssn: '',
      status: 'active'
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState('');

  const [historyOperator, setHistoryOperator] = useState(null);
  const [operatorBatches, setOperatorBatches] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const navigate = useNavigate();

  const getNetPay = (batch) => {
      let base = Number(batch.calculatedPay || 0);
      if (batch.adjustments && Array.isArray(batch.adjustments)) {
          batch.adjustments.forEach(adj => {
              if (adj.type === 'deduction') base -= Number(adj.amount);
              if (adj.type === 'reimbursement') base += Number(adj.amount);
              if (adj.type === 'bonus') base += Number(adj.amount);
          });
      }
      return base;
  };

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

  const handleOpenAddModal = () => {
    setAddFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      ratePerBoot: 10,
      password: '',
      ssn: '',
      status: 'active'
    });
    setAddError('');
    setIsAddingEmployee(true);
  };

  const handleCloseAddModal = () => {
    setIsAddingEmployee(false);
    setAddError('');
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setAddError('');
    setIsSubmittingAdd(true);

    let secondaryApp = null;
    try {
      // 1. Create a secondary Firebase App so admin's logged-in session is undisturbed
      const appName = `SecondaryAuth_${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);

      // 2. Create the user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        addFormData.email.trim(),
        addFormData.password
      );
      const newUser = userCredential.user;

      // 3. Create the user document in Firestore 'users' collection
      await setDoc(doc(db, 'users', newUser.uid), {
        role: 'operator',
        name: `${addFormData.firstName} ${addFormData.lastName}`.trim(),
        firstName: addFormData.firstName.trim(),
        lastName: addFormData.lastName.trim(),
        phone: addFormData.phone.trim(),
        email: addFormData.email.trim(),
        payoutsEnabled: true,
        ratePerBoot: Number(addFormData.ratePerBoot) || 10,
        status: addFormData.status || 'active',
        createdAt: serverTimestamp()
      });

      // 4. Optionally write to operator_secure_data if SSN provided
      if (addFormData.ssn.trim()) {
        await setDoc(doc(db, 'operator_secure_data', newUser.uid), {
          ssn: addFormData.ssn.trim(),
          w9_submitted: true,
          updatedAt: new Date()
        });
      }

      // 5. Cleanup & refresh
      handleCloseAddModal();
      await fetchOperators();
    } catch (err) {
      console.error("Error adding employee:", err);
      let msg = err.message || 'Failed to create employee.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email address already exists.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      }
      setAddError(msg);
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (err) {
          console.error("Error deleting secondary app:", err);
        }
      }
      setIsSubmittingAdd(false);
    }
  };

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
                  const getSortTime = (batch) => {
                      if (batch.date) return batch.date.seconds ? batch.date.seconds * 1000 : new Date(batch.date).getTime();
                      return 0;
                  };
                  return getSortTime(b) - getSortTime(a);
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
              name: `${editFormData.firstName} ${editFormData.lastName}`.trim(),
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

  const handleToggleStatus = async (op) => {
      const newStatus = op.status === 'inactive' ? 'active' : 'inactive';
      if (!window.confirm(`Are you sure you want to mark ${op.firstName || op.name} as ${newStatus}?`)) return;
      try {
          await updateDoc(doc(db, 'users', op.id), { status: newStatus });
          setOperators(operators.map(o => o.id === op.id ? { ...o, status: newStatus } : o));
      } catch (err) {
          console.error(err);
          alert("Failed to update operator status.");
      }
  };


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Employees</h1>
              <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Manage your team, salaries, and employment details.</p>
          </div>
          <button className="btn btn-primary" onClick={handleOpenAddModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus size={18} /> Add Employee
          </button>
      </div>

      <div className="glass-card mt-4">
        {loading ? <div className="spinner mt-4"></div> : (
          <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-2 hidden-mobile" style={{ borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              <div style={{ flex: 2 }}>Name</div>
              <div style={{ flex: 2 }}>Email</div>
              <div style={{ flex: 2 }}>Phone Number</div>
              <div style={{ flex: 1 }}>Pay Rate</div>
              <div style={{ flex: 1 }}>Status</div>
              <div style={{ flex: 1 }}>Actions</div>
            </div>
            
            {/* Body */}
            {operators.map(op => (
              <div key={op.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem' }}>
                <div data-label="Name" style={{ flex: 2, minWidth: '150px' }}>
                    <div style={{ fontWeight: 600 }}>{`${op.firstName || ''} ${op.lastName || ''}`.trim() || op.name || 'Unknown Operator'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)'}}>UID: {op.id.slice(0, 8)}...</div>
                </div>
                <div data-label="Email" style={{ flex: 2, minWidth: '150px' }}>
                    {op.email || 'N/A'}
                </div>
                <div data-label="Phone" style={{ flex: 2, minWidth: '120px' }}>
                    {op.phone || 'N/A'}
                </div>
                <div data-label="Pay Rate" style={{ flex: 1, fontWeight: 600, minWidth: '100px' }}>
                    ${Number(op.ratePerBoot || 0).toFixed(2)}/boot
                </div>
                <div data-label="Status" style={{ flex: 1, minWidth: '100px' }}>
                    <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: op.status === 'inactive' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                        color: op.status === 'inactive' ? '#ef4444' : '#22c55e'
                    }}>
                        {op.status === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                </div>
                <div data-label="Actions" style={{ flex: 1, minWidth: '80px' }}>
                    <div className="flex gap-2">
                        <button 
                            className="btn btn-secondary btn-icon" 
                            onClick={() => handleToggleStatus(op)}
                            title={op.status === 'inactive' ? 'Reactivate Operator' : 'Deactivate Operator'}
                        >
                            {op.status === 'inactive' ? <UserCheck size={18} /> : <UserX size={18} />}
                        </button>
                        <button 
                            className="btn btn-secondary btn-icon" 
                            onClick={() => handleOpenEdit(op)}
                            title="Edit Operator"
                        >
                            <Edit2 size={18} />
                        </button>
                        <button 
                            className="btn btn-secondary btn-icon" 
                            onClick={() => handleOpenHistory(op)}
                            title="View History"
                        >
                            <History size={18} />
                        </button>
                    </div>
                </div>
              </div>
            ))}
            {operators.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No operators found.</div>
            )}
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
                                  operatorBatches.reduce((acc, b) => acc + getNetPay(b), 0)
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
                      <div className="flex flex-col gap-2">
                          {operatorBatches.length === 0 ? (
                              <p className="text-center" style={{ color: 'var(--text-secondary)' }}>No financial history found.</p>
                          ) : (
                              <>
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 py-2 hidden-mobile" style={{ borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                                    <div style={{ flex: 1 }}>Date</div>
                                    <div style={{ flex: 1 }}>Boots</div>
                                    <div style={{ flex: 1, textAlign: 'center' }}>Status</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Payout</div>
                                </div>
                                {/* Body */}
                                {operatorBatches.map(batch => (
                                    <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem' }}>
                                        <div data-label="Date" style={{ flex: 1, minWidth: '100px' }}>
                                            {batch.paidAt ? (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 500 }}>{new Date(batch.paidAt.seconds ? batch.paidAt.seconds * 1000 : batch.paidAt).toLocaleDateString()}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--status-paid)' }}>Paid</span>
                                                </div>
                                            ) : (
                                                <span style={{ fontWeight: 500 }}>
                                                    {batch.date ? new Date(batch.date.seconds ? batch.date.seconds * 1000 : batch.date).toLocaleDateString() : 'N/A'}
                                                </span>
                                            )}
                                        </div>
                                        <div data-label="Boots" style={{ flex: 1, minWidth: '80px', color: 'var(--text-secondary)' }}>
                                            {batch.expectedItemCount || 0} boots
                                        </div>
                                        <div data-label="Status" style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
                                            <span className={`badge badge-${batch.status}`}>
                                                {batch.status}
                                            </span>
                                        </div>
                                        <div data-label="Payout" style={{ flex: 1, minWidth: '80px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            ${(batch.finalPayoutAmount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                              </>
                          )}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Add Employee Modal */}
      {isAddingEmployee && (
          <div className="modal-overlay">
              <div className="modal-content glass-card" style={{ maxWidth: '550px' }}>
                  <button className="modal-close" onClick={handleCloseAddModal}>X</button>
                  <h3 className="mb-4">Add New Employee</h3>
                  {addError && (
                      <div style={{ color: 'var(--status-error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                          {addError}
                      </div>
                  )}
                  <form onSubmit={handleCreateEmployee}>
                      <div className="flex gap-4">
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">First Name *</label>
                              <input 
                                  type="text" 
                                  className="form-input" 
                                  required
                                  value={addFormData.firstName} 
                                  onChange={e => setAddFormData({...addFormData, firstName: e.target.value})} 
                                  placeholder="John"
                              />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Last Name *</label>
                              <input 
                                  type="text" 
                                  className="form-input" 
                                  required
                                  value={addFormData.lastName} 
                                  onChange={e => setAddFormData({...addFormData, lastName: e.target.value})} 
                                  placeholder="Doe"
                              />
                          </div>
                      </div>

                      <div className="form-group">
                          <label className="form-label">Email Address *</label>
                          <input 
                              type="email" 
                              className="form-input" 
                              required
                              value={addFormData.email} 
                              onChange={e => setAddFormData({...addFormData, email: e.target.value})} 
                              placeholder="john.doe@example.com"
                          />
                      </div>

                      <div className="flex gap-4">
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Phone Number *</label>
                              <input 
                                  type="tel" 
                                  className="form-input" 
                                  required
                                  value={addFormData.phone} 
                                  onChange={e => setAddFormData({...addFormData, phone: e.target.value})} 
                                  placeholder="(512) 555-0199"
                              />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Rate Per Boot ($) *</label>
                              <input 
                                  type="number" 
                                  step="0.01"
                                  min="0"
                                  className="form-input" 
                                  required
                                  value={addFormData.ratePerBoot} 
                                  onChange={e => setAddFormData({...addFormData, ratePerBoot: e.target.value})} 
                                  placeholder="10.00"
                              />
                          </div>
                      </div>

                      <div className="flex gap-4">
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Account Password *</label>
                              <input 
                                  type="password" 
                                  className="form-input" 
                                  required
                                  minLength={6}
                                  value={addFormData.password} 
                                  onChange={e => setAddFormData({...addFormData, password: e.target.value})} 
                                  placeholder="Min. 6 characters"
                              />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                              <label className="form-label">Status</label>
                              <select
                                  className="form-input"
                                  value={addFormData.status}
                                  onChange={e => setAddFormData({...addFormData, status: e.target.value})}
                              >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                              </select>
                          </div>
                      </div>

                      <div className="form-group">
                          <label className="form-label">SSN / Tax ID <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(Optional for 1099)</span></label>
                          <input 
                              type="text" 
                              className="form-input" 
                              value={addFormData.ssn} 
                              onChange={e => setAddFormData({...addFormData, ssn: e.target.value})} 
                              placeholder="XXX-XX-XXXX"
                          />
                      </div>

                      <div className="flex justify-end gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                          <button type="button" className="btn btn-secondary" onClick={handleCloseAddModal} disabled={isSubmittingAdd}>Cancel</button>
                          <button type="submit" className="btn btn-primary" disabled={isSubmittingAdd}>
                              {isSubmittingAdd ? 'Adding Employee...' : 'Create Employee'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}
