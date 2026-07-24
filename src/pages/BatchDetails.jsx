import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
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
  
  const [vehiclePics, setVehiclePics] = useState([]);
  const [receiptPic, setReceiptPic] = useState(null);
  const [releasePic, setReleasePic] = useState(null);

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

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (vehiclePics.length === 0 || !receiptPic || !releasePic) {
        alert("Please upload all required photos (Vehicle, Receipt, Release Form)");
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
    const capturedVehiclePics = [...vehiclePics];
    const capturedReceiptPic = receiptPic;
    const capturedReleasePic = releasePic;

    // Optimistically add to UI
    setTransactions(prev => [...prev, txData]);

    // Reset form immediately so user can keep typing
    setPlate(''); setDesc(''); setCardLast4(''); setAmount('');
    
    // For file inputs, we also need to clear the actual DOM elements if they have a value, 
    // but clearing the state will prevent them from being reused on next submit anyway.
    setVehiclePics([]); setReceiptPic(null); setReleasePic(null);
    document.getElementById('vehiclePhotoInput').value = '';
    document.getElementById('receiptPhotoInput').value = '';
    document.getElementById('releasePhotoInput').value = '';

    // Fire and forget upload
    (async () => {
        try {
            const uploadImage = async (file, type) => {
                const fileRef = ref(storage, `uploads/${auth.currentUser.uid}/transactions/${batchId}/${Date.now()}_${type}`);
                await uploadBytes(fileRef, file);
                return await getDownloadURL(fileRef);
            };

            const vehicleUrls = await Promise.all(
                capturedVehiclePics.map((pic, idx) => uploadImage(pic, `vehicle_${idx}`))
            );
            
            const receiptUrl = await uploadImage(capturedReceiptPic, 'receipt');
            const releaseUrl = await uploadImage(capturedReleasePic, 'release');

            const newTx = {
                licensePlate: txData.licensePlate,
                vehicleDescription: txData.vehicleDescription,
                cardLast4: txData.cardLast4,
                amountPaid: txData.amountPaid,
                photos: {
                  vehicle: vehicleUrls,
                  receipt: receiptUrl,
                  release: releaseUrl
                }
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

  if (loading) return (
    <div className="container mt-8">
      <SkeletonLoader type="block" />
      <div className="mt-4"><SkeletonLoader type="card" /></div>
      <div className="mt-4"><SkeletonLoader type="card" /></div>
    </div>
  );
  if (!batch) return <div className="container mt-8">Batch not found.</div>;

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
    <div className="container mt-8 pb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="flex items-center gap-2">
            <button className="btn btn-secondary" style={{padding: '0.5rem'}} onClick={() => navigate('/operator')}><ChevronLeft size={20}/></button>
            Batch Details
        </h2>
        <div className={`badge badge-${batch.status}`}>{batch.status}</div>
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

      <div className="glass-card mb-4">
        <h3>Add Vehicle</h3>
        <form onSubmit={handleAddTransaction} className="mt-4">
           <div className="form-group">
            <label className="form-label">License Plate</label>
            <input type="text" className="form-input" value={plate} onChange={e => setPlate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle Description</label>
            <input type="text" className="form-input" value={desc} onChange={e => setDesc(e.target.value)} required />
          </div>
          <div className="flex gap-4">
             <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Card Last 4</label>
                <input type="text" maxLength={4} className="form-input" value={cardLast4} onChange={e => setCardLast4(e.target.value)} required />
             </div>
             <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Amount ($)</label>
                <input type="number" step="0.01" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} required />
             </div>
          </div>

          <div className="form-group">
             <label className="form-label">Vehicle Photo(s)</label>
             <input id="vehiclePhotoInput" type="file" accept="image/*" multiple onChange={e => setVehiclePics(Array.from(e.target.files))} className="form-input" required/>
          </div>
          <div className="form-group">
             <label className="form-label">Receipt Photo</label>
             <input id="receiptPhotoInput" type="file" accept="image/*" onChange={e => setReceiptPic(e.target.files[0])} className="form-input" required/>
          </div>
          <div className="form-group">
             <label className="form-label">Release Form Photo</label>
             <input id="releasePhotoInput" type="file" accept="image/*" onChange={e => setReleasePic(e.target.files[0])} className="form-input" required/>
          </div>

          <button type="submit" className="btn btn-primary mt-4" style={{ width: '100%' }} disabled={isMatched}>
            Save Transaction
          </button>
        </form>
      </div>

      {transactions.length > 0 && (
         <div className="glass-card mb-4">
             <h3>Added Transactions</h3>
             <div className="flex flex-col gap-2 mt-4">
                {transactions.map(tx => (
                    <div key={tx.id} className="flex justify-between items-center" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)'}}>
                        <div>
                            <div style={{ fontWeight: 600 }}>{tx.licensePlate}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>{tx.vehicleDescription}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            {tx.isUploading ? (
                                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                    <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--accent-primary)', borderRightColor: 'var(--accent-primary)', borderBottomColor: 'var(--accent-primary)'}}></div>
                                    <span style={{ fontSize: '0.875rem' }}>Uploading...</span>
                                </div>
                            ) : tx.hasError ? (
                                <div style={{ color: 'var(--status-error)', fontSize: '0.875rem' }}>Upload Failed</div>
                            ) : (
                                <>
                                    <div style={{ fontWeight: 600 }}>${tx.amountPaid.toFixed(2)}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>*{tx.cardLast4}</div>
                                </>
                            )}
                        </div>
                    </div>
                ))}
             </div>
         </div>
      )}

      {isMatched && (
          <div className="flex flex-col gap-4">
              <button className="btn btn-primary" style={{ width: '100%', backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={handleSubmitBatch}>
                Submit Full Daily Batch & Return
              </button>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleSubmitAndAddAnother}>
                Submit & Add Another Batch
              </button>
          </div>
      )}

    </div>
  );
}
