import React, { useState } from 'react';
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
      
      {/* Mobile Top App Bar (Material Standard 56px/64px height) */}
      <div 
        className="mobile-header" 
        style={{ 
          display: 'none', 
          height: '60px',
          padding: '0 1rem', 
          backgroundColor: 'var(--sidebar-bg)', 
          color: '#ffffff',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 90,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: 'var(--accent-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            <FileText size={18} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.01em' }}>APC Payroll</span>
        </div>

        <button 
          className="btn-icon" 
          style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', border: 'none' }} 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div 
          className="mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 95
          }}
        />
      )}

      {/* Sidebar Navigation Drawer */}
      <aside 
        className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} 
        style={{
          width: '260px',
          backgroundColor: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 100
        }}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ffffff' }}>
            <div style={{ width: '36px', height: '36px', backgroundColor: 'var(--accent-primary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
              <FileText size={20} />
            </div>
            Payroll
          </h1>
        </div>

        <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--sidebar-text-muted)', marginBottom: '0.5rem', letterSpacing: '0.05em', fontWeight: 600 }}>Menu</div>
          
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
                  gap: '0.875rem',
                  height: '44px',
                  padding: '0 1rem',
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: isActive ? 'var(--sidebar-hover)' : 'transparent',
                  color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
              >
                <item.icon size={20} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '1.25rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--sidebar-text-muted)', marginBottom: '0.75rem', letterSpacing: '0.05em', fontWeight: 600 }}>Account</div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
            <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', flexShrink: 0 }}>
              {userData?.firstName ? userData.firstName[0] : (userData?.role === 'admin' ? 'A' : 'O')}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '0.875rem' }}>
                {userData?.firstName ? `${userData.firstName} ${userData.lastName}` : (userData?.role === 'admin' ? 'Administrator' : 'Operator')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--sidebar-text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
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
              height: '44px',
              padding: '0 1rem',
              borderRadius: 'var(--border-radius-md)',
              backgroundColor: 'transparent',
              color: 'var(--sidebar-text-muted)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '0.9375rem',
              fontWeight: 500,
              width: '100%',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--sidebar-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'hidden', minWidth: 0 }}>
        <header style={{ 
          backgroundColor: 'var(--bg-secondary)', 
          padding: '1.25rem 2rem', 
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Austin Parking Company</span>
            <div style={{ width: '36px', height: '36px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              {isAdmin ? 'APC' : `${userData?.firstName?.[0] || ''}${userData?.lastName?.[0] || ''}`}
            </div>
          </div>
        </header>

        <div className="layout-content" style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
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
            top: 0;
            left: 0;
            bottom: 0;
            transform: translateX(-100%);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          }
          .sidebar.open {
            transform: translateX(0);
          }
          main > header {
            display: none !important;
          }
          .layout-content {
            padding: 1rem !important; /* 16px Material mobile margin */
          }
        }
      `}</style>
    </div>
  );
}
