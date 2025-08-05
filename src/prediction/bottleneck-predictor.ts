/**
 * Bottleneck Prediction System
 * 
 * Predicts potential bottlenecks before they occur
 */

import { EventEmitter } from 'eventemitter3';
import {
  BottleneckPrediction,
  BottleneckType,
  PredictionResult
} from './types';
import { MetricsCollector } from '../analyzers/metrics-collector';
import { BottleneckDetector } from '../analyzers/bottleneck-detector';
import { PatternRecognizer } from './pattern-recognizer';

interface BottleneckIndicator {
  type: BottleneckType;
  indicator: string;
  weight: number;
  threshold: number;
  currentValue: number;
}

export class BottleneckPredictor extends EventEmitter {
  private indicators: Map<string, BottleneckIndicator> = new Map();
  private predictionHistory: BottleneckPrediction[] = [];
  private predictionInterval: NodeJS.Timer | null = null;

  constructor(
    private metricsCollector: MetricsCollector,
    private bottleneckDetector: BottleneckDetector,
    private patternRecognizer: PatternRecognizer
  ) {
    super();
    this.initializeIndicators();
  }

  /**
   * Initialize bottleneck indicators
   */
  private initializeIndicators() {
    // Technical debt indicators
    this.addIndicator({
      type: BottleneckType.TECHNICAL_DEBT,
      indicator: 'code_complexity_trend',
      weight: 0.8,
      threshold: 0.3,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.TECHNICAL_DEBT,
      indicator: 'test_coverage_decline',
      weight: 0.7,
      threshold: -0.1,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.TECHNICAL_DEBT,
      indicator: 'bug_rate_increase',
      weight: 0.9,
      threshold: 0.5,
      currentValue: 0
    });

    // Resource constraint indicators
    this.addIndicator({
      type: BottleneckType.RESOURCE_CONSTRAINT,
      indicator: 'memory_usage_trend',
      weight: 0.7,
      threshold: 0.85,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.RESOURCE_CONSTRAINT,
      indicator: 'response_time_increase',
      weight: 0.8,
      threshold: 0.5,
      currentValue: 0
    });

    // Process inefficiency indicators
    this.addIndicator({
      type: BottleneckType.PROCESS_INEFFICIENCY,
      indicator: 'cycle_time_increase',
      weight: 0.8,
      threshold: 0.3,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.PROCESS_INEFFICIENCY,
      indicator: 'wait_time_ratio',
      weight: 0.7,
      threshold: 0.4,
      currentValue: 0
    });

    // Skill gap indicators
    this.addIndicator({
      type: BottleneckType.SKILL_GAP,
      indicator: 'error_rate_by_area',
      weight: 0.6,
      threshold: 0.3,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.SKILL_GAP,
      indicator: 'help_request_frequency',
      weight: 0.5,
      threshold: 0.7,
      currentValue: 0
    });

    // Dependency block indicators
    this.addIndicator({
      type: BottleneckType.DEPENDENCY_BLOCK,
      indicator: 'external_api_failures',
      weight: 0.9,
      threshold: 0.1,
      currentValue: 0
    });

    this.addIndicator({
      type: BottleneckType.DEPENDENCY_BLOCK,
      indicator: 'blocked_task_count',
      weight: 0.8,
      threshold: 3,
      currentValue: 0
    });
  }

  /**
   * Add bottleneck indicator
   */
  private addIndicator(indicator: BottleneckIndicator) {
    this.indicators.set(indicator.indicator, indicator);
  }

  async start() {
    // Run predictions every 30 minutes
    this.predictionInterval = setInterval(() => {
      this.runPredictions();
    }, 30 * 60 * 1000);

    // Initial prediction
    await this.runPredictions();
  }

  stop() {
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
  }

  /**
   * Run bottleneck predictions
   */
  private async runPredictions() {
    console.log('🔮 Running bottleneck predictions...');

    // Update indicator values
    await this.updateIndicatorValues();

    // Analyze each bottleneck type
    const predictions: BottleneckPrediction[] = [];

    for (const type of Object.values(BottleneckType)) {
      const prediction = await this.predictBottleneck(type);
      if (prediction.probability > 0.3) {
        predictions.push(prediction);
      }
    }

    // Sort by probability
    predictions.sort((a, b) => b.probability - a.probability);

    // Store predictions
    this.predictionHistory.push(...predictions);
    
    // Emit predictions
    this.emit('predictions-made', predictions);

    // Check for high-risk predictions
    const highRisk = predictions.filter(p => p.probability > 0.7);
    if (highRisk.length > 0) {
      this.emit('high-risk-bottlenecks', highRisk);
    }
  }

