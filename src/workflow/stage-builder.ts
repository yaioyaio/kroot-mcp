/**
 * Custom Stage Builder
 * 
 * Allows users to define custom workflow stages
 */

import { EventEmitter } from 'eventemitter3';
import {
  WorkflowStage,
  StageType,
  StageCondition,
  StageAction,
  StageTransition,
  ActionType
} from './types';

export interface CustomStageDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  inputs: StageInput[];
  outputs: StageOutput[];
  configurableFields: ConfigurableField[];
  defaultActions: StageAction[];
  validationRules: ValidationRule[];
}

export interface StageInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
  validation?: InputValidation;
}

export interface StageOutput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
}

export interface ConfigurableField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'json';
  required: boolean;
  options?: Array<{ value: any; label: string }>;
  description?: string;
  placeholder?: string;
  validation?: FieldValidation;
}

export interface InputValidation {
  min?: number;
  max?: number;
  pattern?: string;
  customValidator?: string;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ValidationRule {
  field: string;
  rule: string;
  message: string;
}

export class StageBuilder extends EventEmitter {
  private customStages: Map<string, CustomStageDefinition> = new Map();
  private stageTemplates: Map<string, WorkflowStage> = new Map();

  constructor() {
    super();
    this.initializeBuiltInStages();
  }

