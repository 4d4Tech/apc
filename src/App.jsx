import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import './index.css';

import Login from './pages/Login';
import Signup from './pages/Signup';
import OperatorDashboard from './pages/OperatorDashboard';
import NewBatch from './pages/NewBatch';
import BatchDetails from './pages/BatchDetails';
import AdminDashboard from './pages/AdminDashboard';
import OperatorManagement from './pages/OperatorManagement';
import Onboarding from './pages/Onboarding';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, userClaims, userData, loading } = useAuth();

  if (loading) return <div className="container mt-8"><div className="spinner"></div></div>;

  if (!currentUser) {
    return <Navigate to="/login" />;
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
              <OperatorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/operator/new-batch" element={
            <ProtectedRoute requiredRole="operator">
              <NewBatch />
            </ProtectedRoute>
          } />
          <Route path="/operator/batch/:batchId" element={
            <ProtectedRoute requiredRole="operator">
              <BatchDetails />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/operators" element={
            <ProtectedRoute requiredRole="admin">
              <OperatorManagement />
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
