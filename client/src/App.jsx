import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Login from "./pages/Login.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import EmployeePortal from "./pages/EmployeePortal.jsx";
import ModulePage from "./pages/ModulePage.jsx";
import Shell from "./components/Shell.jsx";
import { ToastProvider } from "./components/ToastHost.jsx";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const OperationsPage = lazy(() => import("./pages/OperationsPage.jsx"));

function PageLoading() {
  return <div className="loading-screen"><span className="spinner-border text-primary" /><span>Loading your insights…</span></div>;
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "employee") return <Navigate to="/employee" replace />;
  return <Shell />;
}

function EmployeeLayout() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/employee-login" replace />;
  if (user.role !== "employee") return <Navigate to="/" replace />;
  return <EmployeePortal />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/employee-login" element={user ? <Navigate to={user.role === "employee" ? "/employee" : "/" } replace /> : <Login portal="employee" />} />
        <Route path="/forgot-password" element={user ? <Navigate to={user.role === "employee" ? "/employee" : "/" } replace /> : <ForgotPassword />} />
        <Route path="/reset-password" element={user ? <Navigate to={user.role === "employee" ? "/employee" : "/" } replace /> : <ResetPassword />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<Suspense fallback={<PageLoading />}><Dashboard /></Suspense>} />
          <Route path="employees" element={<ModulePage moduleKey="employees" />} />
          <Route path="attendance" element={<ModulePage moduleKey="attendance" />} />
          <Route path="leave" element={<ModulePage moduleKey="leave" />} />
          <Route path="payroll" element={<ModulePage moduleKey="payroll" />} />
          <Route path="recruitment" element={<ModulePage moduleKey="recruitment" />} />
          <Route path="performance" element={<ModulePage moduleKey="performance" />} />
          <Route path="operations" element={<Suspense fallback={<PageLoading />}><OperationsPage /></Suspense>} />
        </Route>
        <Route path="/employee" element={<EmployeeLayout />} />
        <Route path="*" element={<Navigate to={user?.role === "employee" ? "/employee" : user ? "/" : "/login"} replace />} />
      </Routes>
    </ToastProvider>
  );
}
