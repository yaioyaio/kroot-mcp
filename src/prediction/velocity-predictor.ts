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
import { BaseEvent as DevelopmentEvent } from '../events/types/base.js';
import { MetricsCollector } from '../analyzers/metrics-collector';
import { PatternRecognizer } from './pattern-recognizer';

interface VelocityDataPoint {
  timestamp: Date;
  velocity: number;
  factors: VelocityFactor[];
}

export class VelocityPredictor extends EventEmitter {
  private dataPoints: VelocityDataPoint[] = [];
  private currentVelocity: number = 0;
  private predictionInterval: NodeJS.Timeout | null = null;

  constructor(
    // @ts-ignore - Reserved for future predictive analytics implementation
    private metricsCollector: MetricsCollector,
    // @ts-ignore - Reserved for pattern-based velocity prediction
    private patternRecognizer: PatternRecognizer
  ) {
    super();
  }

  async start() {
    // 폴링 제거 - MCP on-demand 방식으로 변경
    // this.predictionInterval = setInterval(() => {
    //   this.calculateAndPredict();
    // }, 60 * 60 * 1000);

    // 초기 계산 제거 - 사용자 요청 시에만 실행
    // await this.calculateAndPredict();
    // console.log('VelocityPredictor initialized for on-demand velocity prediction');
  }

  stop() {
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
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
    const currentFactors = recentPoints[recentPoints.length - 1]?.factors || [];
    
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
      const current = points[i];
      const previous = points[i - 1];
      if (current && previous) {
        trendSum += current.velocity - previous.velocity;
      }
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
  // @ts-ignore - Reserved for future event analysis implementation
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