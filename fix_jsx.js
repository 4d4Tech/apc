const fs = require('fs');
const path = '/Users/brandonrobinson/Desktop/APC/src/pages/AdminDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `                           {getFilteredHistory().map(batch => (
                               <React.Fragment key={batch.id}>
                                   {/* Desktop Row */}
                                   <div className="glass-card flex justify-between items-center hide-on-mobile" style={{ padding: '1rem', boxShadow: 'none', backgroundColor: 'var(--bg-primary)', gap: '1rem', marginBottom: '1rem' }}>
                                       <div style={{ flex: 2, minWidth: '150px', fontWeight: 600 }}>
                                           {formatOperatorName(batch.operatorId)}
                                       </div>
                                       <div style={{ flex: 1, minWidth: '100px' }}>
                                           {batch.paidAt ? (
                                               <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                   <span>{getSafeDate(batch.paidAt).toLocaleDateString()}</span>
                                                   <span style={{ fontSize: '0.75rem', color: 'var(--status-paid)' }}>Paid</span>
                                               </div>
                                           ) : (
                                               batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A'
                                           )}
                                       </div>
                                       <div style={{ flex: 1, minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
                                           <div className="flex items-center gap-2">
                                               <span className={\`badge badge-\${batch.status}\`}>
                                                   {batch.status}
                                               </span>
                                               {batch.reviewNotes && (
                                                   <MessageSquare 
                                                       size={16} 
                                                       style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                       title={batch.reviewNotes}
                                                       onClick={() => alert(\`Review Note:\\n\\n\${batch.reviewNotes}\`)}
                                                   />
                                               )}
                                           </div>
                                       </div>
                                       <div style={{ flex: 1, minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>
                                           \${getNetPay(batch).toFixed(2)}
                                       </div>
                                       <div style={{ flex: 1, minWidth: '120px', display: 'flex', justifyContent: 'center' }}>
                                           <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                                               {(batch.status === 'paid' || batch.status === 'processing') && (
                                                   <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem' }} disabled={isDownloadingPaystub} onClick={() => handleDownloadPaystub(batch.id)} title="Download PDF Stub">
                                                       <Download size={18} />
                                                   </button>
                                               )}
                                               <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem' }} onClick={() => handleViewDocs(batch)} title="View Documents">
                                                   <Images size={18} />
                                               </button>
                                               <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.5rem', fontSize: '0.875rem', color: 'var(--status-error)' }} title="Archive Batch" onClick={() => handleArchiveBatch(batch.id)}>
                                                   <Trash2 size={16} />
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
                                                       <Calendar size={12} /> {batch.paidAt ? getSafeDate(batch.paidAt).toLocaleDateString() : (batch.date ? getSafeDate(batch.date).toLocaleDateString() : 'N/A')}
                                                   </div>
                                               </div>
                                           </div>
                                           <div className="flex items-center gap-2">
                                               <span className={\`badge badge-\${batch.status}\`}>
                                                   {batch.status}
                                               </span>
                                               {batch.reviewNotes && (
                                                   <MessageSquare 
                                                       size={16} 
                                                       style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}
                                                       title={batch.reviewNotes}
                                                       onClick={() => alert(\`Review Note:\\n\\n\${batch.reviewNotes}\`)}
                                                   />
                                               )}
                                           </div>
                                       </div>
                                       
                                       <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                                           <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>\${getNetPay(batch).toFixed(2)}</div>
                                           <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Payout Amount</div>
                                       </div>
                                       
                                       <div className="flex justify-center gap-4" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                           {(batch.status === 'paid' || batch.status === 'processing') && (
                                               <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.75rem' }} disabled={isDownloadingPaystub} onClick={() => handleDownloadPaystub(batch.id)} title="Download PDF Stub">
                                                   <Download size={18} />
                                               </button>
                                           )}
                                           <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.75rem' }} onClick={() => handleViewDocs(batch)} title="View Documents">
                                               <Images size={18} />
                                           </button>
                                           <button className="btn btn-secondary icon-btn-mobile" style={{ padding: '0.75rem', color: 'var(--status-error)' }} title="Archive Batch" onClick={() => handleArchiveBatch(batch.id)}>
                                               <Trash2 size={18} />
                                           </button>
                                       </div>
                                   </div>
                               </React.Fragment>
                           ))}`;

const lines = content.split('\n');
lines.splice(594, 124, replacement);
fs.writeFileSync(path, lines.join('\n'));
