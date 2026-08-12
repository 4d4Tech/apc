import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, getDoc, where, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { generatePaystubPDF, generate1099PDF } from '../utils/pdfGenerator';
import { PaystubPreviewModal } from '../components/PaystubPreviewModal';
import { MessageSquare, Archive, FileText, Eye, Users, Download, Images, User, Calendar, Trash2, Send, Settings, Plus, DollarSign, ChevronLeft, ChevronRight, Search, Filter, X, Check, SlidersHorizontal } from 'lucide-react';
import { PiiInput } from '../components/PiiInput';
import { encryptPii, decryptPii, maskPii, extractLast4, isValidSsnOrEin } from '../utils/piiCrypto';
import './AdminDashboard.css';

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
    const [newOpData, setNewOpData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        ratePerBoot: 10,
        password: '',
        status: 'active',
        ssn: ''
    });
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
    const [downloading1099Id, setDownloading1099Id] = useState(null);
    const [publishing1099Id, setPublishing1099Id] = useState(null);
    const [published1099s, setPublished1099s] = useState({});
    const [taxResults, setTaxResults] = useState(null);
    const [isDownloadingPaystub, setIsDownloadingPaystub] = useState(false);
    const [paystubPdfData, setPaystubPdfData] = useState(null);

    // Settings / Payer Profile State
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileData, setProfileData] = useState({
        companyName: '',
        streetAddress: '',
        city: '',
        state: '',
        zip: '',
        phone: '',
        tin: ''
    });
    const [payerInfo, setPayerInfo] = useState(null);

    // Run Payroll State
    const [selectedVerifiedBatches, setSelectedVerifiedBatches] = useState([]);

    // History Filters & Pagination State
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [historyDateFilter, setHistoryDateFilter] = useState('all');
    const [historyOperatorFilter, setHistoryOperatorFilter] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('');
    const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
    const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

    const navigate = useNavigate();

    useEffect(() => {
        fetchBatches();
        fetchOperators();
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        if (!auth.currentUser) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const secureDoc = await getDoc(doc(db, 'admin_secure_data', auth.currentUser.uid));
            const ud = userDoc.exists() ? userDoc.data() : {};
            const sd = secureDoc.exists() ? secureDoc.data() : {};

            let decryptedTin = '';
            if (sd.tin) {
                decryptedTin = await decryptPii(sd.tin);
            }

            setProfileData({
                companyName: ud.companyName || '',
                streetAddress: ud.streetAddress || '',
                city: ud.city || '',
                state: ud.state || '',
                zip: ud.zip || '',
                phone: ud.phone || '',
                tin: decryptedTin || sd.maskedTin || ''
            });
        } catch (err) {
            console.error("Error fetching admin profile data:", err);
        }
    };

    const fetchOperators = async () => {
        try {
            const q = query(collection(db, 'users'), where('role', '==', 'operator'));
            const snap = await getDocs(q);
            const opsMap = {};
            snap.docs.forEach(d => {
                const data = d.data();
                const fullName = (data.firstName || data.lastName) 
                    ? `${data.firstName || ''} ${data.lastName || ''}`.trim() 
                    : (data.name || 'Unknown Operator');
                opsMap[d.id] = {
                    id: d.id,
                    name: fullName,
                    status: data.status || 'active'
                };
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
        const op = operators[operatorId];
        const name = typeof op === 'object' ? op?.name : op;
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
                setSelectedBatch({ ...selectedBatch, status, reviewNotes: notes });
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
            setSelectedBatch({ ...selectedBatch, adjustments: updatedAdjustments });
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
            setSelectedBatch({ ...selectedBatch, adjustments: updatedAdjustments });
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
            const res = await addOperatorFn({
                firstName: newOpData.firstName.trim(),
                lastName: newOpData.lastName.trim(),
                email: newOpData.email.trim(),
                phone: newOpData.phone.trim(),
                password: newOpData.password
            });

            const uid = res.data?.uid;
            if (uid) {
                await updateDoc(doc(db, 'users', uid), {
                    ratePerBoot: Number(newOpData.ratePerBoot) || 10,
                    status: newOpData.status || 'active',
                    payoutsEnabled: true
                });

                if (newOpData.ssn && newOpData.ssn.trim()) {
                    const rawSsn = newOpData.ssn.trim();
                    if (!isValidSsnOrEin(rawSsn)) {
                        setAddOpError("Invalid 9-digit SSN or Tax ID format.");
                        setIsAddingOp(false);
                        return;
                    }
                    const encryptedSsn = await encryptPii(rawSsn);
                    const maskedSsn = maskPii(rawSsn);
                    const ssnLast4 = extractLast4(rawSsn);

                    await setDoc(doc(db, 'operator_secure_data', uid), {
                        ssn: encryptedSsn,
                        maskedSsn,
                        ssnLast4,
                        w9_submitted: true,
                        updatedAt: new Date()
                    });
                }
            }

            setShowAddOpModal(false);
            setNewOpData({
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                ratePerBoot: 10,
                password: '',
                status: 'active',
                ssn: ''
            });
            await fetchOperators();
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
        setPublished1099s({});
        try {
            const gen1099Fn = httpsCallable(functions, 'generate1099');
            const res = await gen1099Fn({ year: year1099 });

            const pubSnap = await getDocs(query(collection(db, 'published_1099s'), where('year', '==', Number(year1099))));
            const pubMap = {};
            pubSnap.forEach(d => { pubMap[d.data().operatorId] = true; });
            setPublished1099s(pubMap);

            if (res.data.payerInfo) {
                setPayerInfo(res.data.payerInfo);
            }

            setTaxResults(res.data.data);
        } catch (err) {
            alert("Error generating 1099s: " + err.message);
        } finally {
            setIsGenerating1099(false);
        }
    };

    const handlePublish1099 = async (operator) => {
        try {
            setPublishing1099Id(operator.operatorId);
            await setDoc(doc(db, 'published_1099s', `${operator.operatorId}_${year1099}`), {
                ...operator,
                year: Number(year1099),
                payerInfo: payerInfo || null,
                publishedAt: serverTimestamp()
            });
            setPublished1099s(prev => ({ ...prev, [operator.operatorId]: true }));
        } catch (err) {
            alert("Error publishing 1099: " + err.message);
        } finally {
            setPublishing1099Id(null);
        }
    };
    const handleDelete1099 = async (operator) => {
        if (!window.confirm(`Are you sure you want to delete and unpublish the 1099 for ${formatOperatorName(operator.operatorId)}?`)) return;
        try {
            await deleteDoc(doc(db, 'published_1099s', `${operator.operatorId}_${year1099}`));
            setPublished1099s(prev => {
                const next = { ...prev };
                delete next[operator.operatorId];
                return next;
            });
        } catch (err) {
            alert("Error deleting 1099: " + err.message);
        }
    };

    const handleDownload1099 = async (operator) => {
        try {
            setDownloading1099Id(operator.operatorId);
            const pdfData = {
                ...operator,
                year: year1099,
                payerInfo: payerInfo || null
            };
            const pdf = await generate1099PDF(pdfData, year1099);
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

    const handleDownloadPaystub = async (batchId) => {
        setIsDownloadingPaystub(true);
        try {
            const genPaystubFn = httpsCallable(functions, 'generatepaystub');
            const res = await genPaystubFn({ batchId });
            if (res.data.success) {
                const pdfData = await generatePaystubPDF(res.data.data);
                setPaystubPdfData({
                    ...pdfData,
                    rawData: res.data.data
                });
            } else {
                alert("Failed to fetch paystub data.");
            }
        } catch (err) {
            console.error(err);
            alert("Error generating paystub PDF: " + err.message);
        } finally {
            setIsDownloadingPaystub(false);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;

        if (profileData.tin && !isValidSsnOrEin(profileData.tin)) {
            alert("Please provide a valid 9-digit TIN or EIN (e.g. XX-XXXXXXX).");
            return;
        }

        setIsSavingProfile(true);
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                companyName: profileData.companyName,
                streetAddress: profileData.streetAddress,
                city: profileData.city,
                state: profileData.state,
                zip: profileData.zip,
                phone: profileData.phone
            });

            if (profileData.tin) {
                const encryptedTin = await encryptPii(profileData.tin);
                const maskedTin = maskPii(profileData.tin);

                await setDoc(doc(db, 'admin_secure_data', auth.currentUser.uid), {
                    tin: encryptedTin,
                    maskedTin,
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

        if (historyStatusFilter && historyStatusFilter !== 'all') {
            filtered = filtered.filter(b => b.status === historyStatusFilter);
        }

        if (historySearchTerm) {
            const lowerSearch = historySearchTerm.toLowerCase();
            filtered = filtered.filter(b => {
                const name = formatOperatorName(b.operatorId).toLowerCase();
                return name.includes(lowerSearch) || b.operatorId.toLowerCase().includes(lowerSearch);
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

    const pendingPayoutTotal = batches.filter(b => b.status === 'verified').reduce((sum, b) => sum + getNetPay(b), 0);
    const totalOpsList = Object.values(operators);
    const activeOpsCount = totalOpsList.filter(op => (typeof op === 'object' ? op.status !== 'inactive' : true)).length;
    const inactiveOpsCount = totalOpsList.filter(op => typeof op === 'object' && op.status === 'inactive').length;
    const pendingCount = batches.filter(b => b.status === 'pending').length;

    // Pagination calculations for Batch History
    const allFilteredHistory = getFilteredHistory();
    const totalHistoryCount = allFilteredHistory.length;
    const totalHistoryPages = Math.ceil(totalHistoryCount / historyItemsPerPage) || 1;
    const validHistoryCurrentPage = Math.min(Math.max(1, historyCurrentPage), totalHistoryPages);
    const historyStartIndex = (validHistoryCurrentPage - 1) * historyItemsPerPage;
    const historyEndIndex = Math.min(historyStartIndex + historyItemsPerPage, totalHistoryCount);
    const paginatedHistory = allFilteredHistory.slice(historyStartIndex, historyEndIndex);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <div>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Admin Dashboard</h1>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Manage batches, operators, and payroll.</p>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-secondary flex items-center gap-2" onClick={() => setShowSettingsModal(true)}>
                            <Settings size={16} /> Profile Settings
                        </button>
                        <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowAddOpModal(true)}>
                            <User size={16} /> Add Operator
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShow1099Modal(true)}>
                            Year-End Tax Forms
                        </button>
                        <button className="btn btn-secondary flex items-center gap-2" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Total Pending Payout */}
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '8px',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <FileText size={20} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Pending Payout</div>
                    <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>${pendingPayoutTotal.toFixed(2)}</div>
                </div>

                {/* Active Employees */}
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-paid)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Users size={20} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Active Operators</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{activeOpsCount}</span>
                        {inactiveOpsCount > 0 && (
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                ({inactiveOpsCount} inactive)
                            </span>
                        )}
                    </div>
                </div>

                {/* Pending Verification */}
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '8px',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-pending)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <MessageSquare size={20} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pending Review</div>
                    <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pendingCount}</div>
                </div>
            </div>

            <div className="glass-card mt-4">
                <h3>Pending Batches (Requires Review)</h3>
                {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
                    <div className="flex flex-col gap-2 mt-4">
                        {batches.filter(b => b.status === 'pending').length === 0 ? (
                            <p className="text-center" style={{ color: 'var(--text-secondary)' }}>No pending batches.</p>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 py-2 hidden-mobile" style={{ borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                                    <div style={{ flex: 2 }}>Operator</div>
                                    <div style={{ flex: 1 }}>Date</div>
                                    <div style={{ flex: 1 }}>Items</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Amount</div>
                                    <div style={{ flex: 1, textAlign: 'center' }}>Status</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Actions</div>
                                </div>
                                {/* Body */}
                                {batches.filter(b => b.status === 'pending').map(batch => (
                                    <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem' }}>
                                        <div data-label="Operator" style={{ flex: 2, minWidth: '150px', fontWeight: 600 }}>
                                            {formatOperatorName(batch.operatorId)}
                                        </div>
                                        <div data-label="Date" style={{ flex: 1, minWidth: '100px' }}>
                                            {batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'}
                                        </div>
                                        <div data-label="Items" style={{ flex: 1, minWidth: '80px' }}>
                                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>{batch.expectedItemCount} boots</span>
                                        </div>
                                        <div data-label="Amount" style={{ flex: 1, minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>
                                            ${getNetPay(batch).toFixed(2)}
                                        </div>
                                        <div data-label="Status" style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
                                            <span className="badge badge-pending">Pending</span>
                                        </div>
                                        <div data-label="Actions" style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => handleViewDocs(batch)}>Review</button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
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
                            style={{ backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                            disabled={selectedVerifiedBatches.length === 0}
                            onClick={handleOpenSelectedPayroll}
                        >
                            Pay Selected
                        </button>
                    </div>
                </div>
                {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
                    <div className="flex flex-col gap-2 mt-4">
                        {batches.filter(b => b.status === 'verified').length === 0 ? (
                            <p className="text-center" style={{ color: 'var(--text-secondary)' }}>No verified batches.</p>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 py-2 hidden-mobile" style={{ borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                                    <div style={{ width: '40px', flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            onChange={handleSelectAllVerified}
                                            checked={selectedVerifiedBatches.length > 0 && selectedVerifiedBatches.length === batches.filter(b => b.status === 'verified').length}
                                        />
                                    </div>
                                    <div style={{ flex: 2 }}>Operator</div>
                                    <div style={{ flex: 1 }}>Date</div>
                                    <div style={{ flex: 1 }}>Items</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Amount</div>
                                    <div style={{ flex: 1, textAlign: 'center' }}>Status</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Actions</div>
                                </div>
                                {/* Body */}
                                {batches.filter(b => b.status === 'verified').map(batch => (
                                    <div key={batch.id} className="glass-card flex justify-between items-center flex-stack-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem' }}>
                                        <div data-label="Select" style={{ width: '40px', flexShrink: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedVerifiedBatches.includes(batch.id)}
                                                onChange={() => toggleSelectVerifiedBatch(batch.id)}
                                            />
                                        </div>
                                        <div data-label="Operator" style={{ flex: 2, minWidth: '150px', fontWeight: 600 }}>
                                            {formatOperatorName(batch.operatorId)}
                                        </div>
                                        <div data-label="Date" style={{ flex: 1, minWidth: '100px' }}>
                                            {batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'}
                                        </div>
                                        <div data-label="Items" style={{ flex: 1, minWidth: '80px' }}>
                                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>{batch.expectedItemCount} boots</span>
                                        </div>
                                        <div data-label="Amount" style={{ flex: 1, minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>
                                            ${getNetPay(batch).toFixed(2)}
                                        </div>
                                        <div data-label="Status" style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
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
                                        </div>
                                        <div data-label="Actions" style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => updateBatchStatus(batch.id, 'pending')}>Hold (Undo)</button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="glass-card mt-8" style={{ padding: '1.75rem', borderRadius: 'var(--md-sys-shape-corner-extra-large)' }}>
                {/* M3 Section Title & Status Bar */}
                <div className="flex justify-between items-center mb-6 flex-responsive gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <SlidersHorizontal size={20} style={{ color: 'var(--md-sys-color-primary)' }} />
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Batch History</h3>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.84375rem', color: 'var(--md-sys-color-on-surface-variant)' }}>
                            Filter paid, processing, and rejected batches by status, timeframe, or operator name.
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
                    {/* Row 1: M3 Search Field & Rows Per Page Dropdown */}
                    <div className="flex gap-4 items-center mb-4 flex-wrap">
                        {/* M3 Search Field with leading Search Icon */}
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
                                placeholder="Search operator name or ID..."
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

                        {/* Rows Per Page */}
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

                    {/* Row 2: M3 Filter Chips */}
                    <div className="flex flex-col gap-3">
                        {/* Status Filter Chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>
                                Status:
                            </span>
                            {[
                                { id: 'all', label: 'All Statuses' },
                                { id: 'paid', label: 'Paid' },
                                { id: 'processing', label: 'Processing' },
                                { id: 'rejected', label: 'Rejected' }
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

                    {/* Clear All Filters Action Bar */}
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

                {loading ? <div className="mt-4"><div className="spinner"></div></div> : (
                    <div className="flex flex-col gap-2 mt-4">
                        {totalHistoryCount === 0 ? (
                            <p className="text-center" style={{ color: 'var(--text-secondary)' }}>No matching batches found.</p>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 py-2 hidden-mobile" style={{ borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                                    <div style={{ flex: 2 }}>Operator</div>
                                    <div style={{ flex: 1 }}>Date</div>
                                    <div style={{ flex: 1, textAlign: 'center' }}>Status</div>
                                    <div style={{ flex: 1, textAlign: 'right' }}>Payout</div>
                                    <div style={{ flex: 1, textAlign: 'center' }}>Documents</div>
                                </div>
                                {/* Body */}
                                {paginatedHistory.map(batch => (
                                    <React.Fragment key={batch.id}>
                                        {/* Desktop Row */}
                                        <div className="glass-card flex justify-between items-center hide-on-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem', marginBottom: '1rem' }}>
                                            <div style={{ flex: 2, minWidth: '150px', fontWeight: 600 }}>
                                                {formatOperatorName(batch.operatorId)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: '130px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{formatBatchDate(batch)}</span>
                                                    {batch.paidAt && (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--status-paid)', fontWeight: 600 }}>
                                                            Paid {getSafeDate(batch.paidAt) ? getSafeDate(batch.paidAt).toLocaleDateString() : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
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
                                            </div>
                                            <div style={{ flex: 1, minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>
                                                ${getNetPay(batch).toFixed(2)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: '120px', display: 'flex', justifyContent: 'center' }}>
                                                <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                                                    {(batch.status === 'paid' || batch.status === 'processing') && (
                                                        <button className="btn btn-secondary btn-icon" disabled={isDownloadingPaystub} onClick={() => handleDownloadPaystub(batch.id)} title="Download PDF Stub">
                                                            <Download size={18} />
                                                        </button>
                                                    )}
                                                    <button className="btn btn-secondary btn-icon" onClick={() => handleViewDocs(batch)} title="View Documents">
                                                        <Images size={18} />
                                                    </button>
                                                    <button className="btn btn-secondary btn-icon" style={{ color: 'var(--status-error)' }} title="Archive Batch" onClick={() => handleArchiveBatch(batch.id)}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Card */}
                                        <div className="glass-card mobile-only" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', marginBottom: '1rem' }}>
                                            <div className="flex justify-between items-start" style={{ marginBottom: '1rem' }}>
                                                <div className="flex items-start gap-2">
                                                    <User size={16} style={{ color: 'var(--text-secondary)', marginTop: '4px' }} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{formatOperatorName(batch.operatorId)}</div>
                                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                                            <Calendar size={12} /> {formatBatchDate(batch)}
                                                        </div>
                                                    </div>
                                                </div>
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
                                            </div>

                                            <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>${getNetPay(batch).toFixed(2)}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Payout Amount</div>
                                            </div>

                                            <div className="flex justify-center gap-3" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                                {(batch.status === 'paid' || batch.status === 'processing') && (
                                                    <button className="btn btn-secondary btn-icon" disabled={isDownloadingPaystub} onClick={() => handleDownloadPaystub(batch.id)} title="Download PDF Stub">
                                                        <Download size={18} />
                                                    </button>
                                                )}
                                                <button className="btn btn-secondary btn-icon" onClick={() => handleViewDocs(batch)} title="View Documents">
                                                    <Images size={18} />
                                                </button>
                                                <button className="btn btn-secondary btn-icon" style={{ color: 'var(--status-error)' }} title="Archive Batch" onClick={() => handleArchiveBatch(batch.id)}>
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                ))}

                                {/* Batch History Pagination Footer */}
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

            {/* Review Modal */}
            {selectedBatch && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <button className="modal-close" onClick={handleCloseModal}>X</button>
                        <h3 className="mb-4">Review Batch</h3>

                        <div className="flex gap-4 flex-responsive">
                            <div style={{ flex: 1 }}>
                                <h4 className="mb-2">Daily Summary Ticket</h4>
                                <img src={selectedBatch.batchTicketUrl} alt="Batch Ticket" style={{ width: '100%', borderRadius: '0.5rem' }} />
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
                                    <div className="flex justify-between items-center mb-3">
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Pay Adjustments</h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Add deductions, reimbursements, or bonuses to this batch before finalizing payroll.</p>
                                        </div>
                                        {selectedBatch.adjustments && selectedBatch.adjustments.length > 0 && (
                                            <span className="badge badge-verified" style={{ fontSize: '0.75rem' }}>
                                                {selectedBatch.adjustments.length} adjustment{selectedBatch.adjustments.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* List of Existing Adjustments */}
                                    {selectedBatch.adjustments?.length > 0 && (
                                        <div className="flex flex-col gap-2 mb-4">
                                            {selectedBatch.adjustments.map((adj, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3" style={{
                                                    backgroundColor: adj.type === 'deduction' ? 'rgba(220, 38, 38, 0.04)' : 'rgba(5, 150, 105, 0.04)',
                                                    border: `1px solid ${adj.type === 'deduction' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(5, 150, 105, 0.2)'}`,
                                                    borderRadius: 'var(--border-radius-md)'
                                                }}>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`badge ${adj.type === 'deduction' ? 'badge-rejected' : 'badge-paid'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                                                            {adj.type.toUpperCase()}
                                                        </span>
                                                        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{adj.description}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span style={{
                                                            fontWeight: 700,
                                                            fontSize: '0.9375rem',
                                                            color: adj.type === 'deduction' ? 'var(--status-error)' : 'var(--status-paid)'
                                                        }}>
                                                            {adj.type === 'deduction' ? '-' : '+'}${Number(adj.amount).toFixed(2)}
                                                        </span>
                                                        {(selectedBatch.status === 'pending' || selectedBatch.status === 'verified') && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveAdjustment(idx)}
                                                                title="Remove adjustment"
                                                                style={{
                                                                    color: 'var(--status-error)',
                                                                    cursor: 'pointer',
                                                                    background: 'rgba(220, 38, 38, 0.1)',
                                                                    border: 'none',
                                                                    borderRadius: '50%',
                                                                    width: '24px',
                                                                    height: '24px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    transition: 'background 0.15s'
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Form to Add New Adjustment */}
                                    {(selectedBatch.status === 'pending' || selectedBatch.status === 'verified') && (
                                        <div style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: 'var(--border-radius-md)',
                                            padding: '1rem'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                                                Add New Adjustment
                                            </div>
                                            <form onSubmit={handleAddAdjustment} className="flex flex-col gap-3">
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                                                    gap: '0.75rem',
                                                    alignItems: 'end'
                                                }}>
                                                    {/* 1. Type Dropdown */}
                                                    <div style={{ minWidth: '130px' }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Type</label>
                                                        <select
                                                            className="form-input"
                                                            style={{
                                                                height: 'var(--control-height)',
                                                                fontWeight: 500,
                                                                cursor: 'pointer',
                                                                backgroundColor: 'var(--bg-secondary)',
                                                                width: '100%'
                                                            }}
                                                            value={adjType}
                                                            onChange={e => setAdjType(e.target.value)}
                                                        >
                                                            <option value="deduction">Deduction (-)</option>
                                                            <option value="reimbursement">Reimbursement (+)</option>
                                                            <option value="bonus">Bonus (+)</option>
                                                        </select>
                                                    </div>

                                                    {/* 2. Description Input */}
                                                    <div style={{ gridColumn: 'span 2', minWidth: '180px' }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Description</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="e.g. Boot repair fee, Fuel reimbursement..."
                                                            required
                                                            value={adjDesc}
                                                            onChange={e => setAdjDesc(e.target.value)}
                                                            style={{ height: 'var(--control-height)', backgroundColor: 'var(--bg-secondary)', width: '100%' }}
                                                        />
                                                    </div>

                                                    {/* 3. Amount Field with $ Prefix */}
                                                    <div style={{ minWidth: '120px' }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Amount</label>
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <span style={{
                                                                position: 'absolute',
                                                                left: '0.75rem',
                                                                color: 'var(--text-secondary)',
                                                                fontWeight: 600,
                                                                fontSize: '0.875rem',
                                                                pointerEvents: 'none'
                                                            }}>$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0.01"
                                                                className="form-input"
                                                                placeholder="0.00"
                                                                required
                                                                value={adjAmount}
                                                                onChange={e => setAdjAmount(e.target.value)}
                                                                style={{
                                                                    height: 'var(--control-height)',
                                                                    paddingLeft: '1.75rem',
                                                                    backgroundColor: 'var(--bg-secondary)',
                                                                    fontWeight: 600,
                                                                    width: '100%'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. Full-Width Add Adjustment Submit Button */}
                                                <button
                                                    type="submit"
                                                    className="btn btn-primary"
                                                    style={{
                                                        height: 'var(--control-height)',
                                                        width: '100%',
                                                        justifyContent: 'center',
                                                        fontWeight: 600,
                                                        marginTop: '0.25rem'
                                                    }}
                                                >
                                                    <Plus size={16} /> Add Adjustment
                                                </button>
                                            </form>
                                        </div>
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
                                        <button className="btn btn-secondary" style={{ color: 'var(--status-error)', borderColor: 'var(--status-error)' }} onClick={() => updateBatchStatus(selectedBatch.id, 'rejected', reviewNotes)}>
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

            {showSettingsModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card" style={{ maxWidth: '600px' }}>
                        <button className="modal-close" onClick={() => setShowSettingsModal(false)}>X</button>
                        <h3 className="mb-4">Profile Settings</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            Update your company address and TIN/EIN. This information will appear as the Payer on the operators' 1099 forms.
                        </p>
                        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                            <div className="form-group">
                                <label>Company Name</label>
                                <input
                                    type="text"
                                    value={profileData.companyName}
                                    onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                                    className="form-input"
                                    placeholder="Austin Parking Company"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Street Address</label>
                                <input
                                    type="text"
                                    value={profileData.streetAddress}
                                    onChange={(e) => setProfileData({ ...profileData, streetAddress: e.target.value })}
                                    className="form-input"
                                    placeholder="123 Main St"
                                    required
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group" style={{ flex: 2 }}>
                                    <label>City</label>
                                    <input
                                        type="text"
                                        value={profileData.city}
                                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
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
                                        onChange={(e) => setProfileData({ ...profileData, state: e.target.value })}
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
                                        onChange={(e) => setProfileData({ ...profileData, zip: e.target.value })}
                                        className="form-input"
                                        placeholder="78701"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Phone Number</label>
                                    <input
                                        type="text"
                                        value={profileData.phone}
                                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                                        className="form-input"
                                        placeholder="(737) 300-9585"
                                        required
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <PiiInput
                                        label="TIN or EIN"
                                        value={profileData.tin}
                                        onChange={(val) => setProfileData({ ...profileData, tin: val })}
                                        placeholder="XX-XXXXXXX"
                                        required
                                        helperText="Stored securely with field-level encryption. Used for payer identification."
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={isSavingProfile}>
                                {isSavingProfile ? 'Saving...' : 'Save Profile'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Operator Modal */}
            {showAddOpModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card" style={{ maxWidth: '550px' }}>
                        <button className="modal-close" onClick={() => setShowAddOpModal(false)}>X</button>
                        <h3 className="mb-4">Add Boot Operator</h3>
                        {addOpError && (
                            <div style={{ color: 'var(--status-error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                {addOpError}
                            </div>
                        )}
                        <form onSubmit={handleAddOperator}>
                            <div className="flex gap-4 flex-responsive">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">First Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        required
                                        value={newOpData.firstName}
                                        onChange={e => setNewOpData({ ...newOpData, firstName: e.target.value })}
                                        placeholder="John"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Last Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        required
                                        value={newOpData.lastName}
                                        onChange={e => setNewOpData({ ...newOpData, lastName: e.target.value })}
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Email Address *</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    required
                                    value={newOpData.email}
                                    onChange={e => setNewOpData({ ...newOpData, email: e.target.value })}
                                    placeholder="john.doe@example.com"
                                />
                            </div>

                            <div className="flex gap-4 flex-responsive">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Phone Number *</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        required
                                        value={newOpData.phone}
                                        onChange={e => setNewOpData({ ...newOpData, phone: e.target.value })}
                                        placeholder="(512) 555-0199"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Rate Per Boot ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="form-input"
                                        required
                                        value={newOpData.ratePerBoot}
                                        onChange={e => setNewOpData({ ...newOpData, ratePerBoot: e.target.value })}
                                        placeholder="10.00"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 flex-responsive">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Account Password *</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        required
                                        minLength={6}
                                        value={newOpData.password}
                                        onChange={e => setNewOpData({ ...newOpData, password: e.target.value })}
                                        placeholder="Min. 6 characters"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Status</label>
                                    <select
                                        className="form-input"
                                        value={newOpData.status}
                                        onChange={e => setNewOpData({ ...newOpData, status: e.target.value })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>

                            <PiiInput
                                label="SSN / Tax ID"
                                value={newOpData.ssn}
                                onChange={(val) => setNewOpData({ ...newOpData, ssn: val })}
                                placeholder="XXX-XX-XXXX"
                                helperText="Optional for 1099. Stored with field-level encryption."
                            />

                            <div className="flex justify-end gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddOpModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isAddingOp}>
                                    {isAddingOp ? 'Adding...' : 'Create Operator'}
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
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{op.batchIds.length} batches to process</div>
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--status-paid)' }}>${op.total.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowPayrollModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ backgroundColor: 'var(--status-paid)', borderColor: 'var(--status-paid)' }} onClick={handleRunPayroll} disabled={isProcessingPayroll || payrollSummary.length === 0}>
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
                                <h4 style={{ marginBottom: '0.5rem' }}>Results for {year1099}</h4>
                                <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Found {taxResults.length} operators with $600+ YTD earnings.</p>

                                <div className="flex flex-col gap-2">
                                    {taxResults.map(r => (
                                        <div key={r.operatorId} className="glass-card" style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                            <div className="flex justify-between items-center" style={{ fontWeight: 600 }}>
                                                <div>
                                                    <span>{r.name}</span>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                                                        {r.email}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span style={{ color: 'var(--status-paid)' }}>${r.ytdTotal.toFixed(2)}</span>
                                                    <button
                                                        className="btn btn-secondary flex items-center gap-2"
                                                        onClick={() => handleDownload1099(r)}
                                                        disabled={downloading1099Id === r.operatorId}
                                                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                                                        title="Download PDF"
                                                    >
                                                        <Download size={14} />
                                                        {downloading1099Id === r.operatorId ? 'Generating...' : '1099-NEC'}
                                                    </button>
                                                    {published1099s[r.operatorId] ? (
                                                        <>
                                                            <button
                                                                className="btn btn-secondary flex items-center gap-2"
                                                                disabled
                                                                style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', opacity: 0.7 }}
                                                                title="Already Published"
                                                            >
                                                                <Send size={14} /> Published
                                                            </button>
                                                            <button
                                                                className="btn flex items-center gap-2"
                                                                onClick={() => handleDelete1099(r)}
                                                                style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', backgroundColor: 'var(--status-rejected)', border: 'none' }}
                                                                title="Delete / Unpublish 1099 from Operator Dashboard"
                                                            >
                                                                <Trash2 size={14} /> Delete
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            className="btn btn-primary flex items-center gap-2"
                                                            onClick={() => handlePublish1099(r)}
                                                            disabled={publishing1099Id === r.operatorId}
                                                            style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                                                            title="Publish to Operator Dashboard"
                                                        >
                                                            <Send size={14} /> {publishing1099Id === r.operatorId ? 'Publishing...' : 'Publish'}
                                                        </button>
                                                    )}
                                                </div>
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
                <PaystubPreviewModal
                    pdfData={paystubPdfData}
                    onClose={() => setPaystubPdfData(null)}
                />
            )}
        </div>
    );
}
