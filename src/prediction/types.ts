/**
 * Prediction System Types
 */

export interface Pattern {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  indicators: PatternIndicator[];
  confidence: number;
  frequency: number;
  lastSeen: Date;
}

export enum PatternCategory {
  DEVELOPMENT = 'development',
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  COLLABORATION = 'collaboration',
  WORKFLOW = 'workflow'
}

export interface PatternIndicator {
  type: string;
  value: any;
  weight: number;
  threshold?: number;
}

export interface DevelopmentVelocity {
  current: number;
  average: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  prediction: VelocityPrediction;
}

export interface VelocityPrediction {
  nextPeriod: number;
  confidence: number;
  factors: VelocityFactor[];
}

export interface VelocityFactor {
  name: string;
  impact: number; // -1 to 1
  description: string;
}

export interface BottleneckPrediction {
  type: BottleneckType;
  probability: number;
  timeframe: string;
  indicators: string[];
  preventionSuggestions: string[];
}

export enum BottleneckType {
  TECHNICAL_DEBT = 'technical_debt',
  RESOURCE_CONSTRAINT = 'resource_constraint',
  PROCESS_INEFFICIENCY = 'process_inefficiency',
  SKILL_GAP = 'skill_gap',
  DEPENDENCY_BLOCK = 'dependency_block'
}

export interface WorkflowPattern {
  id: string;
  name: string;
  steps: WorkflowStep[];
  frequency: number;
  avgDuration: number;
  successRate: number;
}

export interface WorkflowStep {
  name: string;
  type: string;
  avgDuration: number;
  dependencies: string[];
  metadata?: Record<string, any>;
}

export interface PredictionResult<T> {
  prediction: T;
  confidence: number;
  reasoning: string[];
  dataPoints: number;
  timestamp: Date;
}