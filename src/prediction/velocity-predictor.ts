/**
 * Development Velocity Predictor
 * 
 * Predicts development speed based on historical data and patterns
 */

import { EventEmitter } from 'eventemitter3';
import {
  DevelopmentVelocity,
  VelocityPrediction,
  VelocityFactor,
  PredictionResult
} from './types';
import { DevelopmentEvent } from '../events/types';
import { MetricsCollector } from '../analyzers/metrics-collector';
import { PatternRecognizer } from './pattern-recognizer';

interface VelocityDataPoint {
  timestamp: Date;
  velocity: number;
  factors: VelocityFactor[];
}

export class VelocityPredictor extends EventEmitter {
  private dataPoints: VelocityDataPoint[] = [];
  private readonly maxDataPoints = 1000;
  private currentVelocity: number = 0;
  private predictionInterval: NodeJS.Timer | null = null;

  constructor(
    private metricsCollector: MetricsCollector,
    private patternRecognizer: PatternRecognizer
  ) {
    super();
  }

  async start() {
    // Calculate velocity every hour
    this.predictionInterval = setInterval(() => {
      this.calculateAndPredict();
    }, 60 * 60 * 1000);

    // Initial calculation
    await this.calculateAndPredict();
  }

  stop() {
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
  }

  /**
   * Calculate current velocity and make predictions
   */
  private async calculateAndPredict() {
    console.log('📈 Calculating development velocity...');

    const velocity = await this.calculateCurrentVelocity();
    const factors = await this.identifyVelocityFactors();
    
    // Store data point
    this.dataPoints.push({
      timestamp: new Date(),
      velocity,
      factors
    });

    // Maintain data point limit
    if (this.dataPoints.length > this.maxDataPoints) {
      this.dataPoints.shift();
    }

    // Make prediction
    const prediction = this.predictFutureVelocity();
    
    const result: DevelopmentVelocity = {
      current: velocity,
      average: this.calculateAverageVelocity(),
      trend: this.calculateTrend(),
      prediction
    };

    this.emit('velocity-calculated', result);
    
    return result;
  }

