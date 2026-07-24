import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, auth, storage, functions } from '../firebase';
import { useAuth } from '../AuthContext';

export default function NewBatch() {
  const [ticketImage, setTicketImage] = useState(null);
  const [ticketUrl, setTicketUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const navigate = useNavigate();
  const { userData } = useAuth();

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setTicketImage(e.target.files[0]);
    }
  };

  const handleUploadAndExtract = async () => {
    if (!ticketImage) return;
    setUploading(true);
    
    try {
      // 1. Upload to Storage
      const storageRef = ref(storage, `uploads/${auth.currentUser.uid}/tickets/${Date.now()}_${ticketImage.name}`);
      await uploadBytes(storageRef, ticketImage);
      const url = await getDownloadURL(storageRef);
      setTicketUrl(url);

      // 2. Call Cloud Function for AI Extraction
      const extractbatchdata = httpsCallable(functions, 'extractbatchdata');
      
      const result = await extractbatchdata({ imageUrl: url });
      setExtractedData(result.data);
      setUploading(false);

    } catch (err) {
      console.error(err);
      setUploading(false);
      alert("Failed to extract data. Ensure Cloud Functions are deployed and image is readable.");
    }
  };

  const handleCreateBatch = async () => {
    if (!extractedData) return;
    try {
      const batchRef = await addDoc(collection(db, 'batches'), {
        operatorId: auth.currentUser.uid,
        date: serverTimestamp(),
        status: 'pending',
        batchTicketUrl: ticketUrl,
        batchTotalAmount: extractedData.batchTotalAmount,
        expectedItemCount: extractedData.expectedItemCount,
        calculatedPay: extractedData.expectedItemCount * (userData?.ratePerBoot || 0)
      });
      // Redirect to transaction form/details page for this batch (To be created)
      navigate(`/operator/batch/${batchRef.id}`);
    } catch (err) {
      console.error("Error creating batch:", err);
    }
  };

  return (
    <div className="container mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2>New Batch Submission</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/operator')}>Back</button>
      </div>

      <div className="glass-card mb-4">
        <h3>1. Upload Daily Batch Ticket</h3>
        <p className="form-label mb-4">Take a photo of the terminal summary receipt.</p>
        
        <div className="form-group flex gap-4 items-center">
          <input type="file" accept="image/*" onChange={handleFileChange} className="form-input" />
          <button 
            className="btn btn-primary" 
            onClick={handleUploadAndExtract} 
            disabled={!ticketImage || uploading}
          >
            {uploading ? 'Extracting via AI...' : 'Upload & Extract'}
          </button>
        </div>
      </div>

      {extractedData && (
        <div className="glass-card mb-4">
          <h3>2. AI Extracted Data</h3>
          <div className="flex gap-4 mt-4">
             <div>
               <div className="form-label">Total Amount</div>
               <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>${extractedData.batchTotalAmount.toFixed(2)}</div>
             </div>
             <div>
               <div className="form-label">Expected Boots</div>
               <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{extractedData.expectedItemCount}</div>
             </div>
          </div>
          
          <button className="btn btn-primary mt-4" onClick={handleCreateBatch} style={{ width: '100%' }}>
            Confirm & Add Vehicles
          </button>
        </div>
      )}
    </div>
  );
}
