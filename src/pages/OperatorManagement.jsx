import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Edit2 } from 'lucide-react';

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
    <div className="container mt-8">
      <div className="flex items-center gap-4 mb-4">
        <button className="btn btn-secondary" style={{padding: '0.5rem'}} onClick={() => navigate('/admin')}><ChevronLeft size={20}/></button>
        <h2>Operator Management</h2>
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
                        <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.5rem' }} 
                            onClick={() => handleOpenEdit(op)}
                        >
                            <Edit2 size={16} />
                        </button>
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
    </div>
  );
}
