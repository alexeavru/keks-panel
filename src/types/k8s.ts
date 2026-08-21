export type ResourceKind =
  | 'Namespace'
  | 'Pod'
  | 'Deployment'
  | 'StatefulSet'
  | 'Service'
  | 'Node'

export type ConnectionMode = 'demo' | 'kubeconfig' | 'live'

export interface KubeContextInfo {
  name: string
  cluster: string
  user: string
  namespace?: string
  server?: string
  current: boolean
}

export interface ClusterConnection {
  name: string
  host: string
  token: string
  skipTlsVerify: boolean
  mode: ConnectionMode
  /** kubeconfig context name when mode === 'kubeconfig' */
  context?: string
  connectedAt: string
}

export interface K8sObjectMeta {
  name: string
  namespace?: string
  uid: string
  creationTimestamp: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Namespace {
  kind: 'Namespace'
  metadata: K8sObjectMeta
  status: { phase: 'Active' | 'Terminating' }
}

export interface Pod {
  kind: 'Pod'
  metadata: K8sObjectMeta
  spec: {
    nodeName?: string
    containers: { name: string; image: string }[]
  }
  status: {
    phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
    podIP?: string
    ready: boolean
    readyCount: number
    containerCount: number
    restarts: number
    cpuUsage?: string
    cpuMillis?: number
    cpuRequest?: string
    cpuLimit?: string
    memoryUsage?: string
    memoryMi?: number
    memoryRequest?: string
    memoryLimit?: string
  }
}

export interface Deployment {
  kind: 'Deployment'
  metadata: K8sObjectMeta
  spec: {
    replicas: number
    selector: string
  }
  status: {
    readyReplicas: number
    availableReplicas: number
    updatedReplicas: number
  }
}

export interface StatefulSet {
  kind: 'StatefulSet'
  metadata: K8sObjectMeta
  spec: {
    replicas: number
    serviceName: string
    selector: string
  }
  status: {
    readyReplicas: number
    currentReplicas: number
    updatedReplicas: number
  }
}

export interface Service {
  kind: 'Service'
  metadata: K8sObjectMeta
  spec: {
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName'
    clusterIP: string
    ports: { name?: string; port: number; targetPort: number | string; protocol: string; nodePort?: number }[]
  }
}

export interface Node {
  kind: 'Node'
  metadata: K8sObjectMeta
  status: {
    ready: boolean
    roles: string[]
    version: string
    cpu: string
    memory: string
    allocatableCpu: string
    allocatableMemory: string
  }
}

export type K8sResource = Namespace | Pod | Deployment | StatefulSet | Service | Node

export interface ClusterSnapshot {
  namespaces: Namespace[]
  pods: Pod[]
  deployments: Deployment[]
  statefulSets: StatefulSet[]
  services: Service[]
  nodes: Node[]
}
