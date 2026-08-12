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
  const [entryMode, setEntryMode] = useState('manual'); // 'manual' or 'ai'
  const [manualItemCount, setManualItemCount] = useState('');
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
    let finalData = null;
    let finalTicketUrl = ticketUrl;
    
    if (entryMode === 'ai' && extractedData) {
        finalData = extractedData;
    } else if (entryMode === 'manual' && manualItemCount) {
        finalData = {
            batchTotalAmount: 0,
            expectedItemCount: parseInt(manualItemCount, 10)
        };

        if (ticketImage && !ticketUrl) {
            setUploading(true);
            try {
                const storageRef = ref(storage, `uploads/${auth.currentUser.uid}/tickets/${Date.now()}_${ticketImage.name}`);
                await uploadBytes(storageRef, ticketImage);
                finalTicketUrl = await getDownloadURL(storageRef);
            } catch (err) {
                console.error("Error uploading image manually", err);
                alert("Failed to upload image.");
                setUploading(false);
                return;
            }
            setUploading(false);
        }
    }

    if (!finalData) return;

    setUploading(true);
    try {
      const batchRef = await addDoc(collection(db, 'batches'), {
        operatorId: auth.currentUser.uid,
        date: serverTimestamp(),
        createdAt: new Date().toISOString(),
        status: 'draft', // Optional for manual
        batchTicketUrl: finalTicketUrl || null, // Optional for manual
        batchTotalAmount: finalData.batchTotalAmount,
        expectedItemCount: finalData.expectedItemCount,
        calculatedPay: finalData.expectedItemCount * (userData?.ratePerBoot || 0)
      });
      setUploading(false);
      // Redirect to transaction form/details page for this batch (To be created)
      navigate(`/operator/batch/${batchRef.id}`);
    } catch (err) {
      console.error("Error creating batch:", err);
      setUploading(false);
    }
  };

  return (
    <div>

      <div className="flex gap-4 mb-6">
        <button 
          className={`btn ${entryMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setEntryMode('manual')}
        >
          Enter Manually
        </button>
        <button 
          className={`btn ${entryMode === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setEntryMode('ai')}
        >
          Auto-Extract (AI)
        </button>
      </div>

      {entryMode === 'ai' && (
        <>
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
                   <div className="form-label">Expected Boots</div>
                   <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{extractedData.expectedItemCount}</div>
                 </div>
              </div>
              
              <button className="btn btn-primary mt-4" onClick={handleCreateBatch} disabled={uploading} style={{ width: '100%' }}>
                {uploading ? 'Creating...' : 'Confirm & Add Vehicles'}
              </button>
            </div>
          )}
        </>
      )}

      {entryMode === 'manual' && (
        <div className="glass-card mb-4">
          <h3>Manual Data Entry</h3>
          <p className="form-label mb-4">Enter the totals from your terminal summary receipt.</p>
          
          <div className="form-group">
            <label className="form-label">Batch Image (Optional)</label>
            <input type="file" accept="image/*" onChange={handleFileChange} className="form-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Expected Boot Count</label>
            <input 
              type="number" 
              className="form-input" 
              value={manualItemCount}
              onChange={(e) => setManualItemCount(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>

          <button 
            className="btn btn-primary mt-4" 
            onClick={handleCreateBatch} 
            disabled={!manualItemCount || uploading}
            style={{ width: '100%' }}
          >
            {uploading ? 'Creating Batch...' : 'Confirm & Add Vehicles'}
          </button>
        </div>
      )}
    </div>
  );
}