  /**
   * Calculate current development velocity
   */
  private async calculateCurrentVelocity(): Promise<number> {
    const metrics = await this.metricsCollector.getMetrics();
    const recentMetrics = metrics.filter(m => 
      new Date(m.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
    );

    if (recentMetrics.length === 0) return 0;

    // Calculate velocity based on multiple factors
    const commitCount = recentMetrics.filter(m => m.category === 'git' && m.name === 'commits').length;
    const filesChanged = recentMetrics.filter(m => m.category === 'file' && m.name === 'changes').length;
    const testsWritten = recentMetrics.filter(m => m.category === 'test' && m.name === 'created').length;
    const bugsFixed = recentMetrics.filter(m => m.category === 'git' && m.metadata?.type === 'fix').length;
    
    // Weighted velocity calculation
    const velocity = (
      commitCount * 10 +
      filesChanged * 2 +
      testsWritten * 5 +
      bugsFixed * 8
    ) / 24; // Per hour

    this.currentVelocity = velocity;
    return velocity;
  }

  /**
   * Identify factors affecting velocity
   */
  private async identifyVelocityFactors(): Promise<VelocityFactor[]> {
    const factors: VelocityFactor[] = [];
    const patterns = this.patternRecognizer.getPatterns();

    // Time of day factor
    const hour = new Date().getHours();
    const productivityPattern = patterns.find(p => p.id === 'productivity-cycles');
    if (productivityPattern) {
      const productiveHours = productivityPattern.indicators
        .filter(i => i.type === 'productive_hour')
        .map(i => i.value);
      
      if (productiveHours.includes(hour)) {
        factors.push({
          name: 'Peak Productivity Hour',
          impact: 0.3,
          description: 'Currently in identified peak productivity time'
        });
      }
    }

    // Day of week factor
    const dayOfWeek = new Date().getDay();
    const commitPattern = patterns.find(p => p.id === 'commit-frequency');
    if (commitPattern) {
      const peakDay = commitPattern.indicators.find(i => i.type === 'peak_day')?.value;
      if (peakDay === dayOfWeek) {
        factors.push({
          name: 'Peak Activity Day',
          impact: 0.2,
          description: 'Currently on most productive day of week'
        });
      }
    }

    // Technical debt factor
    const recentEvents = await this.getRecentEvents();
    const debuggingEvents = recentEvents.filter(e => 
      e.metadata?.action === 'debug' || e.category === 'error'
    );
    
    if (debuggingEvents.length > 10) {
      factors.push({
        name: 'High Debugging Activity',
        impact: -0.4,
        description: 'Significant time spent on debugging'
      });
    }

    // AI assistance factor
    const aiEvents = recentEvents.filter(e => e.category === 'ai');
    if (aiEvents.length > 5) {
      factors.push({
        name: 'AI Tool Usage',
        impact: 0.25,
        description: 'Active AI collaboration improving productivity'
      });
    }

    // Testing factor
    const testPattern = patterns.find(p => p.id === 'testing-pattern');
    if (testPattern?.indicators.find(i => i.type === 'test_first')?.value === 1) {
      factors.push({
        name: 'Test-First Development',
        impact: 0.15,
        description: 'Following TDD practices'
      });
    }

    // Workflow efficiency
    const workflowPatterns = this.patternRecognizer.getWorkflowPatterns();
    const efficientWorkflows = workflowPatterns.filter(w => w.successRate > 0.8);
    
    if (efficientWorkflows.length > 0) {
      factors.push({
        name: 'Efficient Workflow',
        impact: 0.2,
        description: 'Using proven efficient workflows'
      });
    }

    return factors;
  }

  /**
   * Predict future velocity
   */
  private predictFutureVelocity(): VelocityPrediction {
    if (this.dataPoints.length < 5) {
      return {
        nextPeriod: this.currentVelocity,
        confidence: 0.3,
        factors: []
      };
    }

    // Use moving average with trend
    const recentPoints = this.dataPoints.slice(-10);
    const movingAverage = recentPoints.reduce((sum, p) => sum + p.velocity, 0) / recentPoints.length;
    
    // Calculate trend
    const trend = this.calculateDetailedTrend(recentPoints);
    
    // Apply factors
    let predictedVelocity = movingAverage + trend;
    const currentFactors = recentPoints[recentPoints.length - 1].factors;
    
    for (const factor of currentFactors) {
      predictedVelocity *= (1 + factor.impact);
    }

    // Calculate confidence based on data consistency
    const variance = this.calculateVariance(recentPoints.map(p => p.velocity));
    const confidence = Math.max(0.3, Math.min(0.9, 1 - (variance / movingAverage)));

    return {
      nextPeriod: Math.max(0, predictedVelocity),
      confidence,
      factors: currentFactors
    };
  }

  /**
   * Calculate average velocity
   */
  private calculateAverageVelocity(): number {
    if (this.dataPoints.length === 0) return 0;
    
    const sum = this.dataPoints.reduce((total, point) => total + point.velocity, 0);
    return sum / this.dataPoints.length;
  }

  /**
   * Calculate velocity trend
   */
  private calculateTrend(): 'increasing' | 'stable' | 'decreasing' {
    if (this.dataPoints.length < 3) return 'stable';

    const recentPoints = this.dataPoints.slice(-5);
    const trend = this.calculateDetailedTrend(recentPoints);

    if (trend > 0.1) return 'increasing';
    if (trend < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate detailed trend value
   */
  private calculateDetailedTrend(points: VelocityDataPoint[]): number {
    if (points.length < 2) return 0;

    let trendSum = 0;
    for (let i = 1; i < points.length; i++) {
      trendSum += points[i].velocity - points[i - 1].velocity;
    }

    return trendSum / (points.length - 1);
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    
    return Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length);
  }

  /**
   * Get recent development events
   */
  private async getRecentEvents(): Promise<DevelopmentEvent[]> {
    // This would typically fetch from event storage
    // For now, return empty array
    return [];
  }

  /**
   * Get current velocity
   */
  getCurrentVelocity(): DevelopmentVelocity {
    const prediction = this.predictFutureVelocity();
    
    return {
      current: this.currentVelocity,
      average: this.calculateAverageVelocity(),
      trend: this.calculateTrend(),
      prediction
    };
  }

  /**
   * Make velocity prediction
   */
  async makeVelocityPrediction(hours: number = 24): Promise<PredictionResult<number[]>> {
    const predictions: number[] = [];
    let currentPrediction = this.currentVelocity;
    
    for (let i = 0; i < hours; i++) {
      const prediction = this.predictFutureVelocity();
      currentPrediction = prediction.nextPeriod;
      predictions.push(currentPrediction);
    }

    return {
      prediction: predictions,
      confidence: this.predictFutureVelocity().confidence,
      reasoning: [
        `Based on ${this.dataPoints.length} historical data points`,
        `Current trend: ${this.calculateTrend()}`,
        `Average velocity: ${this.calculateAverageVelocity().toFixed(2)}`
      ],
      dataPoints: this.dataPoints.length,
      timestamp: new Date()
    };
  }
}