import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth, useAuth } from '@/context/AuthContext'
import { ClusterProvider } from '@/context/ClusterContext'
import { AppShell } from '@/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { ConnectPage } from '@/pages/ConnectPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { NamespacesPage } from '@/pages/NamespacesPage'
import { PodsPage } from '@/pages/PodsPage'
import { DeploymentsPage } from '@/pages/DeploymentsPage'
import { ReplicaSetsPage } from '@/pages/ReplicaSetsPage'
import { StatefulSetsPage } from '@/pages/StatefulSetsPage'
import { ServicesPage } from '@/pages/ServicesPage'
import { IngressesPage } from '@/pages/IngressesPage'
import { ConfigMapsPage } from '@/pages/ConfigMapsPage'
import { SecretsPage } from '@/pages/SecretsPage'
import { PersistentVolumesPage } from '@/pages/PersistentVolumesPage'
import { PersistentVolumeClaimsPage } from '@/pages/PersistentVolumeClaimsPage'
import { StorageClassesPage } from '@/pages/StorageClassesPage'
import { NodesPage } from '@/pages/NodesPage'
import { loadConnection } from '@/lib/connection-storage'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 bg-tri-grid">
        <p className="font-mono text-sm text-ink-500">Проверка сессии…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (user.provider === 'dex') {
    return <Navigate to="/cluster" replace />
  }
  return <Navigate to={loadConnection() ? '/cluster' : '/connect'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClusterProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/connect"
              element={
                <RequireAuth>
                  <ConnectPage />
                </RequireAuth>
              }
            />

            <Route
              path="/cluster"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="namespaces" element={<NamespacesPage />} />
              <Route path="nodes" element={<NodesPage />} />
              <Route path="pods" element={<PodsPage />} />
              <Route path="deployments" element={<DeploymentsPage />} />
              <Route path="replicasets" element={<ReplicaSetsPage />} />
              <Route path="statefulsets" element={<StatefulSetsPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="ingresses" element={<IngressesPage />} />
              <Route path="configmaps" element={<ConfigMapsPage />} />
              <Route path="secrets" element={<SecretsPage />} />
              <Route path="persistentvolumes" element={<PersistentVolumesPage />} />
              <Route path="persistentvolumeclaims" element={<PersistentVolumeClaimsPage />} />
              <Route path="storageclasses" element={<StorageClassesPage />} />
            </Route>

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </ClusterProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
