/**
 * Workflow Engine
 * 
 * Executes custom user-defined workflows
 */

import { EventEmitter } from 'eventemitter3';
import {
  Workflow,
  WorkflowStage,
  WorkflowExecution,
  ExecutionStatus,
  ExecutionContext,
  ExecutionHistoryItem,
  StageCondition,
  StageAction,
  ActionType
} from './types';
import { StorageManager } from '../storage/manager';
import { EventEngine } from '../events/engine';
import { NotificationEngine } from '../notifications/notification-engine';

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private executionInterval: NodeJS.Timer | null = null;

  constructor(
    private storageManager: StorageManager,
    private eventEngine: EventEngine,
    private notificationEngine: NotificationEngine
  ) {
    super();
    this.loadWorkflows();
  }

  async start() {
    // Process executions every 10 seconds
    this.executionInterval = setInterval(() => {
      this.processExecutions();
    }, 10000);

    // Listen for workflow trigger events
    this.eventEngine.on('*', (event) => {
      this.handleTriggerEvent(event);
    });

    console.log('🔄 Workflow engine started');
  }

  stop() {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }
    console.log('🛑 Workflow engine stopped');
  }

  /**
   * Register a new workflow
   */
  async registerWorkflow(workflow: Workflow): Promise<void> {
    this.workflows.set(workflow.id, workflow);
    await this.saveWorkflows();
    
    this.emit('workflow-registered', workflow);
    console.log(`📋 Workflow registered: ${workflow.name}`);
  }

  /**
   * Start workflow execution
   */
  async startExecution(workflowId: string, context: Partial<ExecutionContext> = {}): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startStage = workflow.stages.find(s => s.type === 'start')?.id || workflow.stages[0]?.id;

    if (!startStage) {
      throw new Error('No start stage found in workflow');
    }

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: ExecutionStatus.PENDING,
      currentStage: startStage,
      startTime: new Date(),
      context: {
        variables: context.variables || {},
        metrics: context.metrics || {},
        errors: context.errors || []
      },
      history: []
    };

    this.executions.set(executionId, execution);
    this.emit('execution-started', execution);
    
    console.log(`▶️ Started execution ${executionId} for workflow ${workflow.name}`);
    return executionId;
  }

  /**
   * Process all running executions
   */
  private async processExecutions() {
    const runningExecutions = Array.from(this.executions.values())
      .filter(e => e.status === ExecutionStatus.RUNNING || e.status === ExecutionStatus.PENDING);

    for (const execution of runningExecutions) {
      try {
        await this.processExecution(execution);
      } catch (error) {
        console.error(`Error processing execution ${execution.id}:`, error);
        await this.failExecution(execution, error as Error);
      }
    }
  }

  /**
   * Process single execution
   */
  private async processExecution(execution: WorkflowExecution) {
    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${execution.workflowId}`);
    }

    const currentStage = workflow.stages.find(s => s.id === execution.currentStage);
    if (!currentStage) {
      throw new Error(`Stage not found: ${execution.currentStage}`);
    }

    // Mark as running if pending
    if (execution.status === ExecutionStatus.PENDING) {
      execution.status = ExecutionStatus.RUNNING;
    }

    // Check stage conditions
    const conditionsMet = await this.checkStageConditions(currentStage, execution);
    if (!conditionsMet) {
      return; // Wait for conditions to be met
    }

    // Execute stage actions
    const actionResults = await this.executeStageActions(currentStage, execution);

    // Record history
    this.recordStageExecution(execution, currentStage, actionResults);

    // Determine next stage
    const nextStage = await this.determineNextStage(currentStage, execution);
    
    if (nextStage) {
      execution.currentStage = nextStage;
      console.log(`🔄 Execution ${execution.id} moved to stage: ${nextStage}`);
    } else {
      // No next stage, execution complete
      await this.completeExecution(execution);
    }

    this.emit('execution-progress', execution);
  }

  /**
   * Check if stage conditions are met
   */
  private async checkStageConditions(stage: WorkflowStage, execution: WorkflowExecution): Promise<boolean> {
    if (!stage.conditions || stage.conditions.length === 0) {
      return true; // No conditions, always proceed
    }

    for (const condition of stage.conditions) {
      const result = await this.evaluateCondition(condition, execution);
      if (!result) {
        return false; // All conditions must be met
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(condition: StageCondition, execution: WorkflowExecution): Promise<boolean> {
    let actualValue: any;

    switch (condition.type) {
      case 'event':
        // Check if specific event occurred
        const recentEvents = await this.getRecentEvents();
        actualValue = recentEvents.some(e => e[condition.field] === condition.value);
        break;

      case 'metric':
        actualValue = execution.context.metrics[condition.field];
        break;

      case 'time':
        actualValue = new Date();
        break;

      case 'custom':
        actualValue = execution.context.variables[condition.field];
        break;

      default:
        return false;
    }

    return this.compareValues(actualValue, condition.operator, condition.value);
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'greater':
        return Number(actual) > Number(expected);
      case 'less':
        return Number(actual) < Number(expected);
      case 'regex':
        return new RegExp(expected).test(String(actual));
      default:
        return false;
    }
  }

  /**
   * Execute stage actions
   */
  private async executeStageActions(stage: WorkflowStage, execution: WorkflowExecution): Promise<any[]> {
    const results: any[] = [];

    for (const action of stage.actions) {
      try {
        const result = await this.executeAction(action, execution);
        results.push(result);
      } catch (error) {
        console.error(`Action failed in stage ${stage.id}:`, error);
        execution.context.errors.push({
          stage: stage.id,
          error: (error as Error).message,
          timestamp: new Date(),
          recoverable: this.isRecoverableError(error as Error)
        });
        
        if (!this.isRecoverableError(error as Error)) {
          throw error; // Stop execution on non-recoverable errors
        }
      }
    }

    return results;
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const startTime = Date.now();

    try {
      let result: any;

      switch (action.type) {
        case ActionType.NOTIFY:
          result = await this.executeNotifyAction(action, execution);
          break;

        case ActionType.LOG:
          result = await this.executeLogAction(action, execution);
          break;

        case ActionType.METRIC:
          result = await this.executeMetricAction(action, execution);
          break;

        case ActionType.API_CALL:
          result = await this.executeApiCallAction(action, execution);
          break;

        case ActionType.SCRIPT:
          result = await this.executeScriptAction(action, execution);
          break;

        case ActionType.TOOL:
          result = await this.executeToolAction(action, execution);
          break;

        case ActionType.CUSTOM:
          result = await this.executeCustomAction(action, execution);
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Action ${action.type} completed in ${duration}ms`);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Action ${action.type} failed after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Execute notify action
   */
  private async executeNotifyAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { channel, message, priority } = action.parameters;
    
    await this.notificationEngine.sendNotification({
      title: 'Workflow Notification',
      message: this.interpolateVariables(message, execution.context.variables),
      priority: priority || 'medium',
      channels: [channel || 'dashboard']
    });

    return { sent: true, channel, message };
  }

  /**
   * Execute log action
   */
  private async executeLogAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { level, message } = action.parameters;
    const interpolatedMessage = this.interpolateVariables(message, execution.context.variables);
    
    console.log(`[${level?.toUpperCase() || 'INFO'}] ${interpolatedMessage}`);
    
    return { logged: true, level, message: interpolatedMessage };
  }

  /**
   * Execute metric action
   */
  private async executeMetricAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { name, value, operation = 'set' } = action.parameters;
    
    switch (operation) {
      case 'set':
        execution.context.metrics[name] = value;
        break;
      case 'increment':
        execution.context.metrics[name] = (execution.context.metrics[name] || 0) + (value || 1);
        break;
      case 'decrement':
        execution.context.metrics[name] = (execution.context.metrics[name] || 0) - (value || 1);
        break;
    }

    return { metric: name, value: execution.context.metrics[name], operation };
  }

  /**
   * Execute API call action
   */
  private async executeApiCallAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { url, method = 'GET', headers = {}, body } = action.parameters;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    return { status: response.status, data };
  }

  /**
   * Execute script action
   */
  private async executeScriptAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { script, language = 'javascript' } = action.parameters;
    
    if (language === 'javascript') {
      // Safely execute JavaScript in limited context
      const context = {
        variables: execution.context.variables,
        metrics: execution.context.metrics,
        console: { log: console.log }
      };
      
      const func = new Function('context', script);
      return func(context);
    }

    throw new Error(`Unsupported script language: ${language}`);
  }

  /**
   * Execute tool action
   */
  private async executeToolAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    const { tool, parameters } = action.parameters;
    
    // This would integrate with the MCP tool system
    console.log(`Executing tool: ${tool}`, parameters);
    return { tool, executed: true };
  }

  /**
   * Execute custom action
   */
  private async executeCustomAction(action: StageAction, execution: WorkflowExecution): Promise<any> {
    // Custom actions can be extended by plugins
    const { handler, parameters } = action.parameters;
    
    console.log(`Executing custom action: ${handler}`, parameters);
    return { custom: true, handler, parameters };
  }

  /**
   * Record stage execution in history
   */
  private recordStageExecution(execution: WorkflowExecution, stage: WorkflowStage, results: any[]) {
    const historyItem: ExecutionHistoryItem = {
      stage: stage.id,
      action: `execute_${stage.type}`,
      timestamp: new Date(),
      duration: 0, // Would be calculated properly
      result: results
    };

    execution.history.push(historyItem);
  }

  /**
   * Determine next stage based on transitions
   */
  private async determineNextStage(currentStage: WorkflowStage, execution: WorkflowExecution): Promise<string | null> {
    if (!currentStage.transitions || currentStage.transitions.length === 0) {
      return null; // No transitions, end execution
    }

    // Sort transitions by priority
    const sortedTransitions = [...currentStage.transitions].sort((a, b) => b.priority - a.priority);

    for (const transition of sortedTransitions) {
      if (!transition.condition) {
        return transition.to; // Unconditional transition
      }

      const conditionMet = await this.evaluateCondition(transition.condition, execution);
      if (conditionMet) {
        return transition.to;
      }
    }

    return null; // No valid transition found
  }

  /**
   * Complete execution
   */
  private async completeExecution(execution: WorkflowExecution) {
    execution.status = ExecutionStatus.COMPLETED;
    execution.endTime = new Date();
    
    this.emit('execution-completed', execution);
    console.log(`✅ Execution ${execution.id} completed`);
  }

  /**
   * Fail execution
   */
  private async failExecution(execution: WorkflowExecution, error: Error) {
    execution.status = ExecutionStatus.FAILED;
    execution.endTime = new Date();
    execution.context.errors.push({
      stage: execution.currentStage,
      error: error.message,
      timestamp: new Date(),
      recoverable: false
    });

    this.emit('execution-failed', execution);
    console.error(`❌ Execution ${execution.id} failed:`, error.message);
  }

  /**
   * Handle trigger events
   */
  private handleTriggerEvent(event: any) {
    // Check if any workflows should be triggered by this event
    for (const workflow of this.workflows.values()) {
      for (const rule of workflow.rules) {
        if (rule.enabled && rule.trigger.type === 'event') {
          const shouldTrigger = this.shouldTriggerWorkflow(rule, event);
          if (shouldTrigger) {
            this.startExecution(workflow.id, {
              variables: { triggerEvent: event }
            }).catch(console.error);
          }
        }
      }
    }
  }

  /**
   * Check if workflow should be triggered
   */
  private shouldTriggerWorkflow(rule: any, event: any): boolean {
    // Simple trigger logic - can be extended
    const { eventType, conditions } = rule.trigger.config;
    
    if (eventType && event.type !== eventType) {
      return false;
    }

    if (conditions) {
      for (const condition of conditions) {
        if (!this.compareValues(event[condition.field], condition.operator, condition.value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Helper methods
   */
  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  private isRecoverableError(error: Error): boolean {
    // Simple logic - network errors are recoverable, syntax errors are not
    return error.message.includes('network') || error.message.includes('timeout');
  }

  private async getRecentEvents(): Promise<any[]> {
    // This would fetch recent events from the event engine
    return [];
  }

  private async loadWorkflows() {
    try {
      const stored = await this.storageManager.get('workflows');
      if (stored) {
        this.workflows = new Map(Object.entries(stored));
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  }

  private async saveWorkflows() {
    try {
      await this.storageManager.set('workflows', Object.fromEntries(this.workflows));
    } catch (error) {
      console.error('Failed to save workflows:', error);
    }
  }

  /**
   * Public API methods
   */
  getWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  getActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.status === ExecutionStatus.RUNNING || e.status === ExecutionStatus.PENDING);
  }

  async pauseExecution(id: string): Promise<void> {
    const execution = this.executions.get(id);
    if (execution && execution.status === ExecutionStatus.RUNNING) {
      execution.status = ExecutionStatus.PAUSED;
      this.emit('execution-paused', execution);
    }
  }

  async resumeExecution(id: string): Promise<void> {
    const execution = this.executions.get(id);
    if (execution && execution.status === ExecutionStatus.PAUSED) {
      execution.status = ExecutionStatus.RUNNING;
      this.emit('execution-resumed', execution);
    }
  }

  async cancelExecution(id: string): Promise<void> {
    const execution = this.executions.get(id);
    if (execution && execution.status !== ExecutionStatus.COMPLETED && execution.status !== ExecutionStatus.FAILED) {
      execution.status = ExecutionStatus.CANCELLED;
      execution.endTime = new Date();
      this.emit('execution-cancelled', execution);
    }
  }
}