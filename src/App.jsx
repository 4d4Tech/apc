import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import './index.css';

import Login from './pages/Login';
import Signup from './pages/Signup';
import OperatorDashboard from './pages/OperatorDashboard';
import NewBatch from './pages/NewBatch';
import BatchDetails from './pages/BatchDetails';
import AdminDashboard from './pages/AdminDashboard';
import OperatorManagement from './pages/OperatorManagement';
import Onboarding from './pages/Onboarding';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, userClaims, userData, loading } = useAuth();

  if (loading) return <div className="container mt-8"><div className="spinner"></div></div>;

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (requiredRole === 'operator' && userData?.status === 'inactive') {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '0.5rem' }}>Account Deactivated</h2>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Your operator account has been deactivated. Please contact your administrator.</p>
        <button className="btn btn-primary" onClick={() => signOut(auth)}>Sign Out</button>
      </div>
    );
  }

  // Check claims or fallback to firestore role
  const hasRole = (userClaims && userClaims[requiredRole]) || (userData && userData.role === requiredRole);
  
  if (requiredRole && !hasRole) {
    // Redirect based on actual role if they try to access the wrong portal
    const actualRole = (userClaims && userClaims.admin) ? 'admin' : (userData?.role === 'admin' ? 'admin' : 'operator');
    return <Navigate to={actualRole === 'admin' ? '/admin' : '/operator'} />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          {/* Operator Routes */}
          <Route path="/onboarding" element={
            <ProtectedRoute requiredRole="operator">
              <Onboarding />
            </ProtectedRoute>
          } />
          <Route path="/operator" element={
            <ProtectedRoute requiredRole="operator">
              <Layout><OperatorDashboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/operator/new-batch" element={
            <ProtectedRoute requiredRole="operator">
              <Layout><NewBatch /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/operator/batch/:batchId" element={
            <ProtectedRoute requiredRole="operator">
              <Layout><BatchDetails /></Layout>
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <Layout><AdminDashboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/operators" element={
            <ProtectedRoute requiredRole="admin">
              <Layout><OperatorManagement /></Layout>
            </ProtectedRoute>
          } />

          {/* Default Route */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
