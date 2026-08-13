import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { CheckCircle2, ChevronLeft, Trash2, Edit2, Layers } from 'lucide-react';
import { SkeletonLoader } from '../components/SkeletonLoader';

export default function BatchDetails() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [groupBatches, setGroupBatches] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { userData } = useAuth();

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
        if (batchDoc.exists()) {
          const batchData = { id: batchDoc.id, ...batchDoc.data() };
          setBatch(batchData);

          const targetGroupId = batchData.groupId || batchData.id;
          if (auth.currentUser) {
            const groupQuery = query(
              collection(db, 'batches'),
              where('operatorId', '==', auth.currentUser.uid),
              where('groupId', '==', targetGroupId)
            );
            const groupSnap = await getDocs(groupQuery);
            if (!groupSnap.empty) {
              setGroupBatches(groupSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } else {
              setGroupBatches([batchData]);
            }
          } else {
            setGroupBatches([batchData]);
          }
        }

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

    const totalPhotos = editExistingPhotos.length + editTxPics.length;
    if (totalPhotos === 0) {
      alert("Transaction photo is required. Please attach at least one photo.");
      return;
    }

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

    if (!txPics || txPics.length === 0) {
      alert("Transaction photo is required. Please attach at least one photo before saving.");
      return;
    }

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

  const handleSubmitBatchGroup = async () => {
    if (!batch) return;
    try {
      const targetBatches = groupBatches.length > 0 ? groupBatches : [batch];
      for (const b of targetBatches) {
        if (['draft', 'rejected'].includes(b.status)) {
          await updateDoc(doc(db, 'batches', b.id), { status: 'pending' });
        }
      }
      alert(`Batch Group (${targetBatches.length} summary ticket(s)) submitted successfully for admin review!`);
      navigate('/operator');
    } catch (err) {
      console.error("Error submitting batch group:", err);
      alert("Failed to submit batch group.");
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
    let targetBatches = groupBatches.length > 0 ? groupBatches : [batch];

    if (targetBatches.length <= 1 && batch?.groupId && auth.currentUser) {
      try {
        const q = query(
          collection(db, 'batches'),
          where('operatorId', '==', auth.currentUser.uid),
          where('groupId', '==', batch.groupId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          targetBatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (err) {
        console.error("Error finding sister group batches:", err);
      }
    }

    const count = targetBatches.length;
    const confirmMessage = count > 1
      ? `Are you sure you want to completely delete this entire batch group (${count} tickets)? All transactions and progress for all tickets in this group will be lost.`
      : "Are you sure you want to completely delete this batch? All transactions and progress will be lost.";

    if (!window.confirm(confirmMessage)) return;

    try {
      for (const bDoc of targetBatches) {
        if (!bDoc || !bDoc.id) continue;
        const txSnap = await getDocs(collection(db, `batches/${bDoc.id}/transactions`));
        for (const txDoc of txSnap.docs) {
          await deleteDoc(doc(db, `batches/${bDoc.id}/transactions`, txDoc.id));
        }
        await deleteDoc(doc(db, 'batches', bDoc.id));
      }
      alert(count > 1 ? "Batch group cancelled and deleted." : "Batch cancelled and deleted.");
      navigate('/operator');
    } catch (err) {
      console.error("Error cancelling batch group:", err);
      alert("Failed to cancel batch group.");
    }
  };

  const handleAdjustExpectedBoots = async (delta) => {
    if (!batch) return;
    const currentCount = batch.expectedItemCount || 0;
    const newCount = Math.max(1, currentCount + delta);
    if (newCount === currentCount) return;

    const rate = userData?.ratePerBoot || 0;
    const newCalculatedPay = newCount * rate;

    try {
      await updateDoc(doc(db, 'batches', batchId), {
        expectedItemCount: newCount,
        calculatedPay: newCalculatedPay
      });
      setBatch(prev => ({
        ...prev,
        expectedItemCount: newCount,
        calculatedPay: newCalculatedPay
      }));
    } catch (err) {
      console.error("Error updating expected boot count:", err);
      alert("Failed to update expected boot count.");
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
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => navigate('/operator')}><ChevronLeft size={16} /> Back</button>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Batch Details</h1>
        </div>
        <div className={`badge badge-${batch.status}`}>{batch.status}</div>
      </div>

      {/* Batch Group Overview & Navigation */}
      <div className="glass-card mb-4" style={{ backgroundColor: 'var(--md-sys-color-surface-variant)', border: '1px solid var(--md-sys-color-outline-variant)', padding: '1.25rem' }}>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Layers size={18} style={{ color: 'var(--md-sys-color-primary)' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                Batch Group Submission ({groupBatches.length} Summary Ticket{groupBatches.length > 1 ? 's' : ''})
              </span>
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              Total Group Boots: {groupBatches.reduce((sum, b) => sum + (b.expectedItemCount || 0), 0)} boots
            </div>
          </div>

          {['draft', 'rejected'].includes(batch.status) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(`/operator/new-batch?groupId=${batch.groupId || batch.id}`)}
              style={{ fontSize: '0.8125rem' }}
            >
              + Add Another Ticket & Transactions to Group
            </button>
          )}
        </div>

        {groupBatches.length > 1 && (
          <div className="flex gap-2 flex-wrap pt-3" style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', alignSelf: 'center', marginRight: '0.25rem' }}>
              Group Tickets:
            </span>
            {groupBatches.map((bItem, idx) => (
              <button
                key={bItem.id}
                type="button"
                onClick={() => navigate(`/operator/batch/${bItem.id}`)}
                className={`btn btn-sm ${bItem.id === batchId ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8125rem' }}
              >
                Ticket #{idx + 1} ({bItem.expectedItemCount || 0} boots - {bItem.status})
              </button>
            ))}
          </div>
        )}
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
            <a href={batch.batchTicketUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>View Batch Ticket</a>
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

      <div className="glass-card mb-4 flex justify-between items-center flex-responsive gap-4">
        <div>
          <div className="form-label">Batch Progress</div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {transactions.length} / {batch.expectedItemCount} Added
            </div>

            {['draft', 'rejected'].includes(batch.status) && (
              <div className="flex items-center gap-1" style={{ backgroundColor: 'var(--md-sys-color-surface-variant)', padding: '0.25rem 0.625rem', borderRadius: 'var(--md-sys-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Expected Boots:</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon-sm"
                  style={{ width: '28px', height: '28px', fontSize: '1.125rem', fontWeight: 'bold', padding: 0 }}
                  disabled={batch.expectedItemCount <= 1}
                  onClick={() => handleAdjustExpectedBoots(-1)}
                  title="Decrease expected boot count"
                >
                  -
                </button>
                <span style={{ fontWeight: 700, padding: '0 0.375rem', fontSize: '0.9375rem' }}>{batch.expectedItemCount}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon-sm"
                  style={{ width: '28px', height: '28px', fontSize: '1.125rem', fontWeight: 'bold', padding: 0 }}
                  onClick={() => handleAdjustExpectedBoots(1)}
                  title="Increase expected boot count"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
        {isMatched && (
          <div style={{ color: 'var(--status-paid)' }} className="flex items-center gap-2 font-bold">
            <CheckCircle2 size={20} /> MATCHED
          </div>
        )}
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
              <label className="form-label">
                Transaction Photos <span style={{ color: '#ef4444', fontWeight: 'bold' }}>* (Required)</span>
              </label>
              <input
                id="txPhotosInput"
                type="file"
                accept="image/*"
                multiple
                required
                onChange={e => setTxPics(Array.from(e.target.files))}
                className="form-input"
              />
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                At least one photo of vehicle, boot, or receipt is required.
              </small>
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
              <div key={tx.id} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{tx.licensePlate || 'No Plate'}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{tx.vehicleDescription || 'No Desc'}</div>
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
                      <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--accent-primary)', borderRightColor: 'var(--accent-primary)', borderBottomColor: 'var(--accent-primary)' }}></div>
                      <span style={{ fontSize: '0.875rem' }}>Uploading...</span>
                    </div>
                  ) : tx.hasError ? (
                    <div style={{ color: 'var(--status-error)', fontSize: '0.875rem' }}>Upload Failed</div>
                  ) : (
                    <>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>${tx.amountPaid.toFixed(2)}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>*{tx.cardLast4}</div>
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
        <div className="flex flex-col gap-3 mt-8">
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)', color: '#ffffff' }}
            onClick={handleSubmitBatchGroup}
          >
            Submit Entire Batch Group ({groupBatches.length || 1} Ticket{groupBatches.length > 1 ? 's' : ''}) for Review
          </button>

          <button
            className="btn btn-secondary btn-lg"
            style={{ width: '100%', backgroundColor: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
            onClick={() => navigate(`/operator/new-batch?groupId=${batch.groupId || batch.id}`)}
          >
            + Add Another Ticket & Transactions to Batch Group
          </button>

          <button
            className="btn btn-secondary"
            style={{ width: '100%', color: 'var(--status-error)', borderColor: 'rgba(239, 68, 68, 0.2)', marginTop: '0.5rem' }}
            onClick={handleCancelBatch}
          >
            Cancel & Delete Entire Batch{groupBatches.length > 1 ? ' Group' : ''}
          </button>
        </div>
      )}

      {['pending', 'verified', 'processing', 'paid'].includes(batch.status) && (
        <div className="glass-card mt-8 flex justify-between items-center flex-responsive gap-4" style={{ backgroundColor: 'var(--md-sys-color-surface-variant)', border: '1px solid var(--md-sys-color-outline-variant)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>Need to submit another boot ticket for this pay period?</div>
            <div style={{ fontSize: '0.84375rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              You can submit multiple summary tickets and vehicle transactions for a single pay period.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/operator/new-batch')} style={{ whiteSpace: 'nowrap' }}>
            + Add Another Batch / Ticket
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
                      <img src={url} alt={`Tx Photo ${i + 1}`} style={{ height: '60px', width: 'auto', borderRadius: '4px', objectFit: 'cover' }} />
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
                <label className="form-label">
                  Photos <span style={{ color: editExistingPhotos.length === 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 'bold' }}>* (At least 1 photo required)</span>
                </label>
                <input type="file" accept="image/*" multiple onChange={e => setEditTxPics(Array.from(e.target.files))} className="form-input" />
                <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                  {editExistingPhotos.length > 0 ? `Currently keeping ${editExistingPhotos.length} existing photo(s). New photos will be appended.` : 'At least one photo must be attached.'}
                </small>
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
