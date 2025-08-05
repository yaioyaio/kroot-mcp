/**
 * Extended Rule Engine
 * 
 * Advanced rule processing with complex conditions and actions
 */

import { EventEmitter } from 'eventemitter3';
import {
  WorkflowRule,
  RuleTrigger,
  RuleCondition,
  RuleAction
} from './types';
import { DevelopmentEvent } from '../events/types';
import { StorageManager } from '../storage/manager';

export interface RuleContext {
  event?: DevelopmentEvent;
  metrics: Record<string, number>;
  variables: Record<string, any>;
  timestamp: Date;
  executionId: string;
}

export interface RuleExecutionResult {
  ruleId: string;
  executed: boolean;
  actions: ActionResult[];
  duration: number;
  error?: string;
}

export interface ActionResult {
  type: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

export interface AdvancedRule extends WorkflowRule {
  priority: number;
  category: string;
  tags: string[];
  schedule?: CronSchedule;
  rateLimiting?: RateLimit;
  contextFilters?: ContextFilter[];
}

export interface CronSchedule {
  expression: string;
  timezone?: string;
  description?: string;
}

export interface RateLimit {
  maxExecutions: number;
  timeWindow: number; // in milliseconds
  strategy: 'sliding' | 'fixed';
}

export interface ContextFilter {
  field: string;
  operator: string;
  value: any;
  negate?: boolean;
}

export class RuleEngine extends EventEmitter {
  private rules: Map<string, AdvancedRule> = new Map();
  private executionHistory: Map<string, Date[]> = new Map();
  private ruleProcessor: NodeJS.Timer | null = null;
  private scheduledRules: Map<string, NodeJS.Timer> = new Map();

  constructor(
    private storageManager: StorageManager
  ) {
    super();
    this.loadRules();
  }

  async start() {
    // Process rules every 30 seconds
    this.ruleProcessor = setInterval(() => {
      this.processScheduledRules();
    }, 30000);

    // Setup scheduled rules
    this.setupScheduledRules();

    console.log('⚙️ Rule engine started');
  }

  stop() {
    if (this.ruleProcessor) {
      clearInterval(this.ruleProcessor);
      this.ruleProcessor = null;
    }

    // Clear scheduled rules
    for (const timer of this.scheduledRules.values()) {
      clearInterval(timer);
    }
    this.scheduledRules.clear();

    console.log('🛑 Rule engine stopped');
  }

  /**
   * Register a new rule
   */
  async registerRule(rule: AdvancedRule): Promise<void> {
    // Validate rule
    this.validateRule(rule);

    this.rules.set(rule.id, rule);
    
    // Setup schedule if needed
    if (rule.schedule && rule.trigger.type === 'schedule') {
      this.setupRuleSchedule(rule);
    }

    await this.saveRules();
    this.emit('rule-registered', rule);
    
    console.log(`📜 Rule registered: ${rule.name}`);
  }

  /**
   * Process event-triggered rules
   */
  async processEvent(event: DevelopmentEvent): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = [];
    
    // Get event-triggered rules
    const eventRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled && rule.trigger.type === 'event')
      .sort((a, b) => b.priority - a.priority);

