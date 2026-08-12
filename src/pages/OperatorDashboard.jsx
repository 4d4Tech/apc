import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { MessageSquare, FileText, CheckCircle, AlertCircle, Clock, Download, Bell, Settings, Search, Filter, X, Check, SlidersHorizontal, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { generate1099PDF } from '../utils/pdfGenerator';
import { PiiInput } from '../components/PiiInput';
import { encryptPii, decryptPii, maskPii, extractLast4, isValidSsnOrEin } from '../utils/piiCrypto';

const getSafeDate = (d) => {
  if (!d) return null;
  try {
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    if (typeof d.toDate === 'function') {
      const dt = d.toDate();
      return isNaN(dt.getTime()) ? null : dt;
    }
    if (typeof d === 'object' && typeof d.seconds === 'number') {
      return new Date(d.seconds * 1000);
    }
    if (typeof d === 'number') {
      return new Date(d);
    }
    if (typeof d === 'string') {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  } catch (e) {
    return null;
  }
  return null;
};

const getBatchDateObj = (batch) => {
  if (!batch) return null;
  return getSafeDate(batch.paidAt) ||
         getSafeDate(batch.date) ||
         getSafeDate(batch.createdAt) ||
         getSafeDate(batch.timestamp) ||
         getSafeDate(batch.updatedAt);
};

const formatBatchDate = (batch) => {
  const dt = getBatchDateObj(batch);
  if (!dt) return 'N/A';
  return dt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

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

  // Filter & Pagination States
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('all');
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

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
          const dtA = getBatchDateObj(a);
          const dtB = getBatchDateObj(b);
          const timeA = dtA ? dtA.getTime() : 0;
          const timeB = dtB ? dtB.getTime() : 0;
          return timeB - timeA;
        });
        setBatches(batchData);
      } catch (err) {
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
        
        let decryptedSsn = '';
        if (sd.ssn) {
          decryptedSsn = await decryptPii(sd.ssn);
        }
        
        setProfileData({
          streetAddress: ud.streetAddress || '',
          city: ud.city || '',
          state: ud.state || '',
          zip: ud.zip || '',
          ssnOrEin: decryptedSsn || sd.maskedSsn || ''
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

  const getFilteredBatches = () => {
    let filtered = [...batches];

    if (historyStatusFilter && historyStatusFilter !== 'all') {
      filtered = filtered.filter(b => {
        const effectiveStatus = b.status === 'archived' ? 'paid' : b.status;
        return effectiveStatus === historyStatusFilter;
      });
    }

    if (historySearchTerm) {
      const lowerSearch = historySearchTerm.toLowerCase();
      filtered = filtered.filter(b => {
        const idMatch = b.id.toLowerCase().includes(lowerSearch);
        const bootsMatch = (b.expectedItemCount || '').toString().includes(lowerSearch);
        const notesMatch = (b.reviewNotes || '').toLowerCase().includes(lowerSearch);
        return idMatch || bootsMatch || notesMatch;
      });
    }

    if (historyDateFilter && historyDateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(b => {
        const batchDate = getBatchDateObj(b);
        if (!batchDate) return false;

        if (historyDateFilter === 'today') {
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          return batchDate >= startOfToday;
        } else if (historyDateFilter === 'thisWeek') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          return batchDate >= startOfWeek;
        } else if (historyDateFilter === 'lastWeek') {
          const startOfThisWeek = new Date(now);
          startOfThisWeek.setDate(now.getDate() - now.getDay());
          startOfThisWeek.setHours(0, 0, 0, 0);
          const startOfLastWeek = new Date(startOfThisWeek);
          startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
          return batchDate >= startOfLastWeek && batchDate < startOfThisWeek;
        } else if (historyDateFilter === 'thisMonth') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return batchDate >= startOfMonth;
        } else if (historyDateFilter === 'lastMonth') {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return batchDate >= startOfLastMonth && batchDate < startOfThisMonth;
        }
        return true;
      });
    }

    filtered.sort((a, b) => {
      const dtA = getBatchDateObj(a);
      const dtB = getBatchDateObj(b);
      const timeA = dtA ? dtA.getTime() : 0;
      const timeB = dtB ? dtB.getTime() : 0;
      return timeB - timeA;
    });

    return filtered;
  };

  const totalBoots = batches.reduce((acc, batch) => acc + (batch.expectedItemCount || 0), 0);
  const pendingPay = batches
    .filter(b => ['pending', 'verified', 'processing'].includes(b.status))
    .reduce((acc, batch) => acc + getBatchPayout(batch), 0);

  // Pagination calculations for Operator Batch History
  const allFilteredHistory = getFilteredBatches();
  const totalHistoryCount = allFilteredHistory.length;
  const totalHistoryPages = Math.ceil(totalHistoryCount / historyItemsPerPage) || 1;
  const validHistoryCurrentPage = Math.min(Math.max(1, historyCurrentPage), totalHistoryPages);
  const historyStartIndex = (validHistoryCurrentPage - 1) * historyItemsPerPage;
  const historyEndIndex = Math.min(historyStartIndex + historyItemsPerPage, totalHistoryCount);
  const paginatedHistory = allFilteredHistory.slice(historyStartIndex, historyEndIndex);

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

    if (profileData.ssnOrEin && !isValidSsnOrEin(profileData.ssnOrEin)) {
      alert("Please provide a valid 9-digit SSN or EIN (e.g. XXX-XX-XXXX).");
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        streetAddress: profileData.streetAddress,
        city: profileData.city,
        state: profileData.state,
        zip: profileData.zip
      });

      if (profileData.ssnOrEin) {
        const encryptedSsn = await encryptPii(profileData.ssnOrEin);
        const maskedSsn = maskPii(profileData.ssnOrEin);
        const ssnLast4 = extractLast4(profileData.ssnOrEin);

        await setDoc(doc(db, 'operator_secure_data', auth.currentUser.uid), {
          ssn: encryptedSsn,
          maskedSsn,
          ssnLast4,
          updatedAt: new Date()
        }, { merge: true });
      }

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

      {/* M3 Recent Batches Section */}
      <div className="glass-card" style={{ padding: '1.75rem', borderRadius: 'var(--md-sys-shape-corner-extra-large)' }}>
        {/* Section Header */}
        <div className="flex justify-between items-center mb-6 flex-responsive gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal size={20} style={{ color: 'var(--md-sys-color-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Batch History</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.84375rem', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Filter and search through your submitted boot batches and payout history.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge" style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
              fontSize: '0.75rem',
              padding: '0.25rem 0.75rem'
            }}>
              {totalHistoryCount} record{totalHistoryCount !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>

        {/* M3 Search Bar & Filter Controls Container */}
        <div style={{
          backgroundColor: 'var(--md-sys-color-surface-variant)',
          borderRadius: 'var(--md-sys-shape-corner-medium)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          border: '1px solid var(--md-sys-color-outline-variant)'
        }}>
          {/* Row 1: M3 Search Field & Rows Per Page Selector */}
          <div className="flex gap-4 items-center mb-4 flex-wrap">
            {/* Search Input */}
            <div style={{ flex: '1 1 300px', width: '100%', maxWidth: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={20}
                style={{
                  position: 'absolute',
                  left: '1rem',
                  color: 'var(--md-sys-color-on-surface-variant)',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Search batch ID, boots count, or notes..."
                value={historySearchTerm}
                onChange={e => {
                  setHistorySearchTerm(e.target.value);
                  setHistoryCurrentPage(1);
                }}
                style={{
                  height: '44px',
                  paddingLeft: '2.75rem',
                  paddingRight: historySearchTerm ? '2.5rem' : '1rem',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  borderRadius: 'var(--md-sys-shape-corner-large)',
                  border: '1px solid var(--md-sys-color-outline)',
                  fontSize: '0.9375rem'
                }}
              />
              {historySearchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setHistorySearchTerm('');
                    setHistoryCurrentPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--md-sys-color-on-surface-variant)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Rows Per Page Dropdown */}
            <div className="flex items-center gap-2" style={{ flex: '0 0 auto' }}>
              <label style={{ fontSize: '0.84375rem', color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Rows:
              </label>
              <select
                className="form-input"
                value={historyItemsPerPage}
                onChange={e => {
                  setHistoryItemsPerPage(Number(e.target.value));
                  setHistoryCurrentPage(1);
                }}
                style={{
                  height: '44px',
                  padding: '0 2rem 0 1rem',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline)',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
          </div>

          {/* Row 2: Filter Chips */}
          <div className="flex flex-col gap-3">
            {/* Status Filter Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>
                Status:
              </span>
              {[
                { id: 'all', label: 'All Statuses' },
                { id: 'pending', label: 'Pending' },
                { id: 'verified', label: 'Verified' },
                { id: 'processing', label: 'Processing' },
                { id: 'paid', label: 'Paid' },
                { id: 'rejected', label: 'Rejected' },
                { id: 'draft', label: 'Draft' }
              ].map(chip => {
                const isSelected = (historyStatusFilter || 'all') === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setHistoryStatusFilter(chip.id === 'all' ? '' : chip.id);
                      setHistoryCurrentPage(1);
                    }}
                    style={{
                      height: '32px',
                      padding: '0 0.875rem',
                      borderRadius: 'var(--md-sys-shape-corner-small)',
                      border: isSelected ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: isSelected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface)',
                      color: isSelected ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface)',
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected && <Check size={14} />}
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Date Range Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>
                Date Range:
              </span>
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'thisWeek', label: 'This Week' },
                { id: 'lastWeek', label: 'Last Week' },
                { id: 'thisMonth', label: 'This Month' },
                { id: 'lastMonth', label: 'Last Month' }
              ].map(chip => {
                const isSelected = historyDateFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter(chip.id);
                      setHistoryCurrentPage(1);
                    }}
                    style={{
                      height: '32px',
                      padding: '0 0.875rem',
                      borderRadius: 'var(--md-sys-shape-corner-small)',
                      border: isSelected ? '1px solid var(--md-sys-color-secondary)' : '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: isSelected ? 'var(--md-sys-color-secondary-container)' : 'var(--md-sys-color-surface)',
                      color: isSelected ? 'var(--md-sys-color-on-secondary-container)' : 'var(--md-sys-color-on-surface)',
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected && <Check size={14} />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filters Clear Button */}
          {(historySearchTerm || (historyStatusFilter && historyStatusFilter !== 'all') || historyDateFilter !== 'all') && (
            <div className="flex justify-between items-center mt-3 pt-3" style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)' }}>
                Active filters applied
              </span>
              <button
                type="button"
                onClick={() => {
                  setHistorySearchTerm('');
                  setHistoryStatusFilter('');
                  setHistoryDateFilter('all');
                  setHistoryCurrentPage(1);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--md-sys-color-error)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <X size={14} /> Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Batches Table / Card List */}
        {loading ? (
          <div className="flex flex-col gap-2 mt-4">
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
            <SkeletonLoader type="card" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {totalHistoryCount === 0 ? (
              <p className="text-center py-4" style={{ color: 'var(--text-secondary)' }}>No matching batches found.</p>
            ) : (
              <>
                {paginatedHistory.map(batch => {
                  const effectiveStatus = batch.status === 'archived' ? 'paid' : batch.status;
                  return (
                    <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', backgroundColor: 'var(--bg-primary)', boxShadow: 'none', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>
                          {formatBatchDate(batch)}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {batch.expectedItemCount} boots
                        </div>
                      </div>

                      <div className="flex items-center gap-2" style={{ flex: 1, justifyContent: 'center', minWidth: '150px' }}>
                        <span className={`badge badge-${effectiveStatus}`}>
                          {effectiveStatus}
                        </span>
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

                      <div style={{ flex: 1, textAlign: 'right', minWidth: '100px' }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {['paid', 'processing', 'archived', 'verified'].includes(batch.status) ? `$${getBatchPayout(batch).toFixed(2)}` : '--'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Operator Pagination Footer */}
                {totalHistoryPages > 1 && (
                  <div className="flex justify-between items-center mt-6 pt-4 flex-wrap gap-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Page <strong style={{ color: 'var(--text-primary)' }}>{validHistoryCurrentPage}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalHistoryPages}</strong> ({totalHistoryCount} total items)
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="btn btn-secondary btn-sm flex items-center gap-1"
                        disabled={validHistoryCurrentPage <= 1}
                        onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))}
                      >
                        <ChevronLeft size={16} /> Previous
                      </button>

                      <div className="flex gap-1 items-center">
                        {Array.from({ length: totalHistoryPages }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === totalHistoryPages || Math.abs(page - validHistoryCurrentPage) <= 1)
                          .map((page, idx, arr) => (
                            <React.Fragment key={page}>
                              {idx > 0 && arr[idx - 1] !== page - 1 && (
                                <span style={{ padding: '0 0.25rem', color: 'var(--text-secondary)' }}>...</span>
                              )}
                              <button
                                className={`btn btn-sm ${page === validHistoryCurrentPage ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ minWidth: '32px', padding: '0 0.5rem' }}
                                onClick={() => setHistoryCurrentPage(page)}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          ))
                        }
                      </div>

                      <button
                        className="btn btn-secondary btn-sm flex items-center gap-1"
                        disabled={validHistoryCurrentPage >= totalHistoryPages}
                        onClick={() => setHistoryCurrentPage(prev => Math.min(prev + 1, totalHistoryPages))}
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
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
              <PiiInput
                label="SSN or EIN"
                value={profileData.ssnOrEin}
                onChange={(val) => setProfileData({...profileData, ssnOrEin: val})}
                placeholder="XXX-XX-XXXX"
                required
                helperText="Stored securely with field-level encryption. Required for tax reporting."
              />
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
