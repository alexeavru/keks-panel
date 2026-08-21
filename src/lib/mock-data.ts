import type {
  ClusterSnapshot,
  Deployment,
  Namespace,
  Node,
  Pod,
  Service,
  StatefulSet,
} from '@/types/k8s'

const now = Date.now()
const ago = (hours: number) => new Date(now - hours * 3600_000).toISOString()

const namespaces: Namespace[] = [
  {
    kind: 'Namespace',
    metadata: { name: 'default', uid: 'ns-default', creationTimestamp: ago(720) },
    status: { phase: 'Active' },
  },
  {
    kind: 'Namespace',
    metadata: { name: 'kube-system', uid: 'ns-kube-system', creationTimestamp: ago(720) },
    status: { phase: 'Active' },
  },
  {
    kind: 'Namespace',
    metadata: { name: 'keks', uid: 'ns-keks', creationTimestamp: ago(48) },
    status: { phase: 'Active' },
  },
  {
    kind: 'Namespace',
    metadata: { name: 'monitoring', uid: 'ns-monitoring', creationTimestamp: ago(120) },
    status: { phase: 'Active' },
  },
]

const pods: Pod[] = [
  {
    kind: 'Pod',
    metadata: {
      name: 'api-gateway-7d9f8c4b6-xk2m1',
      namespace: 'keks',
      uid: 'pod-1',
      creationTimestamp: ago(6),
      labels: { app: 'api-gateway', 'pod-template-hash': '7d9f8c4b6' },
    },
    spec: {
      nodeName: 'worker-01',
      containers: [{ name: 'gateway', image: 'ghcr.io/keks/api-gateway:1.4.2' }],
    },
    status: {
      phase: 'Running',
      podIP: '10.244.1.18',
      ready: true,
      readyCount: 1,
      containerCount: 1,
      restarts: 0,
      cpuUsage: '24m',
      cpuRequest: '100m',
      cpuLimit: '200m',
      memoryUsage: '48Mi',
      memoryRequest: '128Mi',
      memoryLimit: '256Mi',
    },
  },
  {
    kind: 'Pod',
    metadata: {
      name: 'api-gateway-7d9f8c4b6-p9qw3',
      namespace: 'keks',
      uid: 'pod-2',
      creationTimestamp: ago(6),
      labels: { app: 'api-gateway', 'pod-template-hash': '7d9f8c4b6' },
    },
    spec: {
      nodeName: 'worker-02',
      containers: [{ name: 'gateway', image: 'ghcr.io/keks/api-gateway:1.4.2' }],
    },
    status: { phase: 'Running', podIP: '10.244.2.41', ready: true, readyCount: 1, containerCount: 1, restarts: 1 },
  },
  {
    kind: 'Pod',
    metadata: {
      name: 'worker-5c6b7d8f9-n4t2s',
      namespace: 'keks',
      uid: 'pod-3',
      creationTimestamp: ago(3),
      labels: { app: 'worker' },
    },
    spec: {
      nodeName: 'worker-01',
      containers: [{ name: 'worker', image: 'ghcr.io/keks/worker:0.9.1' }],
    },
    status: { phase: 'Pending', ready: false, readyCount: 0, containerCount: 1, restarts: 0 },
  },
  {
    kind: 'Pod',
    metadata: {
      name: 'postgres-0',
      namespace: 'keks',
      uid: 'pod-4',
      creationTimestamp: ago(72),
      labels: { app: 'postgres', 'statefulset.kubernetes.io/pod-name': 'postgres-0' },
    },
    spec: {
      nodeName: 'worker-02',
      containers: [{ name: 'postgres', image: 'postgres:16-alpine' }],
    },
    status: {
      phase: 'Running',
      podIP: '10.244.2.7',
      ready: true,
      readyCount: 1,
      containerCount: 1,
      restarts: 0,
      cpuUsage: '8m',
      cpuRequest: '50m',
      memoryUsage: '96Mi',
      memoryRequest: '256Mi',
      memoryLimit: '512Mi',
    },
  },
  {
    kind: 'Pod',
    metadata: {
      name: 'coredns-76f75bb579-abc12',
      namespace: 'kube-system',
      uid: 'pod-5',
      creationTimestamp: ago(700),
      labels: { 'k8s-app': 'kube-dns' },
    },
    spec: {
      nodeName: 'control-plane',
      containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.11.1' }],
    },
    status: {
      phase: 'Running',
      podIP: '10.244.0.5',
      ready: true,
      readyCount: 1,
      containerCount: 1,
      restarts: 0,
      cpuUsage: '12m',
      cpuRequest: '100m',
      cpuLimit: '100m',
      memoryUsage: '22Mi',
      memoryRequest: '70Mi',
      memoryLimit: '170Mi',
    },
  },
  {
    kind: 'Pod',
    metadata: {
      name: 'prometheus-0',
      namespace: 'monitoring',
      uid: 'pod-6',
      creationTimestamp: ago(40),
      labels: { app: 'prometheus' },
    },
    spec: {
      nodeName: 'worker-01',
      containers: [{ name: 'prometheus', image: 'prom/prometheus:v2.54.0' }],
    },
    status: { phase: 'Failed', podIP: '10.244.1.55', ready: false, readyCount: 0, containerCount: 1, restarts: 4 },
  },
]

