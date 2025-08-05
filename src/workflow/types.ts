/**
 * Workflow Engine Types
 */

export interface Workflow {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  rules: WorkflowRule[];
  templates: WorkflowTemplate[];
  metadata: WorkflowMetadata;
}

export interface WorkflowStage {
  id: string;
  name: string;
  type: StageType;
  conditions: StageCondition[];
  actions: StageAction[];
  transitions: StageTransition[];
  customFields?: Record<string, any>;
}

export enum StageType {
  START = 'start',
  PROCESS = 'process',
  DECISION = 'decision',
  PARALLEL = 'parallel',
  END = 'end',
  CUSTOM = 'custom'
}

export interface StageCondition {
  type: 'event' | 'metric' | 'time' | 'custom';
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'regex';
  field: string;
  value: any;
  description?: string;
}

export interface StageAction {
  type: ActionType;
  parameters: Record<string, any>;
  async: boolean;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

export enum ActionType {
  NOTIFY = 'notify',
  LOG = 'log',
  METRIC = 'metric',
  API_CALL = 'api_call',
  SCRIPT = 'script',
  TOOL = 'tool',
  CUSTOM = 'custom'
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier: number;
  maxBackoff: number;
}

export interface StageTransition {
  to: string;
  condition?: StageCondition;
  priority: number;
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
}

export interface RuleTrigger {
  type: 'event' | 'schedule' | 'manual' | 'webhook';
  config: Record<string, any>;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: any;
  combineWith?: 'AND' | 'OR';
}

export interface RuleAction {
  type: string;
  config: Record<string, any>;
  order: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  stages: WorkflowStage[];
  variables: TemplateVariable[];
  examples: TemplateExample[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description: string;
}

export interface TemplateExample {
  name: string;
  description: string;
  variables: Record<string, any>;
}

export interface WorkflowMetadata {
  version: string;
  author: string;
  created: Date;
  modified: Date;
  tags: string[];
  permissions: WorkflowPermission[];
}

export interface WorkflowPermission {
  role: string;
  actions: ('read' | 'write' | 'execute' | 'delete')[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  currentStage: string;
  startTime: Date;
  endTime?: Date;
  context: ExecutionContext;
  history: ExecutionHistoryItem[];
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface ExecutionContext {
  variables: Record<string, any>;
  metrics: Record<string, number>;
  errors: ExecutionError[];
}

export interface ExecutionError {
  stage: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface ExecutionHistoryItem {
  stage: string;
  action: string;
  timestamp: Date;
  duration: number;
  result: any;
  error?: string;
}