    for (const rule of eventRules) {
      try {
        const context: RuleContext = {
          event,
          metrics: {},
          variables: {},
          timestamp: new Date(),
          executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        };

        const result = await this.executeRule(rule, context);
        results.push(result);

        if (result.executed) {
          this.recordExecution(rule.id);
        }

      } catch (error) {
        console.error(`Error processing rule ${rule.id}:`, error);
        results.push({
          ruleId: rule.id,
          executed: false,
          actions: [],
          duration: 0,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Execute a specific rule
   */
  private async executeRule(rule: AdvancedRule, context: RuleContext): Promise<RuleExecutionResult> {
    const startTime = Date.now();

    try {
      // Check rate limiting
      if (rule.rateLimiting && !this.checkRateLimit(rule)) {
        return {
          ruleId: rule.id,
          executed: false,
          actions: [],
          duration: Date.now() - startTime,
          error: 'Rate limit exceeded'
        };
      }

      // Check context filters
      if (rule.contextFilters && !this.checkContextFilters(rule.contextFilters, context)) {
        return {
          ruleId: rule.id,
          executed: false,
          actions: [],
          duration: Date.now() - startTime,
          error: 'Context filters not met'
        };
      }

      // Evaluate conditions
      const conditionsMet = await this.evaluateConditions(rule.conditions, context);
      if (!conditionsMet) {
        return {
          ruleId: rule.id,
          executed: false,
          actions: [],
          duration: Date.now() - startTime
        };
      }

      // Execute actions
      const actionResults = await this.executeActions(rule.actions, context);

      const result: RuleExecutionResult = {
        ruleId: rule.id,
        executed: true,
        actions: actionResults,
        duration: Date.now() - startTime
      };

      this.emit('rule-executed', result);
      console.log(`✅ Rule executed: ${rule.name} (${result.duration}ms)`);

      return result;

    } catch (error) {
      return {
        ruleId: rule.id,
        executed: false,
        actions: [],
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Evaluate rule conditions
   */
  private async evaluateConditions(conditions: RuleCondition[], context: RuleContext): Promise<boolean> {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    let result = true;
    let lastCombinator = 'AND';

    for (const condition of conditions) {
      const conditionResult = await this.evaluateCondition(condition, context);
      
      if (lastCombinator === 'AND') {
        result = result && conditionResult;
      } else {
        result = result || conditionResult;
      }

      lastCombinator = condition.combineWith || 'AND';
    }

    return result;
  }

  /**
   * Evaluate single condition
   */
  private async evaluateCondition(condition: RuleCondition, context: RuleContext): Promise<boolean> {
    let actualValue: any;

    // Extract value from context
    if (condition.field.startsWith('event.')) {
      const field = condition.field.substring(6);
      actualValue = this.getNestedValue(context.event, field);
    } else if (condition.field.startsWith('metrics.')) {
      const field = condition.field.substring(8);
      actualValue = context.metrics[field];
    } else if (condition.field.startsWith('variables.')) {
      const field = condition.field.substring(10);
      actualValue = context.variables[field];
    } else {
      actualValue = this.getNestedValue(context, condition.field);
    }

    // Apply operator
    return this.applyOperator(actualValue, condition.operator, condition.value);
  }

  /**
   * Apply comparison operator
   */
  private applyOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator.toLowerCase()) {
      case 'equals':
      case '==':
      case '===':
        return actual === expected;

      case 'not_equals':
      case '!=':
      case '!==':
        return actual !== expected;

      case 'greater':
      case '>':
        return Number(actual) > Number(expected);

      case 'greater_equal':
      case '>=':
        return Number(actual) >= Number(expected);

      case 'less':
      case '<':
        return Number(actual) < Number(expected);

      case 'less_equal':
      case '<=':
        return Number(actual) <= Number(expected);

      case 'contains':
        return String(actual).includes(String(expected));

      case 'not_contains':
        return !String(actual).includes(String(expected));

      case 'starts_with':
        return String(actual).startsWith(String(expected));

      case 'ends_with':
        return String(actual).endsWith(String(expected));

      case 'regex':
      case 'matches':
        return new RegExp(expected).test(String(actual));

      case 'in':
        return Array.isArray(expected) && expected.includes(actual);

      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);

      case 'is_null':
        return actual === null || actual === undefined;

      case 'is_not_null':
        return actual !== null && actual !== undefined;

      case 'is_empty':
        return !actual || (Array.isArray(actual) && actual.length === 0) || 
               (typeof actual === 'object' && Object.keys(actual).length === 0);

      case 'is_not_empty':
        return !!actual && !(Array.isArray(actual) && actual.length === 0) && 
               !(typeof actual === 'object' && Object.keys(actual).length === 0);

      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Execute rule actions
   */
  private async executeActions(actions: RuleAction[], context: RuleContext): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    // Sort actions by order
    const sortedActions = [...actions].sort((a, b) => a.order - b.order);

    for (const action of sortedActions) {
      const actionResult = await this.executeAction(action, context);
      results.push(actionResult);

      // Stop on first failure if specified
      if (!actionResult.success && action.config.stopOnFailure) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute single action
   */
  private async executeAction(action: RuleAction, context: RuleContext): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      let result: any;

      switch (action.type) {
        case 'log':
          result = await this.executeLogAction(action, context);
          break;

        case 'notify':
          result = await this.executeNotifyAction(action, context);
          break;

        case 'set_variable':
          result = await this.executeSetVariableAction(action, context);
          break;

        case 'increment_metric':
          result = await this.executeIncrementMetricAction(action, context);
          break;

        case 'http_request':
          result = await this.executeHttpRequestAction(action, context);
          break;

        case 'delay':
          result = await this.executeDelayAction(action, context);
          break;

        case 'script':
          result = await this.executeScriptAction(action, context);
          break;

        case 'workflow':
          result = await this.executeWorkflowAction(action, context);
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      return {
        type: action.type,
        success: true,
        result,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        type: action.type,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Action executors
   */
  private async executeLogAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { level = 'info', message } = action.config;
    const interpolatedMessage = this.interpolateTemplate(message, context);
    
    console[level as keyof Console](interpolatedMessage);
    return { logged: true, level, message: interpolatedMessage };
  }

  private async executeNotifyAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { title, message, priority = 'medium', channels = ['dashboard'] } = action.config;
    
    this.emit('notification-required', {
      title: this.interpolateTemplate(title, context),
      message: this.interpolateTemplate(message, context),
      priority,
      channels: Array.isArray(channels) ? channels : [channels]
    });

    return { sent: true };
  }

  private async executeSetVariableAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { name, value, scope = 'local' } = action.config;
    const interpolatedValue = this.interpolateTemplate(value, context);
    
    if (scope === 'local') {
      context.variables[name] = interpolatedValue;
    } else {
      // Global variable storage would go here
    }

    return { variable: name, value: interpolatedValue, scope };
  }

  private async executeIncrementMetricAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { name, amount = 1 } = action.config;
    
    context.metrics[name] = (context.metrics[name] || 0) + amount;
    
    return { metric: name, value: context.metrics[name] };
  }

  private async executeHttpRequestAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { url, method = 'GET', headers = {}, body } = action.config;
    
    const response = await fetch(this.interpolateTemplate(url, context), {
      method,
      headers: this.interpolateObject(headers, context),
      body: body ? JSON.stringify(this.interpolateObject(body, context)) : undefined
    });

    const data = await response.json();
    return { status: response.status, data };
  }

  private async executeDelayAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { duration = 1000 } = action.config;
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    return { delayed: true, duration };
  }

  private async executeScriptAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { script, language = 'javascript' } = action.config;
    
    if (language === 'javascript') {
      const func = new Function('context', script);
      return func(context);
    }

    throw new Error(`Unsupported script language: ${language}`);
  }

  private async executeWorkflowAction(action: RuleAction, context: RuleContext): Promise<any> {
    const { workflowId, variables = {} } = action.config;
    
    this.emit('workflow-trigger', {
      workflowId,
      variables: this.interpolateObject(variables, context)
    });

    return { triggered: true, workflowId };
  }

  /**
   * Helper methods
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private interpolateTemplate(template: string, context: RuleContext): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  private interpolateObject(obj: any, context: RuleContext): any {
    if (typeof obj === 'string') {
      return this.interpolateTemplate(obj, context);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item, context));
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value, context);
      }
      return result;
    }
    
    return obj;
  }

  private checkRateLimit(rule: AdvancedRule): boolean {
    if (!rule.rateLimiting) return true;

    const executions = this.executionHistory.get(rule.id) || [];
    const now = Date.now();
    const windowStart = now - rule.rateLimiting.timeWindow;

    // Filter executions within time window
    const recentExecutions = executions.filter(time => time.getTime() > windowStart);

    return recentExecutions.length < rule.rateLimiting.maxExecutions;
  }

  private checkContextFilters(filters: ContextFilter[], context: RuleContext): boolean {
    for (const filter of filters) {
      const value = this.getNestedValue(context, filter.field);
      const result = this.applyOperator(value, filter.operator, filter.value);
      
      if (filter.negate ? result : !result) {
        return false;
      }
    }
    
    return true;
  }

  private recordExecution(ruleId: string): void {
    const executions = this.executionHistory.get(ruleId) || [];
    executions.push(new Date());
    
    // Keep only recent executions (last 24 hours)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentExecutions = executions.filter(time => time.getTime() > dayAgo);
    
    this.executionHistory.set(ruleId, recentExecutions);
  }

  private validateRule(rule: AdvancedRule): void {
    if (!rule.id || !rule.name) {
      throw new Error('Rule must have id and name');
    }

    if (!rule.trigger || !rule.trigger.type) {
      throw new Error('Rule must have a trigger');
    }

    if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
      throw new Error('Rule must have at least one action');
    }
  }

  private setupScheduledRules(): void {
    const scheduledRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled && rule.trigger.type === 'schedule' && rule.schedule);

    for (const rule of scheduledRules) {
      this.setupRuleSchedule(rule);
    }
  }

  private setupRuleSchedule(rule: AdvancedRule): void {
    if (!rule.schedule) return;

    // Simple interval-based scheduling (would use proper cron library in production)
    const interval = this.parseCronExpression(rule.schedule.expression);
    
    if (interval > 0) {
      const timer = setInterval(async () => {
        const context: RuleContext = {
          metrics: {},
          variables: {},
          timestamp: new Date(),
          executionId: `scheduled_${Date.now()}`
        };

        try {
          await this.executeRule(rule, context);
        } catch (error) {
          console.error(`Error executing scheduled rule ${rule.id}:`, error);
        }
      }, interval);

      this.scheduledRules.set(rule.id, timer);
    }
  }

  private parseCronExpression(expression: string): number {
    // Simple parser - in production would use proper cron library
    if (expression.includes('* * * * *')) return 60000; // Every minute
    if (expression.includes('0 * * * *')) return 3600000; // Every hour
    if (expression.includes('0 0 * * *')) return 86400000; // Every day
    
    return 0; // Invalid expression
  }

  private processScheduledRules(): void {
    // Scheduled rules are processed by their individual timers
    // This method could be used for additional scheduled rule logic
  }

  private async loadRules(): Promise<void> {
    try {
      const stored = await this.storageManager.get('advanced_rules');
      if (stored) {
        this.rules = new Map(Object.entries(stored));
      }
    } catch (error) {
      console.error('Failed to load rules:', error);
    }
  }

  private async saveRules(): Promise<void> {
    try {
      await this.storageManager.set('advanced_rules', Object.fromEntries(this.rules));
    } catch (error) {
      console.error('Failed to save rules:', error);
    }
  }

  /**
   * Public API methods
   */
  getRules(): AdvancedRule[] {
    return Array.from(this.rules.values());
  }

  getRule(id: string): AdvancedRule | undefined {
    return this.rules.get(id);
  }

  async updateRule(rule: AdvancedRule): Promise<void> {
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
    
    // Update schedule if needed
    if (rule.schedule && rule.trigger.type === 'schedule') {
      // Clear old schedule
      const oldTimer = this.scheduledRules.get(rule.id);
      if (oldTimer) {
        clearInterval(oldTimer);
      }
      
      // Setup new schedule
      this.setupRuleSchedule(rule);
    }

    await this.saveRules();
    this.emit('rule-updated', rule);
  }

  async deleteRule(id: string): Promise<void> {
    const rule = this.rules.get(id);
    if (rule) {
      this.rules.delete(id);
      
      // Clear schedule if exists
      const timer = this.scheduledRules.get(id);
      if (timer) {
        clearInterval(timer);
        this.scheduledRules.delete(id);
      }

      await this.saveRules();
      this.emit('rule-deleted', rule);
    }
  }

  async enableRule(id: string): Promise<void> {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = true;
      await this.updateRule(rule);
    }
  }

  async disableRule(id: string): Promise<void> {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = false;
      await this.updateRule(rule);
    }
  }

  getExecutionHistory(ruleId: string): Date[] {
    return this.executionHistory.get(ruleId) || [];
  }
}