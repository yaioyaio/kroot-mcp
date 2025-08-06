/**
 * Pattern Recognition Engine
 * 
 * Identifies recurring patterns in development workflow
 */

import { EventEmitter } from 'eventemitter3';
import { 
  Pattern, 
  PatternCategory, 
  WorkflowPattern,
  WorkflowStep 
} from './types';
import { BaseEvent as DevelopmentEvent } from '../events/types/base.js';
import { StorageManager } from '../storage/index.js';

export class PatternRecognizer extends EventEmitter {
  private patterns: Map<string, Pattern> = new Map();
  private workflowPatterns: Map<string, WorkflowPattern> = new Map();
  private eventHistory: DevelopmentEvent[] = [];
  private readonly maxHistorySize = 10000;
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(
    private _storageManager: StorageManager
  ) {
    super();
    this.loadPatterns();
  }

  async start() {
    // Analyze patterns every 5 minutes
    this.analysisInterval = setInterval(() => {
      this.analyzePatterns();
    }, 5 * 60 * 1000);

    // Initial analysis
    await this.analyzePatterns();
  }

  stop() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /**
   * Process new event for pattern detection
   */
  processEvent(event: DevelopmentEvent) {
    this.eventHistory.push(event);
    
    // Maintain history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Check for immediate patterns
    this.detectImmediatePatterns(event);
  }

  /**
   * Detect patterns that can be identified from single events
   */
  private detectImmediatePatterns(event: DevelopmentEvent) {
    // Rapid file changes pattern
    if (event.category === 'file') {
      this.detectRapidFileChanges();
    }

    // Test-driven development pattern
    if (event.category === 'test') {
      this.detectTDDPattern();
    }

    // Debugging pattern
    if (event.metadata?.action === 'debug' || event.metadata?.tool === 'debugger') {
      this.detectDebuggingPattern();
    }
  }

  /**
   * Comprehensive pattern analysis
   */
  private async analyzePatterns() {
    console.log('🔍 Analyzing development patterns...');

    // Workflow patterns
    await this.analyzeWorkflowPatterns();

    // Development velocity patterns
    await this.analyzeVelocityPatterns();

    // Collaboration patterns
    await this.analyzeCollaborationPatterns();

    // Quality patterns
    await this.analyzeQualityPatterns();

    // Save patterns
    await this.savePatterns();

    this.emit('patterns-analyzed', {
      patterns: Array.from(this.patterns.values()),
      workflowPatterns: Array.from(this.workflowPatterns.values())
    });
  }

  /**
   * Analyze workflow patterns
   */
  private async analyzeWorkflowPatterns() {
    const sequences = this.extractEventSequences();
    
    for (const sequence of sequences) {
      const pattern = this.identifyWorkflowPattern(sequence);
      if (pattern && pattern.frequency > 3) {
        this.workflowPatterns.set(pattern.id, pattern);
      }
    }
  }

  /**
   * Extract meaningful event sequences
   */
  private extractEventSequences(): DevelopmentEvent[][] {
    const sequences: DevelopmentEvent[][] = [];
    const sessionGap = 30 * 60 * 1000; // 30 minutes
    
    let currentSequence: DevelopmentEvent[] = [];
    let lastEventTime = 0;

    for (const event of this.eventHistory) {
      const eventTime = new Date(event.timestamp).getTime();
      
      if (eventTime - lastEventTime > sessionGap && currentSequence.length > 0) {
        sequences.push([...currentSequence]);
        currentSequence = [];
      }
      
      currentSequence.push(event);
      lastEventTime = eventTime;
    }

    if (currentSequence.length > 0) {
      sequences.push(currentSequence);
    }

    return sequences;
  }

  /**
   * Identify workflow pattern from event sequence
   */
  private identifyWorkflowPattern(sequence: DevelopmentEvent[]): WorkflowPattern | null {
    if (sequence.length < 3) return null;

    const steps: WorkflowStep[] = sequence.map((event, index) => ({
      name: `${event.category}:${event.metadata?.action || 'unknown'}`,
      type: event.category,
      avgDuration: index > 0 && sequence[index - 1]
        ? new Date(event.timestamp).getTime() - new Date(sequence[index - 1].timestamp).getTime()
        : 0,
      dependencies: index > 0 ? [`step-${index - 1}`] : [],
      metadata: event.metadata || {}
    }));

    const patternId = this.generatePatternId(steps);
    const existingPattern = this.workflowPatterns.get(patternId);

    if (existingPattern) {
      // Update existing pattern
      return {
        ...existingPattern,
        frequency: existingPattern.frequency + 1,
        avgDuration: (existingPattern.avgDuration * existingPattern.frequency + this.calculateSequenceDuration(sequence)) / (existingPattern.frequency + 1)
      };
    }

    return {
      id: patternId,
      name: this.generatePatternName(steps),
      steps,
      frequency: 1,
      avgDuration: this.calculateSequenceDuration(sequence),
      successRate: 1.0
    };
  }

