import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MessageSquare, FileText, CheckCircle, AlertCircle, Clock, Download, Bell, Settings } from 'lucide-react';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { generate1099PDF } from '../utils/pdfGenerator';

export default function OperatorDashboard() {
  const { userData } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [published1099s, setPublished1099s] = useState([]);
  const [show1099Modal, setShow1099Modal] = useState(false);
  const [downloading1099Id, setDownloading1099Id] = useState(null);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    streetAddress: '',
    city: '',
    state: '',
    zip: '',
    ssnOrEin: ''
  });

  const navigate = useNavigate();

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const q = query(
          collection(db, 'batches'),
          where('operatorId', '==', auth.currentUser.uid),
          orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        let batchData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        batchData.sort((a, b) => {
          const getSortTime = (batch) => {
            if (batch.date) return batch.date.seconds ? batch.date.seconds * 1000 : new Date(batch.date).getTime();
            return 0;
          };
          return getSortTime(b) - getSortTime(a);
        });
        setBatches(batchData);
      } catch (err) {
        // Requires index error might happen if not created, but we can catch it
        console.error("Error fetching batches:", err);
      } finally {
        setLoading(false);
      }
    };
    
    const fetch1099s = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'published_1099s'),
          where('operatorId', '==', auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => b.year - a.year);
        setPublished1099s(docs);
      } catch (err) {
        console.error("Error fetching 1099s:", err);
      }
    };

    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const secureDoc = await getDoc(doc(db, 'operator_secure_data', auth.currentUser.uid));
        const ud = userDoc.exists() ? userDoc.data() : {};
        const sd = secureDoc.exists() ? secureDoc.data() : {};
        
        setProfileData({
          streetAddress: ud.streetAddress || '',
          city: ud.city || '',
          state: ud.state || '',
          zip: ud.zip || '',
          ssnOrEin: sd.ssn || ''
        });
      } catch (err) {
        console.error("Error fetching profile data:", err);
      }
    };

    fetchBatches();
    fetch1099s();
    fetchProfile();
  }, []);

  const getBatchPayout = (batch) => {
    if (batch.finalPayoutAmount != null) return batch.finalPayoutAmount;

    let total = batch.calculatedPay || 0;
    if (batch.adjustments) {
      batch.adjustments.forEach(adj => {
        const amount = Number(adj.amount) || 0;
        if (adj.type === 'bonus') total += amount;
        if (adj.type === 'reimbursement') total += amount;
        if (adj.type === 'deduction') total -= amount;
      });
    }
    return total;
  };

  const totalBoots = batches.reduce((acc, batch) => acc + (batch.expectedItemCount || 0), 0);
  const pendingPay = batches
    .filter(b => ['pending', 'verified', 'processing'].includes(b.status))
    .reduce((acc, batch) => acc + getBatchPayout(batch), 0);

  const handleDownload1099 = async (docData) => {
    try {
      setDownloading1099Id(docData.id);
      const pdf = await generate1099PDF(docData, docData.year);
      const link = document.createElement('a');
      link.href = pdf.url;
      link.download = pdf.filename;
      link.click();
    } catch (err) {
      alert("Error generating 1099: " + err.message);
    } finally {
      setDownloading1099Id(null);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        streetAddress: profileData.streetAddress,
        city: profileData.city,
        state: profileData.state,
        zip: profileData.zip
      });
      await setDoc(doc(db, 'operator_secure_data', auth.currentUser.uid), {
        ssn: profileData.ssnOrEin
      }, { merge: true });
      setShowSettingsModal(false);
      alert("Profile updated successfully.");
    } catch (err) {
      alert("Error updating profile: " + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (userData?.status === 'inactive') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <AlertCircle size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Account Deactivated</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your operator account has been deactivated. Please contact your administrator if you believe this is an error.</p>
        <button className="btn btn-primary" onClick={() => signOut(auth)}>Sign Out</button>
      </div>
    );
  }

  return (
    <div>
      {published1099s.length > 0 && (
        <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="flex items-center gap-3 text-white">
            <Bell size={20} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Your {published1099s[0].year} 1099-NEC Form is Ready!</div>
              <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Your tax documents are available for download.</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShow1099Modal(true)}>
            View Documents
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Overview</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Overview of your recent batches and pending pay.</p>
        </div>
        <div className="flex gap-2 flex-responsive" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/operator/new-batch')}>
            + New Batch Submission
          </button>
          <button className="btn btn-secondary flex items-center gap-2" onClick={() => setShowSettingsModal(true)}>
            <Settings size={16} /> Profile
          </button>
          <button className="btn btn-secondary" onClick={() => setShow1099Modal(true)}>
            Tax Documents (1099) {published1099s.length > 0 && `(${published1099s.length})`}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Total Boots */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Boots (All Time)</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalBoots}</div>
        </div>

        {/* Pending Pay */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-pending)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Clock size={20} />
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pending Pay</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>${pendingPay.toFixed(2)}</div>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{ marginBottom: '1rem' }}>Recent Batches</h3>
        {loading ? (
          <div className="flex flex-col gap-2 mt-4">
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {batches.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No batches found.</p> : null}
            {batches.map(batch => (
              <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)', boxShadow: 'none', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontWeight: 500 }}>
                    {batch.paidAt
                      ? `${new Date(batch.paidAt.seconds ? batch.paidAt.seconds * 1000 : batch.paidAt).toLocaleDateString()} (Paid)`
                      : (batch.date ? new Date(batch.date.seconds ? batch.date.seconds * 1000 : batch.date).toLocaleDateString() : 'N/A')}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {batch.expectedItemCount} boots
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ flex: 1, justifyContent: 'center', minWidth: '150px' }}>
                  <div className={`badge badge-${batch.status === 'archived' ? 'paid' : batch.status}`}>
                    {batch.status === 'archived' ? 'paid' : batch.status}
                  </div>
                  {batch.reviewNotes && (
                    <MessageSquare
                      size={16}
                      style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                      title={batch.reviewNotes}
                      onClick={() => alert(`Admin Note:\n\n${batch.reviewNotes}`)}
                    />
                  )}
                  {(batch.status === 'rejected' || batch.status === 'draft') && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => navigate(`/operator/batch/${batch.id}`)}
                    >
                      {batch.status === 'draft' ? 'Resume Draft' : 'Fix & Resubmit'}
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, textAlign: 'right', minWidth: '80px' }}>
                  <span style={{ fontWeight: 200, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {['paid', 'processing', 'archived'].includes(batch.status) ? `$${getBatchPayout(batch).toFixed(2)}` : '--'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {show1099Modal && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setShow1099Modal(false)}>X</button>
            <h3 className="mb-4">Tax Documents</h3>
            
            {published1099s.length > 0 ? (
              <div className="flex flex-col gap-3">
                {published1099s.map(docData => (
                  <div key={docData.id} className="glass-card flex justify-between items-center" style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{docData.year} 1099-NEC</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        YTD Earnings: ${docData.ytdTotal.toFixed(2)}
                      </div>
                    </div>
                    <button 
                      className="btn btn-primary flex items-center gap-2"
                      onClick={() => handleDownload1099(docData)}
                      disabled={downloading1099Id === docData.id}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      <Download size={16} />
                      {downloading1099Id === docData.id ? 'Generating...' : 'Download PDF'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>
                No tax documents have been published for your account yet. They will appear here at year end once generated by an administrator.
              </p>
            )}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-card" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setShowSettingsModal(false)}>X</button>
            <h3 className="mb-4">Profile Settings</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Update your address and SSN/EIN. This information will be used for your year-end 1099 tax forms.
            </p>
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              <div className="form-group">
                <label>Street Address</label>
                <input 
                  type="text" 
                  value={profileData.streetAddress}
                  onChange={(e) => setProfileData({...profileData, streetAddress: e.target.value})}
                  className="form-input"
                  placeholder="123 Main St, Apt 4B"
                  required
                />
              </div>
              <div className="flex gap-4">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>City</label>
                  <input 
                    type="text" 
                    value={profileData.city}
                    onChange={(e) => setProfileData({...profileData, city: e.target.value})}
                    className="form-input"
                    placeholder="Austin"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>State</label>
                  <input 
                    type="text" 
                    value={profileData.state}
                    onChange={(e) => setProfileData({...profileData, state: e.target.value})}
                    className="form-input"
                    placeholder="TX"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>ZIP Code</label>
                  <input 
                    type="text" 
                    value={profileData.zip}
                    onChange={(e) => setProfileData({...profileData, zip: e.target.value})}
                    className="form-input"
                    placeholder="78701"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>SSN or EIN</label>
                <input 
                  type="text" 
                  value={profileData.ssnOrEin}
                  onChange={(e) => setProfileData({...profileData, ssnOrEin: e.target.value})}
                  className="form-input"
                  placeholder="XXX-XX-XXXX"
                  required
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Stored securely. Required for tax reporting.
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
