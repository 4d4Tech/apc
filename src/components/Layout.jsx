import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  LogOut, 
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

export default function Layout({ children }) {
  const { userData, userClaims } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = (userClaims && userClaims.admin) || (userData && userData.role === 'admin');
  
  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = isAdmin ? [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Employees', path: '/admin/operators', icon: Users }
  ] : [
    { name: 'Dashboard', path: '/operator', icon: LayoutDashboard },
    { name: 'New Batch', path: '/operator/new-batch', icon: FileText }
  ];

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      
      {/* Mobile Header (Visible only on small screens) */}
      <div className="mobile-header" style={{ display: 'none', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>APC Payroll</div>
          <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} style={{
        width: '260px',
        backgroundColor: 'var(--sidebar-bg)',
        color: 'var(--sidebar-text)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.3s ease'
      }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--accent-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                    <FileText size={18} />
                </div>
                Payroll
            </h1>
        </div>

        <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--sidebar-text-muted)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Menu</div>
          
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: isActive ? 'var(--sidebar-hover)' : 'transparent',
                  color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '1rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
              >
                <item.icon size={20} />
                {item.name}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '1.5rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--sidebar-text-muted)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Account</div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
                <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
                    {userData?.firstName ? userData.firstName[0] : (userData?.role === 'admin' ? 'A' : 'O')}
                </div>
                <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {userData?.firstName ? `${userData.firstName} ${userData.lastName}` : (userData?.role === 'admin' ? 'Administrator' : 'Operator')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sidebar-text-muted)' }}>
                        {userData?.email || auth.currentUser?.email}
                    </div>
                </div>
            </div>

            <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: 'transparent',
                  color: 'var(--sidebar-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '1rem',
                  fontWeight: 500,
                  width: '100%',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--sidebar-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
                <LogOut size={20} />
                Logout
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
        <header style={{ 
            backgroundColor: 'var(--bg-secondary)', 
            padding: '1.5rem 2rem', 
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 10
        }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
                {location.pathname === '/admin' && 'Dashboard'}
                {location.pathname === '/admin/operators' && 'Employees'}
                {location.pathname === '/operator' && 'Dashboard'}
                {location.pathname === '/operator/new-batch' && 'New Batch'}
                {location.pathname.includes('/operator/batch/') && 'Batch Details'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Austin Parking Company</span>
                <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                    {isAdmin ? 'APC' : `${userData?.firstName?.[0] || ''}${userData?.lastName?.[0] || ''}`}
                </div>
            </div>
        </header>

        <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
            {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
            .app-layout {
                flex-direction: column !important;
            }
            .mobile-header {
                display: flex !important;
            }
            .sidebar {
                position: fixed !important;
                top: 64px;
                left: 0;
                bottom: 0;
                z-index: 50;
                transform: translateX(-100%);
            }
            .sidebar.open {
                transform: translateX(0);
            }
            main > header {
                display: none !important;
            }
        }
      `}</style>
    </div>
  );
}
