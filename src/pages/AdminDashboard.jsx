import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, getDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { generatePaystubPDF } from '../utils/pdfGenerator';
import { MessageSquare, Archive, FileText, Eye } from 'lucide-react';

const getSafeDate = (d) => {
    if (!d) return null;
    if (typeof d.toDate === 'function') return d.toDate();
    if (d.seconds) return new Date(d.seconds * 1000);
    return new Date(d);
};

const getNetPay = (batch) => {
    const gross = batch.calculatedPay || 0;
    let net = gross;
    if (batch.adjustments) {
        batch.adjustments.forEach(adj => {
            if (adj.type === 'deduction') net -= Number(adj.amount);
            if (adj.type === 'reimbursement') net += Number(adj.amount);
            if (adj.type === 'bonus') net += Number(adj.amount);
        });
    }
    return net;
};

export default function AdminDashboard() {
  const [batches, setBatches] = useState([]);
  const [operators, setOperators] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [txDetails, setTxDetails] = useState([]);
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [newOpData, setNewOpData] = useState({ firstName: '', lastName: '', phone: '', email: '', password: '' });
  const [isAddingOp, setIsAddingOp] = useState(false);
  const [addOpError, setAddOpError] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [payrollSummary, setPayrollSummary] = useState([]);
  const [isProcessingPayroll, setIsProcessingPayroll] = useState(false);
  const [adjType, setAdjType] = useState('deduction');
  const [adjDesc, setAdjDesc] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  
  const [isGenerating1099, setIsGenerating1099] = useState(false);
  const [show1099Modal, setShow1099Modal] = useState(false);
  const [year1099, setYear1099] = useState(new Date().getFullYear());
  const [taxResults, setTaxResults] = useState(null);
  const [isDownloadingPaystub, setIsDownloadingPaystub] = useState(false);
  const [paystubPdfData, setPaystubPdfData] = useState(null);

  // New UI states
  const [selectedVerifiedBatches, setSelectedVerifiedBatches] = useState([]);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('all');

  const navigate = useNavigate();

  useEffect(() => {
    fetchBatches();
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'operator'));
      const snap = await getDocs(q);
      const opsMap = {};
      snap.docs.forEach(d => {
        const data = d.data();
        opsMap[d.id] = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Operator';
      });
      setOperators(opsMap);
    } catch (err) {
      console.error("Error fetching operators:", err);
    }
  };

  const fetchBatches = async () => {
    setLoading(true);
    try {
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

  const formatOperatorName = (operatorId) => {
      const name = operators[operatorId];
      if (name && name !== 'Unknown Operator' && name.trim().length > 0) return name;
      return `Operator (${operatorId.slice(0, 8)}...)`;
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
      setReviewNotes('');
  };

  const updateBatchStatus = async (batchId, status, notes = '') => {
    // Optimistic UI update
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status, reviewNotes: notes } : b));
    if (selectedBatch?.id === batchId) {
        if (status === 'verified' || status === 'rejected') {
            handleCloseModal();
        } else {
            setSelectedBatch({...selectedBatch, status, reviewNotes: notes});
        }
    }

    try {
      await updateDoc(doc(db, 'batches', batchId), { status, reviewNotes: notes });
      fetchBatches();
    } catch (err) {
      console.error("Error updating batch status:", err);
      // Revert optimism on failure
      fetchBatches();
    }
  };

  const handleAddAdjustment = async (e) => {
      e.preventDefault();
      if (!selectedBatch) return;
      const newAdj = {
          type: adjType,
          description: adjDesc,
          amount: Number(adjAmount),
          createdAt: new Date().toISOString()
      };
      
      const updatedAdjustments = [...(selectedBatch.adjustments || []), newAdj];
      
      try {
          await updateDoc(doc(db, 'batches', selectedBatch.id), { adjustments: updatedAdjustments });
          setSelectedBatch({...selectedBatch, adjustments: updatedAdjustments});
          setAdjDesc('');
          setAdjAmount('');
          fetchBatches();
      } catch (err) {
          console.error("Error adding adjustment:", err);
      }
  };

  const handleRemoveAdjustment = async (index) => {
      if (!selectedBatch) return;
      const updatedAdjustments = [...(selectedBatch.adjustments || [])];
      updatedAdjustments.splice(index, 1);
      
      try {
          await updateDoc(doc(db, 'batches', selectedBatch.id), { adjustments: updatedAdjustments });
          setSelectedBatch({...selectedBatch, adjustments: updatedAdjustments});
          fetchBatches();
      } catch (err) {
          console.error("Error removing adjustment:", err);
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

  const handleOpenPayroll = () => {
      const verified = batches.filter(b => b.status === 'verified');
      const grouped = {};
      verified.forEach(b => {
          if (!grouped[b.operatorId]) {
              grouped[b.operatorId] = { operatorId: b.operatorId, batchIds: [], total: 0 };
          }
          grouped[b.operatorId].batchIds.push(b.id);
          grouped[b.operatorId].total += getNetPay(b);
      });
      setPayrollSummary(Object.values(grouped));
      setShowPayrollModal(true);
  };

  const handleOpenSelectedPayroll = () => {
      if (selectedVerifiedBatches.length === 0) return;
      const verified = batches.filter(b => b.status === 'verified' && selectedVerifiedBatches.includes(b.id));
      const grouped = {};
      verified.forEach(b => {
          if (!grouped[b.operatorId]) {
              grouped[b.operatorId] = { operatorId: b.operatorId, batchIds: [], total: 0 };
          }
          grouped[b.operatorId].batchIds.push(b.id);
          grouped[b.operatorId].total += getNetPay(b);
      });
      setPayrollSummary(Object.values(grouped));
      setShowPayrollModal(true);
  };

  const handleRunPayroll = async () => {
      setIsProcessingPayroll(true);
      try {
          const runPayrollFn = httpsCallable(functions, 'runPayroll');
          for (const op of payrollSummary) {
              for (const batchId of op.batchIds) {
                  await runPayrollFn({ batchId });
              }
          }
          setShowPayrollModal(false);
          setSelectedVerifiedBatches([]);
          fetchBatches();
          alert("Payroll processing initiated!");
      } catch (error) {
          console.error("Error processing payroll:", error);
          alert(error.message || "Failed to process payroll.");
      } finally {
          setIsProcessingPayroll(false);
      }
  };

  const handleArchiveBatch = async (batchId) => {
      if (!window.confirm("Are you sure you want to archive this batch? It will be hidden from the history view.")) return;
      try {
          await updateDoc(doc(db, 'batches', batchId), { status: 'archived' });
          setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'archived' } : b));
      } catch (err) {
          console.error("Error archiving batch:", err);
          alert("Failed to archive batch.");
      }
  };

  const handleGenerate1099 = async (e) => {
      e.preventDefault();
      setIsGenerating1099(true);
      setTaxResults(null);
      try {
          const gen1099Fn = httpsCallable(functions, 'generate1099');
          const res = await gen1099Fn({ year: year1099 });
          setTaxResults(res.data.data);
      } catch (err) {
          console.error(err);
          alert("Error generating 1099s: " + err.message);
      } finally {
          setIsGenerating1099(false);
      }
  };

  const handleDownloadPaystub = async (batchId) => {
      setIsDownloadingPaystub(true);
      try {
          const genPaystubFn = httpsCallable(functions, 'generatepaystub');
          const res = await genPaystubFn({ batchId });
          if (res.data.success) {
              const pdfData = await generatePaystubPDF(res.data.data);
              setPaystubPdfData(pdfData);
          } else {
              alert("Failed to fetch paystub data.");
          }
      } catch (err) {
          console.error(err);
          alert("Error generating paystub: " + err.message);
      } finally {
          setIsDownloadingPaystub(false);
      }
  };

  const handleSelectAllVerified = (e) => {
      if (e.target.checked) {
          setSelectedVerifiedBatches(batches.filter(b => b.status === 'verified').map(b => b.id));
      } else {
          setSelectedVerifiedBatches([]);
      }
  };

  const toggleSelectVerifiedBatch = (batchId) => {
      if (selectedVerifiedBatches.includes(batchId)) {
          setSelectedVerifiedBatches(selectedVerifiedBatches.filter(id => id !== batchId));
      } else {
          setSelectedVerifiedBatches([...selectedVerifiedBatches, batchId]);
      }
  };

  const getFilteredHistory = () => {
      let filtered = batches.filter(b => b.status === 'paid' || b.status === 'processing' || b.status === 'rejected');
      
      if (historySearchTerm) {
          const lowerSearch = historySearchTerm.toLowerCase();
          filtered = filtered.filter(b => {
              const name = formatOperatorName(b.operatorId).toLowerCase();
              return name.includes(lowerSearch) || b.operatorId.toLowerCase().includes(lowerSearch);
          });
      }
  
      if (historyDateFilter !== 'all') {
          filtered = filtered.filter(b => {
              if (!b.date) return false;
              const batchDate = getSafeDate(b.date);
              if (!batchDate) return false;
              const now = new Date();
              
              if (historyDateFilter === 'thisWeek') {
                  const startOfWeek = new Date(now);
                  startOfWeek.setDate(now.getDate() - now.getDay());
                  startOfWeek.setHours(0,0,0,0);
                  return batchDate >= startOfWeek;
              } else if (historyDateFilter === 'lastWeek') {
                  const startOfThisWeek = new Date(now);
                  startOfThisWeek.setDate(now.getDate() - now.getDay());
                  startOfThisWeek.setHours(0,0,0,0);
                  const startOfLastWeek = new Date(startOfThisWeek);
                  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
                  return batchDate >= startOfLastWeek && batchDate < startOfThisWeek;
              } else if (historyDateFilter === 'thisMonth') {
                  return batchDate.getMonth() === now.getMonth() && batchDate.getFullYear() === now.getFullYear();
              }
              return true;
          });
      }
      
      return filtered;
  };

  const pendingPayoutTotal = batches.filter(b => b.status === 'verified').reduce((sum, b) => sum + getNetPay(b), 0);
  const activeOpsCount = Object.keys(operators).length;
  const pendingCount = batches.filter(b => b.status === 'pending').length;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundImage: 'url(/admin-bg.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      paddingTop: '2rem',
      paddingBottom: '2rem'
    }}>
      <div className="container">
        {/* Top Banner metrics */}
        <div className="glass-card mb-6 flex justify-between items-center" style={{ padding: '1rem 1.5rem', backgroundColor: 'rgba(30, 41, 59, 0.8)' }}>
            <div className="flex items-center gap-6 flex-responsive">
               <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Pending Payout</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--status-paid)' }}>${pendingPayoutTotal.toFixed(2)} Ready</div>
               </div>
               <div style={{ borderLeft: '1px solid var(--glass-border)', height: '40px' }}></div>
               <div 
                  style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '0.5rem', transition: 'background-color 0.2s' }}
                  onClick={() => navigate('/admin/operators')}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
               >
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Operators</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{activeOpsCount}</div>
               </div>
               <div style={{ borderLeft: '1px solid var(--glass-border)', height: '40px' }}></div>
               <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Pending Verification</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--status-pending)' }}>{pendingCount}</div>
               </div>
            </div>
            
            <div className="flex gap-2">
                <button className="btn btn-primary" style={{backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={handleOpenPayroll}>Run All Payroll</button>
                <button className="btn btn-secondary" onClick={() => setShow1099Modal(true)}>Year-End Tax (1099)</button>
                <button className="btn btn-secondary" onClick={() => setShowAddOpModal(true)}>Add Operator</button>
                <button className="btn btn-secondary" onClick={() => navigate('/admin/operators')}>Manage Operators</button>
                <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
            </div>
        </div>
  
        <div className="glass-card mt-4">
          <h3>Pending Batches (Requires Review)</h3>
          {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
              <div className="table-container mt-4">
                  <table>
                      <thead>
                          <tr>
                              <th>Operator</th>
                              <th>Date</th>
                              <th>Items</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th>Actions</th>
                          </tr>
                      </thead>
                      <tbody>
                          {batches.filter(b => b.status === 'pending').map(batch => (
                              <tr key={batch.id} className="table-row-hover">
                                  <td>{formatOperatorName(batch.operatorId)}</td>
                                  <td>{batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'}</td>
                                  <td><span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>{batch.expectedItemCount} boots</span></td>
                                  <td style={{ fontWeight: 600 }}>${getNetPay(batch).toFixed(2)}</td>
                                  <td><span className="badge badge-pending">Pending</span></td>
                                  <td>
                                      <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => handleViewDocs(batch)}>Review</button>
                                  </td>
                              </tr>
                          ))}
                          {batches.filter(b => b.status === 'pending').length === 0 && (
                              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pending batches.</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          )}
        </div>
  
        <div className="glass-card mt-8">
          <div className="flex justify-between items-center mb-4 flex-responsive">
              <h3>Verified Batches (Ready for Payroll)</h3>
              <div className="flex gap-4 items-center">
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {selectedVerifiedBatches.length} selected
                  </span>
                  <button 
                      className="btn btn-primary" 
                      style={{backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)', padding: '0.5rem 1rem', fontSize: '0.875rem'}} 
                      disabled={selectedVerifiedBatches.length === 0}
                      onClick={handleOpenSelectedPayroll}
                  >
                      Pay Selected
                  </button>
              </div>
          </div>
          {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
              <div className="table-container">
                  <table>
                      <thead>
                          <tr>
                              <th style={{ width: '40px' }}>
                                  <input 
                                      type="checkbox" 
                                      onChange={handleSelectAllVerified} 
                                      checked={selectedVerifiedBatches.length > 0 && selectedVerifiedBatches.length === batches.filter(b => b.status === 'verified').length}
                                  />
                              </th>
                              <th>Operator</th>
                              <th>Date</th>
                              <th>Items</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th>Actions</th>
                          </tr>
                      </thead>
                      <tbody>
                          {batches.filter(b => b.status === 'verified').map(batch => (
                              <tr key={batch.id} className="table-row-hover">
                                  <td>
                                      <input 
                                          type="checkbox" 
                                          checked={selectedVerifiedBatches.includes(batch.id)} 
                                          onChange={() => toggleSelectVerifiedBatch(batch.id)} 
                                      />
                                  </td>
                                  <td>{formatOperatorName(batch.operatorId)}</td>
                                  <td>{batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'}</td>
                                  <td><span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>{batch.expectedItemCount} boots</span></td>
                                  <td style={{ fontWeight: 600 }}>${getNetPay(batch).toFixed(2)}</td>
                                  <td>
                                      <div className="flex items-center gap-2">
                                          <span className="badge badge-verified">Verified</span>
                                          {batch.reviewNotes && (
                                              <MessageSquare 
                                                  size={16} 
                                                  style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                  title={batch.reviewNotes}
                                                  onClick={() => alert(`Review Note:\n\n${batch.reviewNotes}`)}
                                              />
                                          )}
                                      </div>
                                  </td>
                                  <td>
                                      <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => updateBatchStatus(batch.id, 'pending')}>Hold (Undo)</button>
                                  </td>
                              </tr>
                          ))}
                          {batches.filter(b => b.status === 'verified').length === 0 && (
                              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No verified batches.</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          )}
        </div>
  
        <div className="glass-card mt-8">
          <div className="flex justify-between items-center mb-4 flex-responsive">
              <h3>Batch History (Paid / Processing / Rejected)</h3>
              <div className="flex gap-4">
                  <select 
                      className="form-input" 
                      style={{ padding: '0.5rem', width: 'auto', marginBottom: 0 }}
                      value={historyDateFilter}
                      onChange={e => setHistoryDateFilter(e.target.value)}
                  >
                      <option value="all">All Time</option>
                      <option value="thisWeek">This Week</option>
                      <option value="lastWeek">Last Week</option>
                      <option value="thisMonth">This Month</option>
                  </select>
                  <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '0.5rem', width: '250px', marginBottom: 0 }} 
                      placeholder="Search Operator Name..." 
                      value={historySearchTerm}
                      onChange={e => setHistorySearchTerm(e.target.value)}
                  />
              </div>
          </div>
          
          {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
              <div className="table-container">
                  <table>
                      <thead>
                          <tr>
                              <th>Operator</th>
                              <th>Date</th>
                              <th>Status</th>
                              <th>Payout</th>
                              <th style={{ textAlign: 'center' }}>Documents</th>
                          </tr>
                      </thead>
                      <tbody>
                          {getFilteredHistory().map(batch => (
                              <tr key={batch.id} className="table-row-hover">
                                  <td>{formatOperatorName(batch.operatorId)}</td>
                                  <td>{batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'}</td>
                                  <td>
                                      <div className="flex items-center gap-2">
                                          <span className={`badge badge-${batch.status}`}>
                                              {batch.status}
                                          </span>
                                          {batch.reviewNotes && (
                                              <MessageSquare 
                                                  size={16} 
                                                  style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                  title={batch.reviewNotes}
                                                  onClick={() => alert(`Review Note:\n\n${batch.reviewNotes}`)}
                                              />
                                          )}
                                      </div>
                                  </td>
                                  <td style={{ fontWeight: 600 }}>${getNetPay(batch).toFixed(2)}</td>
                                  <td style={{ textAlign: 'center' }}>
                                      <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                                          {(batch.status === 'paid' || batch.status === 'processing') && (
                                              <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem' }} disabled={isDownloadingPaystub} onClick={() => handleDownloadPaystub(batch.id)} title="PDF Stub">
                                                  <FileText size={16} />
                                                  <span className="hide-on-mobile">{isDownloadingPaystub ? '...' : 'PDF Stub'}</span>
                                              </button>
                                          )}
                                          <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem' }} onClick={() => handleViewDocs(batch)} title="View Docs">
                                              <Eye size={16} />
                                              <span className="hide-on-mobile">View Docs</span>
                                          </button>
                                          <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem', color: 'var(--status-error)' }} title="Archive Batch" onClick={() => handleArchiveBatch(batch.id)}>
                                              <Archive size={16} />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {getFilteredHistory().length === 0 && (
                              <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No matching batches found.</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          )}
        </div>
  
        {/* Review Modal */}
        {selectedBatch && (
            <div className="modal-overlay">
                <div className="modal-content glass-card">
                    <button className="modal-close" onClick={handleCloseModal}>X</button>
                    <h3 className="mb-4">Review Batch</h3>
                    
                    <div className="flex gap-4 flex-responsive">
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
                                      {Array.isArray(tx.photos) ? tx.photos.map((url, pIdx) => (
                                          <a key={pIdx} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Photo {pIdx + 1}</a>
                                      )) : tx.photos && (
                                          <>
                                              {tx.photos.vehicle && (Array.isArray(tx.photos.vehicle) 
                                                  ? tx.photos.vehicle.map((vUrl, vIdx) => <a key={`v${vIdx}`} href={vUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Vehicle {vIdx + 1}</a>) 
                                                  : <a href={tx.photos.vehicle} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Vehicle</a>
                                              )}
                                              {tx.photos.receipt && <a href={tx.photos.receipt} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Receipt</a>}
                                              {tx.photos.release && <a href={tx.photos.release} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>Release</a>}
                                          </>
                                      )}
                                  </div>
                                </div>
                            ))}
                            
                            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                                <h4 className="mb-2">Adjustments (Deductions/Reimbursements)</h4>
                                {selectedBatch.adjustments?.map((adj, idx) => (
                                    <div key={idx} className="flex justify-between items-center mb-2" style={{ padding: '0.5rem', border: '1px solid var(--glass-border)', borderRadius: '0.25rem' }}>
                                        <div>
                                            <span style={{color: adj.type === 'deduction' ? 'var(--status-error)' : 'var(--status-paid)', fontWeight: 600, marginRight: '0.5rem'}}>{adj.type === 'deduction' ? '-' : '+'}</span>
                                            {adj.description}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span>${adj.amount.toFixed(2)}</span>
                                            {(selectedBatch.status === 'pending' || selectedBatch.status === 'verified') && (
                                                <button onClick={() => handleRemoveAdjustment(idx)} style={{color: 'var(--status-error)', cursor: 'pointer', background:'none', border:'none'}}>X</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                
                                {(selectedBatch.status === 'pending' || selectedBatch.status === 'verified') && (
                                    <form onSubmit={handleAddAdjustment} className="flex gap-2 mt-2">
                                        <select className="form-input" style={{width: 'auto', padding: '0.5rem'}} value={adjType} onChange={e => setAdjType(e.target.value)}>
                                            <option value="deduction">Deduct</option>
                                            <option value="reimbursement">Reimburse</option>
                                            <option value="bonus">Bonus</option>
                                        </select>
                                        <input type="text" className="form-input" placeholder="Desc" required value={adjDesc} onChange={e => setAdjDesc(e.target.value)} />
                                        <input type="number" step="0.01" className="form-input" placeholder="$0.00" style={{width: '80px'}} required value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                                        <button type="submit" className="btn btn-secondary" style={{padding: '0.5rem 1rem'}}>Add</button>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
  
                    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                        {selectedBatch.status === 'pending' && (
                            <div className="mb-4">
                                <label className="form-label">Review Notes (Optional)</label>
                                <textarea className="form-input" rows="2" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="E.g., Missing receipt photo..."></textarea>
                            </div>
                        )}
                        
                        <div className="flex justify-end gap-4">
                            <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                            {selectedBatch.status === 'pending' && (
                                <>
                                    <button className="btn btn-secondary" style={{color: 'var(--status-error)', borderColor: 'var(--status-error)'}} onClick={() => updateBatchStatus(selectedBatch.id, 'rejected', reviewNotes)}>
                                        Reject Batch
                                    </button>
                                    <button className="btn btn-primary" onClick={() => updateBatchStatus(selectedBatch.id, 'verified', reviewNotes)}>
                                        Verify Batch
                                    </button>
                                </>
                            )}
                        </div>
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
                        <div className="flex gap-4 flex-responsive">
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
  
        {/* Payroll Modal */}
        {showPayrollModal && (
            <div className="modal-overlay">
                <div className="modal-content glass-card" style={{ maxWidth: '600px' }}>
                    <button className="modal-close" onClick={() => setShowPayrollModal(false)}>X</button>
                    <h3 className="mb-4">Run Payroll Summary</h3>
                    
                    {payrollSummary.length === 0 ? (
                        <p>No verified batches ready for payroll.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {payrollSummary.map(op => (
                                <div key={op.operatorId} className="flex justify-between items-center flex-stack-mobile" style={{ padding: '0.5rem 1rem', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>Operator: {formatOperatorName(op.operatorId)}</div>
                                        <div style={{fontSize:'0.875rem', color: 'var(--text-secondary)'}}>{op.batchIds.length} batches to process</div>
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--status-paid)' }}>${op.total.toFixed(2)}</div>
                                </div>
                            ))}
                        </div>
                    )}
  
                    <div className="flex justify-end gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <button className="btn btn-secondary" onClick={() => setShowPayrollModal(false)}>Cancel</button>
                        <button className="btn btn-primary" style={{backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={handleRunPayroll} disabled={isProcessingPayroll || payrollSummary.length === 0}>
                            {isProcessingPayroll ? 'Processing...' : 'Confirm & Run ACH Transfers'}
                        </button>
                    </div>
                </div>
            </div>
        )}
  
        {/* 1099 Modal */}
        {show1099Modal && (
            <div className="modal-overlay">
                <div className="modal-content glass-card" style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
                    <button className="modal-close" onClick={() => setShow1099Modal(false)}>X</button>
                    <h3 className="mb-4">Generate 1099s</h3>
                    
                    <form onSubmit={handleGenerate1099} className="flex gap-4 items-end mb-4 flex-responsive">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Tax Year</label>
                            <input type="number" className="form-input" required value={year1099} onChange={e => setYear1099(e.target.value)} />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={isGenerating1099}>
                            {isGenerating1099 ? 'Generating...' : 'Run Generation'}
                        </button>
                    </form>
                    
                    {taxResults && (
                        <div className="mt-4">
                            <h4 style={{marginBottom: '0.5rem'}}>Results for {year1099}</h4>
                            <p style={{marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)'}}>Found {taxResults.length} operators with $600+ YTD earnings.</p>
                            
                            <div className="flex flex-col gap-2">
                                {taxResults.map(r => (
                                    <div key={r.operatorId} className="glass-card" style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                        <div className="flex justify-between" style={{fontWeight: 600}}>
                                            <span>{r.name}</span>
                                            <span style={{color: 'var(--status-paid)'}}>${r.ytdTotal.toFixed(2)}</span>
                                        </div>
                                        <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                                            {r.email} | SSN/EIN: {r.ssnOrEin}
                                        </div>
                                    </div>
                                ))}
                                {taxResults.length === 0 && <p>No operators met the $600 threshold.</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
  
        {paystubPdfData && (
            <div className="modal-overlay" onClick={() => setPaystubPdfData(null)}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '800px', height: '85vh', display: 'flex', flexDirection: 'column' }}>
                    <div className="flex justify-between items-center mb-4">
                        <h3>Paystub Preview</h3>
                        <div className="flex gap-4">
                            <a href={paystubPdfData.url} download={paystubPdfData.filename} className="btn btn-primary" style={{backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)', textDecoration: 'none', display: 'flex', alignItems: 'center'}}>Download PDF</a>
                            <button className="btn btn-secondary" onClick={() => setPaystubPdfData(null)}>Close</button>
                        </div>
                    </div>
                    <iframe src={paystubPdfData.url} style={{ width: '100%', flex: 1, border: 'none', borderRadius: '8px', backgroundColor: '#fff' }} title="Paystub Preview"></iframe>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