  /**
   * Update current indicator values
   */
  private async updateIndicatorValues() {
    const metrics = await this.metricsCollector.getMetrics();
    const recentMetrics = metrics.filter(m => 
      new Date(m.timestamp).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    // Update technical debt indicators
    await this.updateTechnicalDebtIndicators(recentMetrics);

    // Update resource constraint indicators
    await this.updateResourceIndicators(recentMetrics);

    // Update process efficiency indicators
    await this.updateProcessIndicators(recentMetrics);

    // Update skill gap indicators
    await this.updateSkillGapIndicators(recentMetrics);

    // Update dependency indicators
    await this.updateDependencyIndicators(recentMetrics);
  }

  /**
   * Update technical debt indicators
   */
  private async updateTechnicalDebtIndicators(metrics: any[]) {
    // Code complexity trend
    const complexityMetrics = metrics.filter(m => m.name === 'code_complexity');
    if (complexityMetrics.length > 1) {
      const trend = this.calculateTrend(complexityMetrics.map(m => m.value));
      this.updateIndicatorValue('code_complexity_trend', trend);
    }

    // Test coverage decline
    const coverageMetrics = metrics.filter(m => m.name === 'test_coverage');
    if (coverageMetrics.length > 1) {
      const trend = this.calculateTrend(coverageMetrics.map(m => m.value));
      this.updateIndicatorValue('test_coverage_decline', -trend); // Negative trend is bad
    }

    // Bug rate increase
    const bugMetrics = metrics.filter(m => m.category === 'issue' && m.metadata?.type === 'bug');
    const bugRate = bugMetrics.length / Math.max(1, metrics.length);
    this.updateIndicatorValue('bug_rate_increase', bugRate);
  }

  /**
   * Update resource constraint indicators
   */
  private async updateResourceIndicators(metrics: any[]) {
    // Memory usage trend
    const memoryMetrics = metrics.filter(m => m.name === 'memory_usage');
    if (memoryMetrics.length > 0) {
      const avgMemory = memoryMetrics.reduce((sum, m) => sum + m.value, 0) / memoryMetrics.length;
      this.updateIndicatorValue('memory_usage_trend', avgMemory / 100); // Normalize to 0-1
    }

    // Response time increase
    const responseMetrics = metrics.filter(m => m.name === 'response_time');
    if (responseMetrics.length > 1) {
      const trend = this.calculateTrend(responseMetrics.map(m => m.value));
      this.updateIndicatorValue('response_time_increase', trend);
    }
  }

  /**
   * Update process efficiency indicators
   */
  private async updateProcessIndicators(metrics: any[]) {
    // Cycle time increase
    const cycleMetrics = metrics.filter(m => m.name === 'cycle_time');
    if (cycleMetrics.length > 1) {
      const trend = this.calculateTrend(cycleMetrics.map(m => m.value));
      this.updateIndicatorValue('cycle_time_increase', trend);
    }

    // Wait time ratio
    const patterns = this.patternRecognizer.getWorkflowPatterns();
    const totalTime = patterns.reduce((sum, p) => sum + p.avgDuration, 0);
    const activeTime = patterns.reduce((sum, p) => sum + (p.avgDuration * p.successRate), 0);
    const waitRatio = totalTime > 0 ? (totalTime - activeTime) / totalTime : 0;
    this.updateIndicatorValue('wait_time_ratio', waitRatio);
  }

  /**
   * Update skill gap indicators
   */
  private async updateSkillGapIndicators(metrics: any[]) {
    // Error rate by area
    const errorMetrics = metrics.filter(m => m.category === 'error');
    const errorRate = errorMetrics.length / Math.max(1, metrics.length);
    this.updateIndicatorValue('error_rate_by_area', errorRate);

    // Help request frequency
    const aiMetrics = metrics.filter(m => m.category === 'ai');
    const helpRate = aiMetrics.length / Math.max(1, metrics.length);
    this.updateIndicatorValue('help_request_frequency', helpRate);
  }

  /**
   * Update dependency indicators
   */
  private async updateDependencyIndicators(metrics: any[]) {
    // External API failures
    const apiMetrics = metrics.filter(m => m.category === 'api' && m.metadata?.status === 'failure');
    const failureRate = apiMetrics.length / Math.max(1, metrics.filter(m => m.category === 'api').length);
    this.updateIndicatorValue('external_api_failures', failureRate);

    // Blocked task count
    const blockedMetrics = metrics.filter(m => m.metadata?.status === 'blocked');
    this.updateIndicatorValue('blocked_task_count', blockedMetrics.length);
  }

  /**
   * Update indicator value
   */
  private updateIndicatorValue(indicatorName: string, value: number) {
    const indicator = this.indicators.get(indicatorName);
    if (indicator) {
      indicator.currentValue = value;
    }
  }

  /**
   * Predict specific bottleneck type
   */
  private async predictBottleneck(type: BottleneckType): Promise<BottleneckPrediction> {
    const typeIndicators = Array.from(this.indicators.values())
      .filter(i => i.type === type);

    if (typeIndicators.length === 0) {
      return {
        type,
        probability: 0,
        timeframe: 'unknown',
        indicators: [],
        preventionSuggestions: []
      };
    }

    // Calculate weighted probability
    let totalWeight = 0;
    let weightedSum = 0;
    const triggeredIndicators: string[] = [];

    for (const indicator of typeIndicators) {
      const normalized = this.normalizeIndicatorValue(indicator);
      if (normalized > 0.3) {
        triggeredIndicators.push(indicator.indicator);
      }
      weightedSum += normalized * indicator.weight;
      totalWeight += indicator.weight;
    }

    const probability = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Determine timeframe
    const timeframe = this.estimateTimeframe(probability);

    // Generate prevention suggestions
    const preventionSuggestions = this.generatePreventionSuggestions(type, triggeredIndicators);

    return {
      type,
      probability,
      timeframe,
      indicators: triggeredIndicators,
      preventionSuggestions
    };
  }

  /**
   * Normalize indicator value based on threshold
   */
  private normalizeIndicatorValue(indicator: BottleneckIndicator): number {
    if (indicator.threshold === 0) return 0;
    
    const ratio = indicator.currentValue / indicator.threshold;
    return Math.min(1, Math.max(0, ratio));
  }

  /**
   * Calculate trend from values
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    let trendSum = 0;
    for (let i = 1; i < values.length; i++) {
      trendSum += (values[i] - values[i - 1]) / values[i - 1];
    }

    return trendSum / (values.length - 1);
  }

  /**
   * Estimate timeframe for bottleneck
   */
  private estimateTimeframe(probability: number): string {
    if (probability > 0.8) return '1-3 days';
    if (probability > 0.6) return '1 week';
    if (probability > 0.4) return '2-3 weeks';
    return '1 month+';
  }

  /**
   * Generate prevention suggestions
   */
  private generatePreventionSuggestions(type: BottleneckType, indicators: string[]): string[] {
    const suggestions: string[] = [];

    switch (type) {
      case BottleneckType.TECHNICAL_DEBT:
        suggestions.push('Schedule refactoring sessions');
        suggestions.push('Increase test coverage requirements');
        suggestions.push('Implement code review standards');
        if (indicators.includes('bug_rate_increase')) {
          suggestions.push('Allocate time for bug fixing sprints');
        }
        break;

      case BottleneckType.RESOURCE_CONSTRAINT:
        suggestions.push('Optimize resource-intensive operations');
        suggestions.push('Implement caching strategies');
        suggestions.push('Consider horizontal scaling');
        if (indicators.includes('memory_usage_trend')) {
          suggestions.push('Profile memory usage and fix leaks');
        }
        break;

      case BottleneckType.PROCESS_INEFFICIENCY:
        suggestions.push('Review and optimize workflow');
        suggestions.push('Automate repetitive tasks');
        suggestions.push('Implement parallel processing where possible');
        break;

      case BottleneckType.SKILL_GAP:
        suggestions.push('Provide targeted training sessions');
        suggestions.push('Implement pair programming');
        suggestions.push('Create knowledge sharing sessions');
        if (indicators.includes('help_request_frequency')) {
          suggestions.push('Document common issues and solutions');
        }
        break;

      case BottleneckType.DEPENDENCY_BLOCK:
        suggestions.push('Implement fallback mechanisms');
        suggestions.push('Cache external API responses');
        suggestions.push('Review and update dependencies');
        suggestions.push('Create mock services for development');
        break;
    }

    return suggestions;
  }

  /**
   * Get current predictions
   */
  getCurrentPredictions(): BottleneckPrediction[] {
    const recentPredictions = this.predictionHistory
      .filter(p => new Date(p.timeframe).getTime() > Date.now() - 24 * 60 * 60 * 1000)
      .sort((a, b) => b.probability - a.probability);

    return recentPredictions;
  }

  /**
   * Make comprehensive bottleneck prediction
   */
  async makeBottleneckPrediction(): Promise<PredictionResult<BottleneckPrediction[]>> {
    await this.runPredictions();
    
    const predictions = this.getCurrentPredictions();
    const highRisk = predictions.filter(p => p.probability > 0.7);
    const mediumRisk = predictions.filter(p => p.probability > 0.4 && p.probability <= 0.7);

    return {
      prediction: predictions,
      confidence: predictions.length > 0 ? 0.75 : 0.3,
      reasoning: [
        `Analyzed ${this.indicators.size} indicators`,
        `Found ${highRisk.length} high-risk bottlenecks`,
        `Found ${mediumRisk.length} medium-risk bottlenecks`,
        'Based on 7-day rolling metrics'
      ],
      dataPoints: Array.from(this.indicators.values()).filter(i => i.currentValue > 0).length,
      timestamp: new Date()
    };
  }
}