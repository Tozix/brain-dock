import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/shell';
import { RequireAdmin, RequireAuth } from './lib/auth';
import { AdminAudit } from './pages/admin/audit';
import { AdminUsage } from './pages/admin/usage';
import { AdminUsers } from './pages/admin/users';
import { ConnectPage } from './pages/connect';
import { KeysPage } from './pages/keys';
import { LoginPage } from './pages/login';
import { ProjectPage } from './pages/project';
import { ProjectsPage } from './pages/projects';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="keys" element={<KeysPage />} />
        <Route path="connect" element={<ConnectPage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/audit"
          element={
            <RequireAdmin>
              <AdminAudit />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/usage"
          element={
            <RequireAdmin>
              <AdminUsage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