  /**
   * Initialize built-in stage types
   */
  private initializeBuiltInStages() {
    // File Monitor Stage
    this.registerCustomStage({
      id: 'file-monitor',
      name: 'File Monitor',
      description: 'Monitor file system changes',
      category: 'monitoring',
      icon: '📁',
      inputs: [
        {
          name: 'path',
          type: 'string',
          required: true,
          description: 'Path to monitor',
          validation: { pattern: '^[a-zA-Z0-9/._-]+$' }
        },
        {
          name: 'patterns',
          type: 'array',
          required: false,
          description: 'File patterns to watch',
          default: ['**/*']
        }
      ],
      outputs: [
        {
          name: 'changedFiles',
          type: 'array',
          description: 'List of changed files'
        },
        {
          name: 'changeType',
          type: 'string',
          description: 'Type of change (add, modify, delete)'
        }
      ],
      configurableFields: [
        {
          key: 'path',
          label: 'Monitor Path',
          type: 'text',
          required: true,
          description: 'Enter the path to monitor for changes'
        },
        {
          key: 'includePatterns',
          label: 'Include Patterns',
          type: 'textarea',
          required: false,
          placeholder: '**/*.ts\n**/*.js\n**/*.json',
          description: 'File patterns to include (one per line)'
        },
        {
          key: 'excludePatterns',
          label: 'Exclude Patterns',
          type: 'textarea',
          required: false,
          placeholder: 'node_modules/**\n.git/**',
          description: 'File patterns to exclude (one per line)'
        }
      ],
      defaultActions: [
        {
          type: ActionType.LOG,
          parameters: { level: 'info', message: 'File change detected: {{changedFiles}}' },
          async: false
        }
      ],
      validationRules: [
        {
          field: 'path',
          rule: 'required',
          message: 'Monitor path is required'
        }
      ]
    });

    // Git Monitor Stage
    this.registerCustomStage({
      id: 'git-monitor',
      name: 'Git Monitor',
      description: 'Monitor Git repository changes',
      category: 'git',
      icon: '🔀',
      inputs: [
        {
          name: 'repository',
          type: 'string',
          required: true,
          description: 'Git repository path'
        },
        {
          name: 'branches',
          type: 'array',
          required: false,
          description: 'Branches to monitor',
          default: ['main', 'develop']
        }
      ],
      outputs: [
        {
          name: 'commits',
          type: 'array',
          description: 'New commits'
        },
        {
          name: 'branches',
          type: 'array',
          description: 'Changed branches'
        }
      ],
      configurableFields: [
        {
          key: 'repository',
          label: 'Repository Path',
          type: 'text',
          required: true,
          description: 'Path to the Git repository'
        },
        {
          key: 'watchBranches',
          label: 'Watch Branches',
          type: 'textarea',
          required: false,
          placeholder: 'main\ndevelop\nfeature/*',
          description: 'Branches to monitor (one per line, supports wildcards)'
        }
      ],
      defaultActions: [
        {
          type: ActionType.NOTIFY,
          parameters: { 
            channel: 'git', 
            message: 'Git activity detected: {{commits.length}} new commits',
            priority: 'medium'
          },
          async: false
        }
      ],
      validationRules: []
    });

    // Test Runner Stage
    this.registerCustomStage({
      id: 'test-runner',
      name: 'Test Runner',
      description: 'Run automated tests',
      category: 'testing',
      icon: '🧪',
      inputs: [
        {
          name: 'testCommand',
          type: 'string',
          required: true,
          description: 'Command to run tests'
        },
        {
          name: 'testPath',
          type: 'string',
          required: false,
          description: 'Path to test files'
        }
      ],
      outputs: [
        {
          name: 'testResults',
          type: 'object',
          description: 'Test execution results'
        },
        {
          name: 'passed',
          type: 'boolean',
          description: 'Whether all tests passed'
        }
      ],
      configurableFields: [
        {
          key: 'testCommand',
          label: 'Test Command',
          type: 'text',
          required: true,
          placeholder: 'npm test',
          description: 'Command to execute tests'
        },
        {
          key: 'timeout',
          label: 'Timeout (seconds)',
          type: 'number',
          required: false,
          description: 'Maximum time to wait for tests'
        },
        {
          key: 'failOnError',
          label: 'Fail on Test Errors',
          type: 'checkbox',
          required: false,
          description: 'Stop workflow if tests fail'
        }
      ],
      defaultActions: [
        {
          type: ActionType.METRIC,
          parameters: { name: 'tests_run', operation: 'increment' },
          async: false
        }
      ],
      validationRules: [
        {
          field: 'testCommand',
          rule: 'required',
          message: 'Test command is required'
        }
      ]
    });

    // Notification Stage
    this.registerCustomStage({
      id: 'notification',
      name: 'Notification',
      description: 'Send notifications',
      category: 'communication',
      icon: '🔔',
      inputs: [
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'Notification message'
        },
        {
          name: 'channels',
          type: 'array',
          required: false,
          description: 'Notification channels',
          default: ['dashboard']
        }
      ],
      outputs: [
        {
          name: 'sent',
          type: 'boolean',
          description: 'Whether notification was sent'
        }
      ],
      configurableFields: [
        {
          key: 'title',
          label: 'Notification Title',
          type: 'text',
          required: false,
          description: 'Title for the notification'
        },
        {
          key: 'message',
          label: 'Message',
          type: 'textarea',
          required: true,
          description: 'Notification message content'
        },
        {
          key: 'priority',
          label: 'Priority',
          type: 'select',
          required: false,
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' }
          ],
          description: 'Notification priority level'
        },
        {
          key: 'channels',
          label: 'Channels',
          type: 'textarea',
          required: false,
          placeholder: 'dashboard\nslack\nemail',
          description: 'Notification channels (one per line)'
        }
      ],
      defaultActions: [
        {
          type: ActionType.NOTIFY,
          parameters: {
            title: '{{title}}',
            message: '{{message}}',
            priority: '{{priority}}',
            channels: '{{channels}}'
          },
          async: false
        }
      ],
      validationRules: [
        {
          field: 'message',
          rule: 'required',
          message: 'Notification message is required'
        }
      ]
    });

