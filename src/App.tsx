import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ClusterProvider } from '@/context/ClusterContext'
import { AppShell } from '@/components/AppShell'
import { ConnectPage } from '@/pages/ConnectPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { NamespacesPage } from '@/pages/NamespacesPage'
import { PodsPage } from '@/pages/PodsPage'
import { DeploymentsPage } from '@/pages/DeploymentsPage'
import { StatefulSetsPage } from '@/pages/StatefulSetsPage'
import { ServicesPage } from '@/pages/ServicesPage'
import { NodesPage } from '@/pages/NodesPage'
import { loadConnection } from '@/lib/connection-storage'

function RootRedirect() {
  return <Navigate to={loadConnection() ? '/cluster' : '/connect'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ClusterProvider>
        <Routes>
          <Route path="/connect" element={<ConnectPage />} />

          <Route path="/cluster" element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="namespaces" element={<NamespacesPage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="pods" element={<PodsPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="statefulsets" element={<StatefulSetsPage />} />
            <Route path="services" element={<ServicesPage />} />
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </ClusterProvider>
    </BrowserRouter>
  )
}