  /**
   * Analyze development velocity patterns
   */
  private async analyzeVelocityPatterns() {
    const commitPattern = this.analyzeCommitFrequency();
    if (commitPattern) {
      this.patterns.set('commit-frequency', commitPattern);
    }

    const productivityPattern = this.analyzeProductivityCycles();
    if (productivityPattern) {
      this.patterns.set('productivity-cycles', productivityPattern);
    }
  }

  /**
   * Analyze commit frequency patterns
   */
  private analyzeCommitFrequency(): Pattern | null {
    const gitEvents = this.eventHistory.filter(e => e.category === 'git' && e.metadata?.action === 'commit');
    
    if (gitEvents.length < 10) return null;

    const hourlyDistribution = new Array(24).fill(0);
    const dailyDistribution = new Array(7).fill(0);

    for (const event of gitEvents) {
      const date = new Date(event.timestamp);
      hourlyDistribution[date.getHours()]++;
      dailyDistribution[date.getDay()]++;
    }

    const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));
    const peakDay = dailyDistribution.indexOf(Math.max(...dailyDistribution));

    return {
      id: 'commit-frequency',
      name: 'Commit Frequency Pattern',
      description: `Most active at ${peakHour}:00, peak day: ${this.getDayName(peakDay)}`,
      category: PatternCategory.DEVELOPMENT,
      indicators: [
        { type: 'peak_hour', value: peakHour, weight: 0.7 },
        { type: 'peak_day', value: peakDay, weight: 0.3 }
      ],
      confidence: 0.8,
      frequency: gitEvents.length,
      lastSeen: new Date()
    };
  }

  /**
   * Analyze productivity cycles
   */
  private analyzeProductivityCycles(): Pattern | null {
    const fileEvents = this.eventHistory.filter(e => e.category === 'file');
    if (fileEvents.length < 50) return null;

    const hourlyActivity = new Array(24).fill(0);
    
    for (const event of fileEvents) {
      const hour = new Date(event.timestamp).getHours();
      hourlyActivity[hour]++;
    }

    // Find productivity windows
    const productiveHours = hourlyActivity
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > fileEvents.length / 24 * 1.5)
      .map(h => h.hour);

    if (productiveHours.length === 0) return null;

    return {
      id: 'productivity-cycles',
      name: 'Productivity Cycles',
      description: `High productivity hours: ${productiveHours.join(', ')}`,
      category: PatternCategory.WORKFLOW,
      indicators: productiveHours.map(hour => ({
        type: 'productive_hour',
        value: hour,
        weight: 1.0 / productiveHours.length
      })),
      confidence: 0.75,
      frequency: fileEvents.length,
      lastSeen: new Date()
    };
  }

  /**
   * Analyze collaboration patterns
   */
  private async analyzeCollaborationPatterns() {
    const aiEvents = this.eventHistory.filter(e => e.category === 'ai');
    const gitEvents = this.eventHistory.filter(e => e.category === 'git');

    if (aiEvents.length > 20) {
      const aiPattern = this.analyzeAIUsagePattern(aiEvents);
      if (aiPattern) {
        this.patterns.set('ai-collaboration', aiPattern);
      }
    }

    if (gitEvents.length > 10) {
      const branchPattern = this.analyzeBranchingPattern(gitEvents);
      if (branchPattern) {
        this.patterns.set('branching-strategy', branchPattern);
      }
    }
  }

  /**
   * Analyze AI usage patterns
   */
  private analyzeAIUsagePattern(aiEvents: DevelopmentEvent[]): Pattern | null {
    const toolUsage: Record<string, number> = {};
    const taskTypes: Record<string, number> = {};

    for (const event of aiEvents) {
      const tool = event.metadata?.tool || 'unknown';
      const task = event.metadata?.taskType || 'unknown';
      
      toolUsage[tool] = (toolUsage[tool] || 0) + 1;
      taskTypes[task] = (taskTypes[task] || 0) + 1;
    }

    const preferredTool = Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)[0]?.[0];
    
    const primaryTask = Object.entries(taskTypes)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    return {
      id: 'ai-collaboration',
      name: 'AI Collaboration Pattern',
      description: `Primary tool: ${preferredTool}, Main use: ${primaryTask}`,
      category: PatternCategory.COLLABORATION,
      indicators: [
        { type: 'preferred_tool', value: preferredTool, weight: 0.6 },
        { type: 'primary_task', value: primaryTask, weight: 0.4 }
      ],
      confidence: 0.85,
      frequency: aiEvents.length,
      lastSeen: new Date()
    };
  }

  /**
   * Analyze branching patterns
   */
  private analyzeBranchingPattern(gitEvents: DevelopmentEvent[]): Pattern | null {
    const branchEvents = gitEvents.filter(e => 
      e.metadata?.action === 'branch_create' || 
      e.metadata?.action === 'branch_switch'
    );

    if (branchEvents.length < 5) return null;

    const branchTypes: Record<string, number> = {};
    
    for (const event of branchEvents) {
      const branchName = event.metadata?.branch || '';
      const type = this.detectBranchType(branchName);
      branchTypes[type] = (branchTypes[type] || 0) + 1;
    }

    const primaryStrategy = Object.entries(branchTypes)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    return {
      id: 'branching-strategy',
      name: 'Branching Strategy Pattern',
      description: `Primary strategy: ${primaryStrategy}`,
      category: PatternCategory.WORKFLOW,
      indicators: [{
        type: 'branch_strategy',
        value: primaryStrategy,
        weight: 1.0
      }],
      confidence: 0.7,
      frequency: branchEvents.length,
      lastSeen: new Date()
    };
  }

  /**
   * Analyze quality patterns
   */
  private async analyzeQualityPatterns() {
    const testPattern = this.analyzeTestingPattern();
    if (testPattern) {
      this.patterns.set('testing-pattern', testPattern);
    }

    const refactoringPattern = this.analyzeRefactoringPattern();
    if (refactoringPattern) {
      this.patterns.set('refactoring-pattern', refactoringPattern);
    }
  }

  /**
   * Analyze testing patterns
   */
  private analyzeTestingPattern(): Pattern | null {
    const testEvents = this.eventHistory.filter(e => e.category === 'test');
    const fileEvents = this.eventHistory.filter(e => e.category === 'file');

    if (testEvents.length < 10 || fileEvents.length < 20) return null;

    const testToCodeRatio = testEvents.length / fileEvents.length;
    const testFirst = this.detectTestFirstDevelopment();

    return {
      id: 'testing-pattern',
      name: 'Testing Pattern',
      description: testFirst ? 'Test-First Development' : 'Test-After Development',
      category: PatternCategory.QUALITY,
      indicators: [
        { type: 'test_ratio', value: testToCodeRatio, weight: 0.5 },
        { type: 'test_first', value: testFirst ? 1 : 0, weight: 0.5 }
      ],
      confidence: 0.8,
      frequency: testEvents.length,
      lastSeen: new Date()
    };
  }

  /**
   * Detect test-first development pattern
   */
  private detectTestFirstDevelopment(): boolean {
    const sequences = this.extractEventSequences();
    let testFirstCount = 0;
    let totalSequences = 0;

    for (const sequence of sequences) {
      const hasTest = sequence.some(e => e.category === 'test');
      const hasCode = sequence.some(e => e.category === 'file' && !e.source?.includes('test'));
      
      if (hasTest && hasCode) {
        totalSequences++;
        const firstTestIndex = sequence.findIndex(e => e.category === 'test');
        const firstCodeIndex = sequence.findIndex(e => e.category === 'file' && !e.source?.includes('test'));
        
        if (firstTestIndex < firstCodeIndex) {
          testFirstCount++;
        }
      }
    }

    return totalSequences > 0 && (testFirstCount / totalSequences) > 0.6;
  }

  /**
   * Analyze refactoring patterns
   */
  private analyzeRefactoringPattern(): Pattern | null {
    const fileEvents = this.eventHistory.filter(e => e.category === 'file');
    const refactoringIndicators = fileEvents.filter(e => 
      e.metadata?.action === 'rename' ||
      e.metadata?.changes?.includes('refactor') ||
      e.metadata?.message?.toLowerCase().includes('refactor')
    );

    if (refactoringIndicators.length < 5) return null;

    const refactoringRate = refactoringIndicators.length / fileEvents.length;

    return {
      id: 'refactoring-pattern',
      name: 'Refactoring Pattern',
      description: `${(refactoringRate * 100).toFixed(1)}% of changes involve refactoring`,
      category: PatternCategory.QUALITY,
      indicators: [{
        type: 'refactoring_rate',
        value: refactoringRate,
        weight: 1.0
      }],
      confidence: 0.75,
      frequency: refactoringIndicators.length,
      lastSeen: new Date()
    };
  }

  /**
   * Helper methods
   */
  private detectRapidFileChanges() {
    const recentFileEvents = this.eventHistory
      .filter(e => e.category === 'file')
      .slice(-10);

    if (recentFileEvents.length < 5) return;

    const lastEvent = recentFileEvents[recentFileEvents.length - 1];
    const firstEvent = recentFileEvents[0];
    if (!lastEvent || !firstEvent) return;
    
    const timeSpan = new Date(lastEvent.timestamp).getTime() - new Date(firstEvent.timestamp).getTime();
    
    const changesPerMinute = (recentFileEvents.length / timeSpan) * 60000;

    if (changesPerMinute > 10) {
      this.emit('pattern-detected', {
        type: 'rapid-changes',
        description: 'Rapid file changes detected',
        rate: changesPerMinute
      });
    }
  }

  private detectTDDPattern() {
    const recentEvents = this.eventHistory.slice(-20);
    const testEvents = recentEvents.filter(e => e.category === 'test');
    const fileEvents = recentEvents.filter(e => e.category === 'file');

    if (testEvents.length > fileEvents.length * 0.4) {
      this.emit('pattern-detected', {
        type: 'tdd',
        description: 'Test-Driven Development pattern detected'
      });
    }
  }

  private detectDebuggingPattern() {
    const debugEvents = this.eventHistory
      .filter(e => e.metadata?.action === 'debug' || e.metadata?.tool === 'debugger')
      .slice(-5);

    if (debugEvents.length >= 3) {
      this.emit('pattern-detected', {
        type: 'debugging',
        description: 'Active debugging session detected'
      });
    }
  }

  private generatePatternId(steps: WorkflowStep[]): string {
    return steps.map(s => s.type).join('-');
  }

  private generatePatternName(steps: WorkflowStep[]): string {
    const types = steps.map(s => s.type);
    if (types.includes('test') && types.includes('file')) {
      return 'Test-Code Cycle';
    }
    if (types.includes('git') && types.includes('file')) {
      return 'Code-Commit Cycle';
    }
    return 'Custom Workflow';
  }

  private calculateSequenceDuration(sequence: DevelopmentEvent[]): number {
    if (sequence.length < 2) return 0;
    
    const firstEvent = sequence[0];
    const lastEvent = sequence[sequence.length - 1];
    if (!firstEvent || !lastEvent) return 0;
    
    const start = new Date(firstEvent.timestamp).getTime();
    const end = new Date(lastEvent.timestamp).getTime();
    
    return end - start;
  }

  private detectBranchType(branchName: string): string {
    const lowercased = branchName.toLowerCase();
    
    if (lowercased.includes('feature/')) return 'feature-branch';
    if (lowercased.includes('bugfix/') || lowercased.includes('fix/')) return 'bugfix-branch';
    if (lowercased.includes('hotfix/')) return 'hotfix-branch';
    if (lowercased.includes('release/')) return 'release-branch';
    if (lowercased === 'main' || lowercased === 'master') return 'main-branch';
    if (lowercased === 'develop' || lowercased === 'dev') return 'develop-branch';
    
    return 'custom-branch';
  }

  private getDayName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  }

  /**
   * Load patterns from storage
   */
  private async loadPatterns() {
    try {
      // Pattern 저장은 별도로 구현 필요 - 현재는 메모리에서만 관리
      // TODO: Add pattern persistence
    } catch (error) {
      console.error('Failed to load patterns:', error);
    }
  }

  /**
   * Save patterns to storage
   */
  private async savePatterns() {
    try {
      // Pattern 저장은 별도로 구현 필요 - 현재는 메모리에서만 관리
      // TODO: Add pattern persistence
    } catch (error) {
      console.error('Failed to save patterns:', error);
    }
  }

  /**
   * Get recognized patterns
   */
  getPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get workflow patterns
   */
  getWorkflowPatterns(): WorkflowPattern[] {
    return Array.from(this.workflowPatterns.values());
  }
}