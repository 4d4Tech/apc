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
import OperatorRates from './pages/OperatorRates';
import Onboarding from './pages/Onboarding';

// Protected Route Wrapper
const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) return <div className="container mt-8"><div className="spinner"></div></div>;

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && userData?.role !== requiredRole) {
    // Redirect based on actual role if they try to access the wrong portal
    return <Navigate to={userData?.role === 'admin' ? '/admin' : '/operator'} />;
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
          <Route path="/admin/rates" element={
            <ProtectedRoute requiredRole="admin">
              <OperatorRates />
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
