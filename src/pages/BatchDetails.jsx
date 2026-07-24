import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { useAuth } from '../AuthContext';
import { CheckCircle2, ChevronLeft } from 'lucide-react';

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
  
  const [vehiclePic, setVehiclePic] = useState(null);
  const [receiptPic, setReceiptPic] = useState(null);
  const [releasePic, setReleasePic] = useState(null);
  const [uploadingTx, setUploadingTx] = useState(false);

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
    if (!vehiclePic || !receiptPic || !releasePic) {
        alert("Please upload all required photos (Vehicle, Receipt, Release Form)");
        return;
    }
    setUploadingTx(true);
    
    try {
      const uploadImage = async (file, type) => {
        const fileRef = ref(storage, `uploads/${auth.currentUser.uid}/transactions/${batchId}/${Date.now()}_${type}`);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
      };

      const vehicleUrl = await uploadImage(vehiclePic, 'vehicle');
      const receiptUrl = await uploadImage(receiptPic, 'receipt');
      const releaseUrl = await uploadImage(releasePic, 'release');

      const newTx = {
        licensePlate: plate,
        vehicleDescription: desc,
        cardLast4: cardLast4,
        amountPaid: Number(amount),
        photos: {
          vehicle: vehicleUrl,
          receipt: receiptUrl,
          release: releaseUrl
        }
      };

      const docRef = await addDoc(collection(db, `batches/${batchId}/transactions`), newTx);
      setTransactions([...transactions, { id: docRef.id, ...newTx }]);

      // Reset form
      setPlate(''); setDesc(''); setCardLast4(''); setAmount('');
      setVehiclePic(null); setReceiptPic(null); setReleasePic(null);

    } catch (err) {
      console.error(err);
    } finally {
      setUploadingTx(false);
    }
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

  if (loading) return <div className="container mt-8"><div className="spinner"></div></div>;
  if (!batch) return <div className="container mt-8">Batch not found.</div>;

  const isMatched = transactions.length === batch.expectedItemCount;

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
             <label className="form-label">Vehicle Photo</label>
             <input type="file" accept="image/*" onChange={e => setVehiclePic(e.target.files[0])} className="form-input" required/>
          </div>
          <div className="form-group">
             <label className="form-label">Receipt Photo</label>
             <input type="file" accept="image/*" onChange={e => setReceiptPic(e.target.files[0])} className="form-input" required/>
          </div>
          <div className="form-group">
             <label className="form-label">Release Form Photo</label>
             <input type="file" accept="image/*" onChange={e => setReleasePic(e.target.files[0])} className="form-input" required/>
          </div>

          <button type="submit" className="btn btn-primary mt-4" style={{ width: '100%' }} disabled={uploadingTx || isMatched}>
            {uploadingTx ? 'Uploading & Saving...' : 'Save Transaction'}
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
                            <div style={{ fontWeight: 600 }}>${tx.amountPaid.toFixed(2)}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)'}}>*{tx.cardLast4}</div>
                        </div>
                    </div>
                ))}
             </div>
         </div>
      )}

      {isMatched && (
          <button className="btn btn-primary" style={{ width: '100%', backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)'}} onClick={handleSubmitBatch}>
            Submit Full Daily Batch
          </button>
      )}

    </div>
  );
}
