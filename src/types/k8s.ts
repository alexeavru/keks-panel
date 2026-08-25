export type ResourceKind =
  | 'Namespace'
  | 'Pod'
  | 'Deployment'
  | 'ReplicaSet'
  | 'StatefulSet'
  | 'Service'
  | 'Ingress'
  | 'ConfigMap'
  | 'Secret'
  | 'PersistentVolume'
  | 'PersistentVolumeClaim'
  | 'StorageClass'
  | 'Node'

export type ConnectionMode = 'kubeconfig' | 'live' | 'oidc'

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
    state: string
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

export interface PodContainerInfo {
  name: string
  image: string
  ready: boolean
  restarts: number
  state: string
  init: boolean
}

export interface PodConditionInfo {
  type: string
  status: string
  reason?: string
  message?: string
}

export interface PodDetail {
  info: Pod & {
    spec: Pod['spec'] & {
      serviceAccount?: string
      restartPolicy?: string
      qosClass?: string
    }
    status: Pod['status'] & {
      hostIP?: string
      startTime?: string
      qosClass?: string
    }
    containers: PodContainerInfo[]
    conditions: PodConditionInfo[]
    volumes: string[]
  }
  yaml: string
}

export interface PodEvent {
  uid: string
  type: string
  reason: string
  message: string
  count: number
  firstTimestamp?: string
  lastTimestamp?: string
  source: string
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

export interface DeploymentDetail {
  info: Deployment & {
    spec: Deployment['spec'] & {
      strategy?: string
      minReadySeconds?: number
      revisionHistoryLimit?: number
      progressDeadlineSeconds?: number
    }
    status: Deployment['status'] & {
      replicas?: number
      unavailableReplicas?: number
      observedGeneration?: number
    }
    containers: { name: string; image: string }[]
    conditions: PodConditionInfo[]
  }
  yaml: string
}

export interface ReplicaSet {
  kind: 'ReplicaSet'
  metadata: K8sObjectMeta
  spec: {
    replicas: number
    selector: string
  }
  status: {
    replicas: number
    readyReplicas: number
    availableReplicas: number
    fullyLabeledReplicas: number
  }
  owner?: string
}

export interface ReplicaSetDetail {
  info: ReplicaSet & {
    spec: ReplicaSet['spec'] & {
      minReadySeconds?: number
    }
    status: ReplicaSet['status'] & {
      observedGeneration?: number
    }
    containers: { name: string; image: string }[]
    conditions: PodConditionInfo[]
  }
  yaml: string
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

export interface Ingress {
  kind: 'Ingress'
  metadata: K8sObjectMeta
  spec: {
    className: string
    hosts: string[]
    tls: boolean
  }
  status: {
    address: string
  }
}

export interface ConfigMap {
  kind: 'ConfigMap'
  metadata: K8sObjectMeta
  data: Record<string, string>
  binaryDataKeys: string[]
  immutable?: boolean
}

export interface ConfigMapDetail {
  info: ConfigMap
  yaml: string
}

export interface Secret {
  kind: 'Secret'
  metadata: K8sObjectMeta
  type: string
  dataKeys: string[]
}

export interface PersistentVolume {
  kind: 'PersistentVolume'
  metadata: K8sObjectMeta
  spec: {
    capacity: string
    accessModes: string
    reclaimPolicy: string
    storageClass: string
    volumeMode: string
    claim: string
  }
  status: {
    phase: string
  }
}

export interface PersistentVolumeClaim {
  kind: 'PersistentVolumeClaim'
  metadata: K8sObjectMeta
  spec: {
    volumeName: string
    storageClass: string
    accessModes: string
    volumeMode: string
  }
  status: {
    phase: string
    capacity: string
  }
}

export interface StorageClass {
  kind: 'StorageClass'
  metadata: K8sObjectMeta
  spec: {
    provisioner: string
    reclaimPolicy: string
    volumeBindingMode: string
    allowVolumeExpansion: boolean
    isDefault: boolean
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

export interface ClusterInfo {
  name: string
  context: string
  server: string
  user: string
  namespace?: string
  version: string
  platform?: string
}

export type K8sResource =
  | Namespace
  | Pod
  | Deployment
  | ReplicaSet
  | StatefulSet
  | Service
  | Ingress
  | ConfigMap
  | Secret
  | PersistentVolume
  | PersistentVolumeClaim
  | StorageClass
  | Node

export interface ClusterSnapshot {
  namespaces: Namespace[]
  pods: Pod[]
  deployments: Deployment[]
  replicaSets: ReplicaSet[]
  statefulSets: StatefulSet[]
  services: Service[]
  ingresses: Ingress[]
  configMaps: ConfigMap[]
  secrets: Secret[]
  persistentVolumes: PersistentVolume[]
  persistentVolumeClaims: PersistentVolumeClaim[]
  storageClasses: StorageClass[]
  nodes: Node[]
  info: ClusterInfo
}
