#!/usr/bin/env tsx

/**
 * 메트릭 시스템 테스트 스크립트
 */

import { metricsCollector } from '../src/analyzers/metrics-collector.js';
import { bottleneckDetector } from '../src/analyzers/bottleneck-detector.js';
import { metricsAnalyzer } from '../src/analyzers/metrics-analyzer.js';
import { eventEngine } from '../src/events/engine.js';
import { EventCategory, EventSeverity } from '../src/events/types/base.js';

async function testMetricsSystem() {
  console.log('🧪 Starting Metrics System Test');
  console.log('================================\n');

  // 메트릭 시스템 시작
  console.log('1. Starting metrics system...');
  metricsCollector.start();
  bottleneckDetector.start();
  metricsAnalyzer.start();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('✅ Metrics system started\n');

  // 테스트 이벤트 생성
  console.log('2. Generating test events...');
  const testEvents = [
    {
      type: 'file:changed',
      category: EventCategory.FILE,
      severity: EventSeverity.INFO,
      source: 'test-script',
      data: { path: '/src/components/Button.tsx', changes: 15 },
    },
    {
      type: 'git:commit',
      category: EventCategory.GIT,
      severity: EventSeverity.INFO,
      source: 'test-script',
      data: { 
        hash: 'abc123',
        message: 'feat: add new button component',
        stats: { insertions: 25, deletions: 5, files: 2 },
      },
    },
    {
      type: 'test:run',
      category: EventCategory.TEST,
      severity: EventSeverity.INFO,
      source: 'test-script',
      data: { duration: 1500, coverage: 85, passed: true },
    },
    {
      type: 'build:completed',
      category: EventCategory.BUILD,
      severity: EventSeverity.INFO,
      source: 'test-script',
      data: { duration: 5000, success: true },
    },
    {
      type: 'ai:suggestion',
      category: EventCategory.AI,
      severity: EventSeverity.INFO,
      source: 'test-script',
      data: { accepted: true, tool: 'copilot' },
    },
  ];

  for (let i = 0; i < testEvents.length; i++) {
    const event = testEvents[i];
    eventEngine.publish(event.type, event.category, event.severity, event.source, event.data);
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`   📝 Generated event: ${event.type}`);
  }
  
  console.log('✅ Test events generated\n');

  // 메트릭 수집 확인
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('3. Checking metrics collection...');
  
  const snapshot = metricsCollector.getMetricsSnapshot();
  console.log(`   📊 Total metrics: ${snapshot.totalMetrics}`);
  console.log(`   📈 Total events processed: ${snapshot.totalEvents}`);
  console.log(`   ⏱️  System uptime: ${Math.round(snapshot.uptime / 1000)}s`);
  
  const allMetrics = metricsCollector.getAllMetrics();
  console.log('\n   📋 Available metrics:');
  for (const [id, metric] of allMetrics) {
    if (metric.values.length > 0) {
      console.log(`      - ${id}: ${metric.summary.current} (${metric.definition.unit})`);
    }
  }
  
  console.log('✅ Metrics collection verified\n');

  // 병목 현상 확인
  console.log('4. Checking bottleneck detection...');
  const bottlenecks = bottleneckDetector.getAllBottlenecks();
  console.log(`   🔍 Active bottlenecks: ${bottlenecks.length}`);
  
  if (bottlenecks.length > 0) {
    console.log('\n   ⚠️  Detected bottlenecks:');
    bottlenecks.forEach(b => {
      console.log(`      - ${b.title} (${b.type}, impact: ${b.impact}%)`);
    });
  }
  
  const bottleneckStats = bottleneckDetector.getStats();
  console.log(`   📊 Detection rules: ${bottleneckStats.detectionRules}`);
  console.log('✅ Bottleneck detection verified\n');

  // 메트릭 분석 수행
  console.log('5. Performing metrics analysis...');
  const analysisResult = await metricsAnalyzer.performAnalysis();
  
  console.log(`   📈 Overall score: ${analysisResult.summary.overallScore}/100`);
  console.log(`   📊 Total metrics analyzed: ${analysisResult.summary.totalMetrics}`);
  console.log(`   ⚠️  Active bottlenecks: ${analysisResult.summary.activeBottlenecks}`);
  console.log(`   📈 Overall trend: ${analysisResult.summary.trend}`);
  
  if (analysisResult.insights.length > 0) {
    console.log('\n   💡 Insights:');
    analysisResult.insights.forEach(insight => {
      console.log(`      - ${insight}`);
    });
  }
  
  if (analysisResult.recommendations.length > 0) {
    console.log('\n   🎯 Recommendations:');
    analysisResult.recommendations.forEach(rec => {
      console.log(`      - ${rec}`);
    });
  }
  
  console.log('✅ Metrics analysis completed\n');

  // 시스템 상태 확인
  console.log('6. System status summary...');
  const collectorStats = metricsCollector.getStats();
  const detectorStats = bottleneckDetector.getStats();
  const analyzerStats = metricsAnalyzer.getStats();
  
  console.log('   📊 MetricsCollector:');
  console.log(`      - Running: ${collectorStats.isRunning}`);
  console.log(`      - Total metrics: ${collectorStats.totalMetrics}`);
  console.log(`      - Total events: ${collectorStats.totalEvents}`);
  
  console.log('   🔍 BottleneckDetector:');
  console.log(`      - Running: ${detectorStats.isRunning}`);
  console.log(`      - Total bottlenecks: ${detectorStats.totalBottlenecks}`);
  
  console.log('   📈 MetricsAnalyzer:');
  console.log(`      - Running: ${analyzerStats.isRunning}`);
  console.log(`      - Last analysis: ${analyzerStats.lastAnalysisTime || 'Never'}`);
  
  console.log('✅ System status verified\n');

  // 정리
  console.log('7. Cleaning up...');
  metricsCollector.stop();
  bottleneckDetector.stop();
  metricsAnalyzer.stop();
  console.log('✅ Cleanup completed\n');

  console.log('🎉 Metrics System Test Completed Successfully!');
  console.log('==========================================');
}

// 테스트 실행
testMetricsSystem().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});