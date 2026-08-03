import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { CheckCircle2, ChevronLeft, Trash2, Edit2 } from 'lucide-react';
import { SkeletonLoader } from '../components/SkeletonLoader';

export default function BatchDetails() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Transaction form state
  const [plate, setPlate] = useState('');
  const [desc, setDesc] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [amount, setAmount] = useState('');
  
  const [txPics, setTxPics] = useState([]);
  
  // Edit Transaction state
  const [editingTx, setEditingTx] = useState(null);
  const [editPlate, setEditPlate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCardLast4, setEditCardLast4] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editTxPics, setEditTxPics] = useState([]);
  const [editExistingPhotos, setEditExistingPhotos] = useState([]);

  useEffect(() => {
    const fetchBatchData = async () => {
      try {
        const batchDoc = await getDoc(doc(db, 'batches', batchId));
        if (batchDoc.exists()) setBatch({ id: batchDoc.id, ...batchDoc.data() });

        const txSnap = await getDocs(collection(db, `batches/${batchId}/transactions`));
        setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBatchData();
  }, [batchId]);

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
        await deleteDoc(doc(db, `batches/${batchId}/transactions`, txId));
        setTransactions(prev => prev.filter(t => t.id !== txId));
    } catch (err) {
        console.error("Error deleting transaction", err);
        alert("Failed to delete transaction.");
    }
  };

  const handleEditClick = (tx) => {
    setEditingTx(tx);
    setEditPlate(tx.licensePlate || '');
    setEditDesc(tx.vehicleDescription || '');
    setEditCardLast4(tx.cardLast4 || '');
    setEditAmount(tx.amountPaid || '');
    setEditTxPics([]);
    setEditExistingPhotos(tx.photos || []);
  };

  const handleRemoveExistingPhoto = (indexToRemove) => {
    setEditExistingPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpdateTransaction = async (e) => {
    e.preventDefault();
    if (!editingTx) return;

    // Optimistically update UI
    setTransactions(prev => prev.map(t => {
        if (t.id === editingTx.id) {
            return {
                ...t,
                licensePlate: editPlate,
                vehicleDescription: editDesc,
                cardLast4: editCardLast4,
                amountPaid: Number(editAmount),
                isUploading: editTxPics.length > 0 ? true : false
            };
        }
        return t;
    }));

    setEditingTx(null);

    // Fire and forget upload if pics exist, else just update doc
    (async () => {
        try {
            let txUrls = [...editExistingPhotos];
            if (editTxPics.length > 0) {
                const uploadImage = async (file, type) => {
                    const fileRef = ref(storage, `uploads/${auth.currentUser.uid}/transactions/${batchId}/${Date.now()}_${type}`);
                    await uploadBytes(fileRef, file);
                    return await getDownloadURL(fileRef);
                };
                
                const newUrls = await Promise.all(
                    editTxPics.map((pic, idx) => uploadImage(pic, `photo_${idx}`))
                );
                txUrls = [...txUrls, ...newUrls]; // Append new photos
            }

            const updateData = {
                licensePlate: editPlate,
                vehicleDescription: editDesc,
                cardLast4: editCardLast4,
                amountPaid: Number(editAmount),
                photos: txUrls
            };
            
            await updateDoc(doc(db, `batches/${batchId}/transactions`, editingTx.id), updateData);

            if (editTxPics.length > 0) {
                // Remove uploading state and set new photos
                setTransactions(prev => prev.map(t => {
                    if (t.id === editingTx.id) {
                        return { ...t, ...updateData, isUploading: false };
                    }
                    return t;
                }));
            }
        } catch (error) {
            console.error("Error updating transaction", error);
            alert("Failed to update transaction.");
            setTransactions(prev => prev.map(t => {
                if (t.id === editingTx.id) {
                    return { ...t, isUploading: false, hasError: true };
                }
                return t;
            }));
        }
    })();
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    
    // cardLast4 is required by the form input attribute already
    
    // Capture current form state
    const tempId = `temp_${Date.now()}`;
    const txData = {
        id: tempId,
        licensePlate: plate,
        vehicleDescription: desc,
        cardLast4: cardLast4,
        amountPaid: Number(amount),
        isUploading: true
    };
    const capturedTxPics = [...txPics];

    // Optimistically add to UI
    setTransactions(prev => [...prev, txData]);

    // Reset form immediately so user can keep typing
    setPlate(''); setDesc(''); setCardLast4(''); setAmount('');
    
    // For file inputs, we also need to clear the actual DOM elements if they have a value, 
    // but clearing the state will prevent them from being reused on next submit anyway.
    setTxPics([]);
    document.getElementById('txPhotosInput').value = '';

    // Fire and forget upload
    (async () => {
        try {
            const uploadImage = async (file, type) => {
                const fileRef = ref(storage, `uploads/${auth.currentUser.uid}/transactions/${batchId}/${Date.now()}_${type}`);
                await uploadBytes(fileRef, file);
                return await getDownloadURL(fileRef);
            };

            const txUrls = await Promise.all(
                capturedTxPics.map((pic, idx) => uploadImage(pic, `photo_${idx}`))
            );

            const newTx = {
                licensePlate: txData.licensePlate,
                vehicleDescription: txData.vehicleDescription,
                cardLast4: txData.cardLast4,
                amountPaid: txData.amountPaid,
                photos: txUrls
            };

            const docRef = await addDoc(collection(db, `batches/${batchId}/transactions`), newTx);
            
            // Replace optimistic temp transaction with real one
            setTransactions(prev => prev.map(t => t.id === tempId ? { id: docRef.id, ...newTx } : t));
        } catch (err) {
            console.error("Background upload failed:", err);
            setTransactions(prev => prev.map(t => t.id === tempId ? { ...t, isUploading: false, hasError: true } : t));
        }
    })();
  };

  const handleSubmitBatch = async () => {
    try {
      await updateDoc(doc(db, 'batches', batchId), { status: 'pending' });
      alert("Batch submitted successfully for admin review!");
      navigate('/operator');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitAndAddAnother = async () => {
    try {
      await updateDoc(doc(db, 'batches', batchId), { status: 'pending' });
      alert("Batch submitted! You can now start another one.");
      navigate('/operator/new-batch');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateBatchTicket = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const fileRef = ref(storage, `uploads/${auth.currentUser.uid}/batches/${batchId}/ticket_${Date.now()}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        await updateDoc(doc(db, 'batches', batchId), { batchTicketUrl: url });
        setBatch(prev => ({ ...prev, batchTicketUrl: url }));
        alert('Batch ticket updated successfully.');
    } catch (err) {
        console.error('Error updating batch ticket:', err);
        alert('Failed to upload batch ticket.');
    }
  };

  const handleCancelBatch = async () => {
      if (!window.confirm("Are you sure you want to completely delete this batch? All transactions and progress will be lost.")) return;
      try {
          for (const tx of transactions) {
              await deleteDoc(doc(db, `batches/${batchId}/transactions`, tx.id));
          }
          await deleteDoc(doc(db, 'batches', batchId));
          alert("Batch cancelled and deleted.");
          navigate('/operator');
      } catch (err) {
          console.error("Error cancelling batch", err);
          alert("Failed to cancel batch.");
      }
  };

  if (loading) return (
    <div>
      <SkeletonLoader type="block" />
      <div className="mt-4"><SkeletonLoader type="card" /></div>
      <div className="mt-4"><SkeletonLoader type="card" /></div>
    </div>
  );
  if (!batch) return <div>Batch not found.</div>;

  const isMatched = transactions.length === batch.expectedItemCount;

  // Calculate Ledger
  const grossPay = batch.calculatedPay || 0;
  let netPay = grossPay;
  if (batch.adjustments) {
      batch.adjustments.forEach(adj => {
          if (adj.type === 'deduction') netPay -= adj.amount;
          if (adj.type === 'reimbursement') netPay += adj.amount;
      });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
              <button className="btn btn-secondary" style={{padding: '0.25rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem'}} onClick={() => navigate('/operator')}><ChevronLeft size={16}/> Back</button>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Batch Details</h1>
          </div>
          <div className={`badge badge-${batch.status}`}>{batch.status}</div>
      </div>

      {batch.status === 'rejected' && batch.reviewNotes && (
          <div className="glass-card mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'var(--status-error)' }}>
              <h3 style={{ color: 'var(--status-error)' }}>Fix Required</h3>
              <p style={{ marginTop: '0.5rem' }}>{batch.reviewNotes}</p>
          </div>
      )}

      <div className="glass-card mb-4">
          <div className="flex justify-between items-center">
              <h3>Batch Summary Receipt</h3>
              {batch.batchTicketUrl ? (
                  <a href={batch.batchTicketUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>View Receipt</a>
              ) : (
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No receipt uploaded</span>
              )}
          </div>
          {['draft', 'rejected'].includes(batch.status) && (
              <div className="mt-4">
                  <label className="form-label">Replace Receipt Photo</label>
                  <input type="file" accept="image/*" onChange={handleUpdateBatchTicket} className="form-input" />
              </div>
          )}
      </div>

      <div className="glass-card mb-4 flex justify-between items-center">
        <div>
            <div className="form-label">Batch Progress</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{transactions.length} / {batch.expectedItemCount} Added</div>
        </div>
        {isMatched && <div style={{ color: 'var(--status-paid)' }} className="flex items-center gap-2"><CheckCircle2/> MATCHED</div>}
      </div>

      {/* Ledger View */}
      {['verified', 'processing', 'paid'].includes(batch.status) && (
          <div className="glass-card mb-4" style={{ backgroundColor: 'rgba(99, 91, 255, 0.05)', borderColor: 'var(--accent-primary)' }}>
              <h3 style={{ color: 'var(--accent-primary)' }}>Payroll Ledger</h3>
              <div className="flex flex-col mt-4" style={{ gap: '0.5rem' }}>
                  <div className="flex justify-between text-lg">
                      <span>Gross Earnings ({batch.expectedItemCount} boots)</span>
                      <span>${grossPay.toFixed(2)}</span>
                  </div>
                  
                  {batch.adjustments?.map((adj, idx) => (
                      <div key={idx} className="flex justify-between" style={{ color: adj.type === 'deduction' ? 'var(--status-error)' : 'var(--status-paid)' }}>
                          <span>{adj.description}</span>
                          <span>{adj.type === 'deduction' ? '-' : '+'}${adj.amount.toFixed(2)}</span>
                      </div>
                  ))}

                  <div className="flex justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--glass-border)', fontWeight: 600, fontSize: '1.25rem' }}>
                      <span>Net Payout</span>
                      <span style={{ color: 'var(--status-paid)' }}>${netPay.toFixed(2)}</span>
                  </div>
              </div>
          </div>
      )}

      {['draft', 'rejected'].includes(batch.status) && (
        <div className="glass-card mb-4">
          <h3>Add Vehicle</h3>
        <form onSubmit={handleAddTransaction} className="mt-4">
           <div className="form-group">
            <label className="form-label">License Plate (Optional)</label>
            <input type="text" className="form-input" value={plate} onChange={e => setPlate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle Description (Optional)</label>
            <input type="text" className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="flex gap-4">
             <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Card Last 4</label>
                <input type="text" maxLength={4} className="form-input" value={cardLast4} onChange={e => setCardLast4(e.target.value)} required />
             </div>
             <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Amount ($) (Optional)</label>
                <input type="number" step="0.01" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
             </div>
          </div>

          <div className="form-group">
             <label className="form-label">Transaction Photos (Optional)</label>
             <input id="txPhotosInput" type="file" accept="image/*" multiple onChange={e => setTxPics(Array.from(e.target.files))} className="form-input" />
          </div>

          <button type="submit" className="btn btn-primary mt-4" style={{ width: '100%' }} disabled={isMatched}>
            Save Transaction
          </button>
        </form>
      </div>
      )}

      {transactions.length > 0 && (
         <div className="glass-card mb-4">
             <h3>Added Transactions</h3>
             <div className="flex flex-col gap-2 mt-4">
                {transactions.map(tx => (
                    <div key={tx.id} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)'}}>
                        <div>
                            <div style={{ fontWeight: 600 }}>{tx.licensePlate || 'No Plate'}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>{tx.vehicleDescription || 'No Desc'}</div>
                            {tx.photos && tx.photos.length > 0 && (
                                <div className="flex gap-2 mt-1 flex-wrap">
                                    {tx.photos.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', textDecoration: 'underline' }}>View Photo {i + 1}</a>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {tx.isUploading ? (
                                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                    <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--accent-primary)', borderRightColor: 'var(--accent-primary)', borderBottomColor: 'var(--accent-primary)'}}></div>
                                    <span style={{ fontSize: '0.875rem' }}>Uploading...</span>
                                </div>
                            ) : tx.hasError ? (
                                <div style={{ color: 'var(--status-error)', fontSize: '0.875rem' }}>Upload Failed</div>
                            ) : (
                                <>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600 }}>${tx.amountPaid.toFixed(2)}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>*{tx.cardLast4}</div>
                                    </div>
                                    {['draft', 'rejected'].includes(batch.status) && (
                                        <>
                                            <button 
                                                type="button"
                                                className="btn btn-secondary btn-icon-sm" 
                                                style={{ color: 'var(--accent-primary)' }}
                                                onClick={() => handleEditClick(tx)}
                                                title="Edit Transaction"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                type="button"
                                                className="btn btn-secondary btn-icon-sm" 
                                                style={{ color: 'var(--status-error)' }}
                                                onClick={() => handleDeleteTransaction(tx.id)}
                                                title="Delete Transaction"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ))}
             </div>
         </div>
      )}

      {['draft', 'rejected'].includes(batch.status) && (
          <div className="flex flex-col gap-4 mt-8">
              {isMatched && (
                <>
                  <button className="btn btn-primary" style={{ width: '100%', backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={handleSubmitBatch}>
                    Submit Full Daily Batch & Return
                  </button>
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleSubmitAndAddAnother}>
                    Submit & Add Another Batch
                  </button>
                </>
              )}
              <button className="btn btn-secondary" style={{ width: '100%', color: 'var(--status-error)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={handleCancelBatch}>
                Cancel & Delete Entire Batch
              </button>
          </div>
      )}

      {editingTx && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <button className="modal-close" onClick={() => setEditingTx(null)}>X</button>
            <h3 className="mb-4">Edit Transaction</h3>
            
            {editExistingPhotos.length > 0 && (
                <div className="mb-4">
                    <label className="form-label">Existing Photos</label>
                    <div className="flex gap-2 flex-wrap mt-2">
                        {editExistingPhotos.map((url, i) => (
                            <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                                <img src={url} alt={`Tx Photo ${i+1}`} style={{ height: '60px', width: 'auto', borderRadius: '4px', objectFit: 'cover'}} />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveExistingPhoto(i)}
                                    style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        background: 'var(--status-error)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }}
                                    title="Delete Photo"
                                >
                                    X
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <form onSubmit={handleUpdateTransaction}>
               <div className="form-group">
                <label className="form-label">License Plate (Optional)</label>
                <input type="text" className="form-input" value={editPlate} onChange={e => setEditPlate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Description (Optional)</label>
                <input type="text" className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              </div>
              <div className="flex gap-4 flex-responsive">
                 <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Card Last 4</label>
                    <input type="text" maxLength={4} className="form-input" value={editCardLast4} onChange={e => setEditCardLast4(e.target.value)} required />
                 </div>
                 <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Amount ($) (Optional)</label>
                    <input type="number" step="0.01" className="form-input" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                 </div>
              </div>

              <div className="form-group">
                 <label className="form-label">Add More Photos (Optional)</label>
                 <input type="file" accept="image/*" multiple onChange={e => setEditTxPics(Array.from(e.target.files))} className="form-input" />
                 <small style={{color:'var(--text-secondary)'}}>These will be added to the existing photos.</small>
              </div>

              <div className="flex justify-end gap-4 flex-responsive mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingTx(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Update Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