    // Decision Stage
    this.registerCustomStage({
      id: 'decision',
      name: 'Decision',
      description: 'Make conditional decisions',
      category: 'logic',
      icon: '🤔',
      inputs: [
        {
          name: 'condition',
          type: 'string',
          required: true,
          description: 'Decision condition'
        },
        {
          name: 'value',
          type: 'string',
          required: true,
          description: 'Value to evaluate'
        }
      ],
      outputs: [
        {
          name: 'result',
          type: 'boolean',
          description: 'Decision result'
        }
      ],
      configurableFields: [
        {
          key: 'field',
          label: 'Field to Check',
          type: 'text',
          required: true,
          description: 'Field or variable to evaluate'
        },
        {
          key: 'operator',
          label: 'Operator',
          type: 'select',
          required: true,
          options: [
            { value: 'equals', label: 'Equals' },
            { value: 'contains', label: 'Contains' },
            { value: 'greater', label: 'Greater Than' },
            { value: 'less', label: 'Less Than' },
            { value: 'regex', label: 'Matches Regex' }
          ],
          description: 'Comparison operator'
        },
        {
          key: 'value',
          label: 'Value',
          type: 'text',
          required: true,
          description: 'Value to compare against'
        }
      ],
      defaultActions: [
        {
          type: ActionType.LOG,
          parameters: { level: 'info', message: 'Decision result: {{result}}' },
          async: false
        }
      ],
      validationRules: [
        {
          field: 'field',
          rule: 'required',
          message: 'Field to check is required'
        },
        {
          field: 'operator',
          rule: 'required',
          message: 'Operator is required'
        }
      ]
    });
  }

  /**
   * Register a custom stage definition
   */
  registerCustomStage(definition: CustomStageDefinition): void {
    this.customStages.set(definition.id, definition);
    this.emit('custom-stage-registered', definition);
    console.log(`📋 Custom stage registered: ${definition.name}`);
  }

  /**
   * Build a workflow stage from custom definition
   */
  buildStage(
    stageId: string, 
    definitionId: string, 
    configuration: Record<string, any>
  ): WorkflowStage {
    const definition = this.customStages.get(definitionId);
    if (!definition) {
      throw new Error(`Custom stage definition not found: ${definitionId}`);
    }

    // Validate configuration
    this.validateConfiguration(definition, configuration);

    // Build conditions from inputs
    const conditions: StageCondition[] = [];
    for (const input of definition.inputs) {
      if (input.required && configuration[input.name] === undefined) {
        conditions.push({
          type: 'custom',
          operator: 'equals',
          field: input.name,
          value: input.default || null,
          description: `Required input: ${input.description}`
        });
      }
    }

    // Build actions from default actions and configuration
    const actions: StageAction[] = [...definition.defaultActions];
    
    // Process configurable fields into action parameters
    for (const field of definition.configurableFields) {
      const value = configuration[field.key];
      if (value !== undefined) {
        // Update action parameters with configured values
        for (const action of actions) {
          if (action.parameters[field.key] !== undefined) {
            action.parameters[field.key] = value;
          }
        }
      }
    }

    // Create the workflow stage
    const stage: WorkflowStage = {
      id: stageId,
      name: `${definition.name} (${stageId})`,
      type: this.mapCategoryToStageType(definition.category),
      conditions,
      actions,
      transitions: [], // Will be configured separately
      customFields: {
        definitionId,
        category: definition.category,
        icon: definition.icon,
        configuration
      }
    };

    this.stageTemplates.set(stageId, stage);
    this.emit('stage-built', stage);

    return stage;
  }

  /**
   * Validate configuration against definition
   */
  private validateConfiguration(definition: CustomStageDefinition, configuration: Record<string, any>): void {
    // Check required fields
    for (const field of definition.configurableFields) {
      if (field.required && configuration[field.key] === undefined) {
        throw new Error(`Required field missing: ${field.key}`);
      }

      const value = configuration[field.key];
      if (value !== undefined) {
        // Validate field value
        this.validateFieldValue(field, value);
      }
    }

    // Run custom validation rules
    for (const rule of definition.validationRules) {
      this.validateRule(rule, configuration);
    }
  }

  /**
   * Validate individual field value
   */
  private validateFieldValue(field: ConfigurableField, value: any): void {
    const validation = field.validation;
    if (!validation) return;

    if (validation.required && (value === undefined || value === null || value === '')) {
      throw new Error(`Field ${field.key} is required`);
    }

    if (validation.min !== undefined && typeof value === 'number' && value < validation.min) {
      throw new Error(`Field ${field.key} must be at least ${validation.min}`);
    }

    if (validation.max !== undefined && typeof value === 'number' && value > validation.max) {
      throw new Error(`Field ${field.key} must be at most ${validation.max}`);
    }

    if (validation.pattern && typeof value === 'string' && !new RegExp(validation.pattern).test(value)) {
      throw new Error(`Field ${field.key} does not match required pattern`);
    }
  }

  /**
   * Validate custom rule
   */
  private validateRule(rule: ValidationRule, configuration: Record<string, any>): void {
    const value = configuration[rule.field];

    switch (rule.rule) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          throw new Error(rule.message);
        }
        break;

      case 'numeric':
        if (isNaN(Number(value))) {
          throw new Error(rule.message);
        }
        break;

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error(rule.message);
        }
        break;

      default:
        console.warn(`Unknown validation rule: ${rule.rule}`);
    }
  }

  /**
   * Map category to stage type
   */
  private mapCategoryToStageType(category: string): StageType {
    switch (category) {
      case 'logic':
        return StageType.DECISION;
      case 'communication':
      case 'monitoring':
      case 'testing':
      case 'git':
        return StageType.PROCESS;
      default:
        return StageType.CUSTOM;
    }
  }

  /**
   * Create stage template from configuration
   */
  createTemplate(
    name: string,
    description: string,
    stageConfigs: Array<{ definitionId: string; configuration: Record<string, any> }>
  ): void {
    const stages: WorkflowStage[] = [];

    for (let i = 0; i < stageConfigs.length; i++) {
      const { definitionId, configuration } = stageConfigs[i];
      const stageId = `stage_${i + 1}`;
      
      const stage = this.buildStage(stageId, definitionId, configuration);
      
      // Add transitions to next stage
      if (i < stageConfigs.length - 1) {
        stage.transitions.push({
          to: `stage_${i + 2}`,
          priority: 1
        });
      }

      stages.push(stage);
    }

    // Create template workflow stage
    const templateStage: WorkflowStage = {
      id: `template_${Date.now()}`,
      name,
      type: StageType.CUSTOM,
      conditions: [],
      actions: [{
        type: ActionType.LOG,
        parameters: { level: 'info', message: `Template ${name} executed` },
        async: false
      }],
      transitions: [],
      customFields: {
        isTemplate: true,
        description,
        stages
      }
    };

    this.stageTemplates.set(templateStage.id, templateStage);
    this.emit('template-created', templateStage);
  }

  /**
   * Get available custom stage definitions
   */
  getCustomStageDefinitions(): CustomStageDefinition[] {
    return Array.from(this.customStages.values());
  }

  /**
   * Get custom stage definition by ID
   */
  getCustomStageDefinition(id: string): CustomStageDefinition | undefined {
    return this.customStages.get(id);
  }

  /**
   * Get built stage templates
   */
  getStageTemplates(): WorkflowStage[] {
    return Array.from(this.stageTemplates.values());
  }

  /**
   * Get stage template by ID
   */
  getStageTemplate(id: string): WorkflowStage | undefined {
    return this.stageTemplates.get(id);
  }

  /**
   * Generate stage configuration form schema
   */
  generateConfigurationSchema(definitionId: string): any {
    const definition = this.customStages.get(definitionId);
    if (!definition) {
      throw new Error(`Definition not found: ${definitionId}`);
    }

    const schema = {
      title: definition.name,
      description: definition.description,
      type: 'object',
      properties: {} as Record<string, any>,
      required: [] as string[]
    };

    for (const field of definition.configurableFields) {
      schema.properties[field.key] = {
        title: field.label,
        description: field.description,
        type: this.mapFieldTypeToSchemaType(field.type),
        ...(field.options && { enum: field.options.map(o => o.value) }),
        ...(field.placeholder && { placeholder: field.placeholder })
      };

      if (field.required) {
        schema.required.push(field.key);
      }
    }

    return schema;
  }

  /**
   * Map field type to JSON schema type
   */
  private mapFieldTypeToSchemaType(fieldType: string): string {
    switch (fieldType) {
      case 'number':
        return 'number';
      case 'checkbox':
        return 'boolean';
      case 'textarea':
      case 'text':
      case 'select':
        return 'string';
      case 'json':
        return 'object';
      default:
        return 'string';
    }
  }
}