const deployments: Deployment[] = [
  {
    kind: 'Deployment',
    metadata: {
      name: 'api-gateway',
      namespace: 'keks',
      uid: 'dep-1',
      creationTimestamp: ago(48),
      labels: { app: 'api-gateway' },
    },
    spec: { replicas: 2, selector: 'app=api-gateway' },
    status: { readyReplicas: 2, availableReplicas: 2, updatedReplicas: 2 },
  },
  {
    kind: 'Deployment',
    metadata: {
      name: 'worker',
      namespace: 'keks',
      uid: 'dep-2',
      creationTimestamp: ago(48),
      labels: { app: 'worker' },
    },
    spec: { replicas: 3, selector: 'app=worker' },
    status: { readyReplicas: 1, availableReplicas: 1, updatedReplicas: 2 },
  },
  {
    kind: 'Deployment',
    metadata: {
      name: 'coredns',
      namespace: 'kube-system',
      uid: 'dep-3',
      creationTimestamp: ago(700),
      labels: { 'k8s-app': 'kube-dns' },
    },
    spec: { replicas: 2, selector: 'k8s-app=kube-dns' },
    status: { readyReplicas: 2, availableReplicas: 2, updatedReplicas: 2 },
  },
]

const statefulSets: StatefulSet[] = [
  {
    kind: 'StatefulSet',
    metadata: {
      name: 'postgres',
      namespace: 'keks',
      uid: 'sts-1',
      creationTimestamp: ago(72),
      labels: { app: 'postgres' },
    },
    spec: { replicas: 1, serviceName: 'postgres', selector: 'app=postgres' },
    status: { readyReplicas: 1, currentReplicas: 1, updatedReplicas: 1 },
  },
  {
    kind: 'StatefulSet',
    metadata: {
      name: 'prometheus',
      namespace: 'monitoring',
      uid: 'sts-2',
      creationTimestamp: ago(120),
      labels: { app: 'prometheus' },
    },
    spec: { replicas: 2, serviceName: 'prometheus', selector: 'app=prometheus' },
    status: { readyReplicas: 1, currentReplicas: 2, updatedReplicas: 1 },
  },
]

const services: Service[] = [
  {
    kind: 'Service',
    metadata: {
      name: 'api-gateway',
      namespace: 'keks',
      uid: 'svc-1',
      creationTimestamp: ago(48),
      labels: { app: 'api-gateway' },
    },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.12.40',
      ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
    },
  },
  {
    kind: 'Service',
    metadata: {
      name: 'postgres',
      namespace: 'keks',
      uid: 'svc-2',
      creationTimestamp: ago(72),
      labels: { app: 'postgres' },
    },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.44.11',
      ports: [{ name: 'pg', port: 5432, targetPort: 5432, protocol: 'TCP' }],
    },
  },
  {
    kind: 'Service',
    metadata: {
      name: 'kube-dns',
      namespace: 'kube-system',
      uid: 'svc-3',
      creationTimestamp: ago(700),
    },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.0.10',
      ports: [
        { name: 'dns', port: 53, targetPort: 53, protocol: 'UDP' },
        { name: 'dns-tcp', port: 53, targetPort: 53, protocol: 'TCP' },
      ],
    },
  },
  {
    kind: 'Service',
    metadata: {
      name: 'grafana',
      namespace: 'monitoring',
      uid: 'svc-4',
      creationTimestamp: ago(100),
    },
    spec: {
      type: 'NodePort',
      clusterIP: '10.96.88.3',
      ports: [{ name: 'ui', port: 3000, targetPort: 3000, protocol: 'TCP', nodePort: 30300 }],
    },
  },
]

const nodes: Node[] = [
  {
    kind: 'Node',
    metadata: {
      name: 'control-plane',
      uid: 'node-1',
      creationTimestamp: ago(720),
      labels: { 'node-role.kubernetes.io/control-plane': '' },
    },
    status: {
      ready: true,
      roles: ['control-plane'],
      version: 'v1.31.2',
      cpu: '4',
      memory: '8Gi',
      allocatableCpu: '3500m',
      allocatableMemory: '7Gi',
    },
  },
  {
    kind: 'Node',
    metadata: {
      name: 'worker-01',
      uid: 'node-2',
      creationTimestamp: ago(700),
      labels: { 'node-role.kubernetes.io/worker': '' },
    },
    status: {
      ready: true,
      roles: ['worker'],
      version: 'v1.31.2',
      cpu: '8',
      memory: '16Gi',
      allocatableCpu: '7800m',
      allocatableMemory: '14Gi',
    },
  },
  {
    kind: 'Node',
    metadata: {
      name: 'worker-02',
      uid: 'node-3',
      creationTimestamp: ago(700),
      labels: { 'node-role.kubernetes.io/worker': '' },
    },
    status: {
      ready: false,
      roles: ['worker'],
      version: 'v1.31.2',
      cpu: '8',
      memory: '16Gi',
      allocatableCpu: '7800m',
      allocatableMemory: '14Gi',
    },
  },
]

export const demoSnapshot: ClusterSnapshot = {
  namespaces,
  pods,
  deployments,
  statefulSets,
  services,
  nodes,
}

export function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
