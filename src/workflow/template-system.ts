/**
 * Workflow Template System
 * 
 * Provides pre-built workflow templates and template management
 */

import { EventEmitter } from 'eventemitter3';
import {
  Workflow,
  WorkflowTemplate,
  TemplateVariable,
  TemplateExample,
  WorkflowStage
} from './types';
import { StorageManager } from '../storage/index.js';
import { StageBuilder } from './stage-builder';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  tags: string[];
  author: string;
  version: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedSetupTime: number; // in minutes
  requirements: string[];
  variables: TemplateVariable[];
  stages: StageTemplate[];
  examples: TemplateExample[];
  documentation?: TemplateDocumentation;
}

export interface StageTemplate {
  id: string;
  name: string;
  definitionId: string;
  configuration: Record<string, any>;
  conditions?: any[];
  transitions?: any[];
}

export interface TemplateDocumentation {
  overview: string;
  setupInstructions: string[];
  useCases: string[];
  troubleshooting: TroubleshootingItem[];
}

export interface TroubleshootingItem {
  issue: string;
  solution: string;
  relatedFields?: string[];
}

export interface TemplateInstantiationOptions {
  name: string;
  description?: string;
  variables: Record<string, any>;
  customizations?: {
    skipStages?: string[];
    additionalStages?: StageTemplate[];
    stageOverrides?: Record<string, any>;
  };
}

export class TemplateSystem extends EventEmitter {
  private templates: Map<string, TemplateDefinition> = new Map();
  private instantiatedWorkflows: Map<string, string> = new Map(); // templateId -> workflowId

  constructor(
    private _storageManager: StorageManager,
    private stageBuilder: StageBuilder
  ) {
    super();
    this.initializeBuiltInTemplates();
    this.loadTemplates();
  }

  /**
   * Initialize built-in workflow templates
   */
  private initializeBuiltInTemplates() {
    // CI/CD Pipeline Template
    this.registerTemplate({
      id: 'cicd-pipeline',
      name: 'CI/CD Pipeline',
      description: 'Automated continuous integration and deployment pipeline',
      category: 'deployment',
      icon: '🚀',
      tags: ['cicd', 'automation', 'deployment', 'testing'],
      author: 'DevFlow Monitor',
      version: '1.0.0',
      difficulty: 'intermediate',
      estimatedSetupTime: 15,
      requirements: ['Git repository', 'Test suite', 'Deployment target'],
      variables: [
        {
          name: 'repositoryPath',
          type: 'string',
          required: true,
          description: 'Path to Git repository',
          default: './'
        },
        {
          name: 'testCommand',
          type: 'string',
          required: true,
          description: 'Command to run tests',
          default: 'npm test'
        },
        {
          name: 'buildCommand',
          type: 'string',
          required: true,
          description: 'Command to build project',
          default: 'npm run build'
        },
        {
          name: 'deploymentTarget',
          type: 'string',
          required: false,
          description: 'Deployment target environment',
          default: 'staging'
        },
        {
          name: 'notificationChannel',
          type: 'string',
          required: false,
          description: 'Notification channel for status updates',
          default: 'slack'
        }
      ],
      stages: [
        {
          id: 'git-trigger',
          name: 'Git Change Detection',
          definitionId: 'git-monitor',
          configuration: {
            repository: '{{repositoryPath}}',
            watchBranches: 'main\ndevelop'
          }
        },
        {
          id: 'run-tests',
          name: 'Run Tests',
          definitionId: 'test-runner',
          configuration: {
            testCommand: '{{testCommand}}',
            timeout: 300,
            failOnError: true
          }
        },
        {
          id: 'build-project',
          name: 'Build Project',
          definitionId: 'script-runner',
          configuration: {
            command: '{{buildCommand}}',
            workingDirectory: '{{repositoryPath}}'
          }
        },
        {
          id: 'deploy',
          name: 'Deploy to {{deploymentTarget}}',
          definitionId: 'deployment',
          configuration: {
            target: '{{deploymentTarget}}',
            artifacts: 'dist/**/*'
          }
        },
        {
          id: 'notify-success',
          name: 'Success Notification',
          definitionId: 'notification',
          configuration: {
            title: 'Deployment Successful',
            message: 'Successfully deployed to {{deploymentTarget}}',
            priority: 'high',
            channels: '{{notificationChannel}}'
          }
        }
      ],
      examples: [
        {
          name: 'Node.js Web App',
          description: 'CI/CD for a Node.js web application',
          variables: {
            repositoryPath: './',
            testCommand: 'npm run test:ci',
            buildCommand: 'npm run build',
            deploymentTarget: 'production',
            notificationChannel: 'slack'
          }
        },
        {
          name: 'React Frontend',
          description: 'CI/CD for a React frontend application',
          variables: {
            repositoryPath: './',
            testCommand: 'npm run test -- --coverage',
            buildCommand: 'npm run build',
            deploymentTarget: 'vercel',
            notificationChannel: 'dashboard'
          }
        }
      ],
      documentation: {
        overview: 'This template creates a complete CI/CD pipeline that automatically tests, builds, and deploys your application when changes are detected in your Git repository.',
        setupInstructions: [
          'Ensure your project has test scripts configured',
          'Set up build commands in package.json',
          'Configure deployment target credentials',
          'Test the pipeline with a small change'
        ],
        useCases: [
          'Automated testing on every commit',
          'Continuous deployment to staging/production',
          'Quality gates before deployment',
          'Team notifications on deployment status'
        ],
        troubleshooting: [
          {
            issue: 'Tests failing unexpectedly',
            solution: 'Check test command and ensure all dependencies are installed',
            relatedFields: ['testCommand']
          },
          {
            issue: 'Build process hanging',
            solution: 'Verify build command and check for interactive prompts',
            relatedFields: ['buildCommand']
          }
        ]
      }
    });

    // Code Quality Monitor Template
    this.registerTemplate({
      id: 'code-quality-monitor',
      name: 'Code Quality Monitor',
      description: 'Monitor code quality metrics and enforce standards',
      category: 'quality',
      icon: '📊',
      tags: ['quality', 'monitoring', 'standards', 'metrics'],
      author: 'DevFlow Monitor',
      version: '1.0.0',
      difficulty: 'beginner',
      estimatedSetupTime: 10,
      requirements: ['Source code repository', 'Quality tools (ESLint, Prettier, etc.)'],
      variables: [
        {
          name: 'sourceDirectory',
          type: 'string',
          required: true,
          description: 'Directory containing source code',
          default: 'src'
        },
        {
          name: 'qualityThreshold',
          type: 'number',
          required: false,
          description: 'Minimum quality score (0-100)',
          default: 80
        },
        {
          name: 'lintCommand',
          type: 'string',
          required: false,
          description: 'Linting command',
          default: 'npm run lint'
        },
        {
          name: 'alertOnFailure',
          type: 'boolean',
          required: false,
          description: 'Send alerts when quality drops',
          default: true
        }
      ],
      stages: [
        {
          id: 'file-watcher',
          name: 'Source Code Monitor',
          definitionId: 'file-monitor',
          configuration: {
            path: '{{sourceDirectory}}',
            includePatterns: '**/*.ts\n**/*.js\n**/*.tsx\n**/*.jsx',
            excludePatterns: 'node_modules/**\n*.test.*\n*.spec.*'
          }
        },
        {
          id: 'quality-check',
          name: 'Quality Analysis',
          definitionId: 'quality-analyzer',
          configuration: {
            lintCommand: '{{lintCommand}}',
            threshold: '{{qualityThreshold}}',
            failOnBelow: '{{alertOnFailure}}'
          }
        },
        {
          id: 'quality-report',
          name: 'Generate Quality Report',
          definitionId: 'report-generator',
          configuration: {
            reportType: 'quality',
            outputPath: 'reports/quality.html',
            includeMetrics: true
          }
        },
        {
          id: 'quality-alert',
          name: 'Quality Alert',
          definitionId: 'notification',
          configuration: {
            title: 'Code Quality Alert',
            message: 'Quality score below threshold: {{qualityScore}}%',
            priority: 'medium',
            channels: 'dashboard'
          }
        }
      ],
      examples: [
        {
          name: 'TypeScript Project',
          description: 'Quality monitoring for TypeScript codebase',
          variables: {
            sourceDirectory: 'src',
            qualityThreshold: 85,
            lintCommand: 'npm run lint:ts',
            alertOnFailure: true
          }
        }
      ]
    });

    // Development Workflow Template
    this.registerTemplate({
      id: 'dev-workflow',
      name: 'Development Workflow',
      description: 'Complete development workflow with TDD and code review',
      category: 'development',
      icon: '💻',
      tags: ['development', 'tdd', 'workflow', 'collaboration'],
      author: 'DevFlow Monitor',
      version: '1.0.0',
      difficulty: 'advanced',
      estimatedSetupTime: 20,
      requirements: ['Git repository', 'Test framework', 'Code review process'],
      variables: [
        {
          name: 'projectPath',
          type: 'string',
          required: true,
          description: 'Project root directory',
          default: './'
        },
        {
          name: 'testFramework',
          type: 'string',
          required: true,
          description: 'Testing framework being used',
          default: 'vitest'
        },
        {
          name: 'branchPattern',
          type: 'string',
          required: false,
          description: 'Feature branch naming pattern',
          default: 'feature/*'
        },
        {
          name: 'reviewRequired',
          type: 'boolean',
          required: false,
          description: 'Require code review before merge',
          default: true
        }
      ],
      stages: [
        {
          id: 'branch-monitor',
          name: 'Branch Activity Monitor',
          definitionId: 'git-monitor',
          configuration: {
            repository: '{{projectPath}}',
            watchBranches: '{{branchPattern}}\nmain\ndevelop'
          }
        },
        {
          id: 'tdd-detector',
          name: 'TDD Pattern Detection',
          definitionId: 'pattern-detector',
          configuration: {
            patterns: 'test-first\nred-green-refactor',
            encourageTDD: true
          }
        },
        {
          id: 'auto-test',
          name: 'Automatic Testing',
          definitionId: 'test-runner',
          configuration: {
            testCommand: 'npm test',
            runOnFileChange: true,
            coverage: true
          }
        },
        {
          id: 'review-check',
          name: 'Code Review Check',
          definitionId: 'decision',
          configuration: {
            field: 'reviewRequired',
            operator: 'equals',
            value: 'true'
          }
        },
        {
          id: 'quality-gate',
          name: 'Quality Gate',
          definitionId: 'quality-gate',
          configuration: {
            minTestCoverage: 80,
            maxComplexity: 10,
            requireLinting: true
          }
        }
      ],
      examples: [
        {
          name: 'React Development',
          description: 'Development workflow for React application',
          variables: {
            projectPath: './',
            testFramework: 'jest',
            branchPattern: 'feature/*',
            reviewRequired: true
          }
        }
      ]
    });

    // Bug Tracking Template
    this.registerTemplate({
      id: 'bug-tracking',
      name: 'Bug Tracking & Resolution',
      description: 'Automated bug detection, tracking, and resolution workflow',
      category: 'maintenance',
      icon: '🐛',
      tags: ['bugs', 'tracking', 'resolution', 'quality'],
      author: 'DevFlow Monitor',
      version: '1.0.0',
      difficulty: 'intermediate',
      estimatedSetupTime: 12,
      requirements: ['Error monitoring', 'Issue tracking system', 'Notification system'],
      variables: [
        {
          name: 'errorThreshold',
          type: 'number',
          required: false,
          description: 'Number of errors before creating bug report',
          default: 5
        },
        {
          name: 'criticalKeywords',
          type: 'array',
          required: false,
          description: 'Keywords that indicate critical bugs',
          default: ['crash', 'security', 'data loss']
        },
        {
          name: 'assignee',
          type: 'string',
          required: false,
          description: 'Default assignee for bug reports',
          default: 'dev-team'
        }
      ],
      stages: [
        {
          id: 'error-monitor',
          name: 'Error Detection',
          definitionId: 'error-monitor',
          configuration: {
            threshold: '{{errorThreshold}}',
            criticalKeywords: '{{criticalKeywords}}'
          }
        },
        {
          id: 'bug-classification',
          name: 'Bug Classification',
          definitionId: 'classifier',
          configuration: {
            criteria: 'severity\nfrequency\nimpact',
            autoAssign: true
          }
        },
        {
          id: 'create-ticket',
          name: 'Create Bug Ticket',
          definitionId: 'ticket-creator',
          configuration: {
            assignee: '{{assignee}}',
            priority: 'auto',
            includeStackTrace: true
          }
        },
        {
          id: 'notify-team',
          name: 'Team Notification',
          definitionId: 'notification',
          configuration: {
            title: 'New Bug Detected',
            message: 'Bug ticket created: {{ticketId}}',
            priority: 'high'
          }
        }
      ],
      examples: [
        {
          name: 'Web Application',
          description: 'Bug tracking for web application',
          variables: {
            errorThreshold: 3,
            criticalKeywords: ['crash', 'timeout', 'auth'],
            assignee: 'frontend-team'
          }
        }
      ]
    });

    // Performance Monitoring Template
    this.registerTemplate({
      id: 'performance-monitoring',
      name: 'Performance Monitoring',
      description: 'Monitor application performance and detect bottlenecks',
      category: 'performance',
      icon: '⚡',
      tags: ['performance', 'monitoring', 'optimization', 'bottlenecks'],
      author: 'DevFlow Monitor',
      version: '1.0.0',
      difficulty: 'intermediate',
      estimatedSetupTime: 15,
      requirements: ['Performance metrics', 'Monitoring tools', 'Alert system'],
      variables: [
        {
          name: 'responseTimeThreshold',
          type: 'number',
          required: false,
          description: 'Maximum acceptable response time (ms)',
          default: 1000
        },
        {
          name: 'memoryThreshold',
          type: 'number',
          required: false,
          description: 'Memory usage threshold (%)',
          default: 80
        },
        {
          name: 'cpuThreshold',
          type: 'number',
          required: false,
          description: 'CPU usage threshold (%)',
          default: 70
        }
      ],
      stages: [
        {
          id: 'metrics-collector',
          name: 'Performance Metrics Collection',
          definitionId: 'metrics-collector',
          configuration: {
            interval: 30000,
            metrics: 'response_time\nmemory_usage\ncpu_usage'
          }
        },
        {
          id: 'threshold-check',
          name: 'Threshold Monitoring',
          definitionId: 'threshold-monitor',
          configuration: {
            responseTime: '{{responseTimeThreshold}}',
            memory: '{{memoryThreshold}}',
            cpu: '{{cpuThreshold}}'
          }
        },
        {
          id: 'bottleneck-detection',
          name: 'Bottleneck Detection',
          definitionId: 'bottleneck-detector',
          configuration: {
            analysisWindow: '5m',
            sensitivity: 'medium'
          }
        },
        {
          id: 'performance-alert',
          name: 'Performance Alert',
          definitionId: 'notification',
          configuration: {
            title: 'Performance Alert',
            message: 'Performance threshold exceeded: {{metric}}',
            priority: 'urgent'
          }
        }
      ],
      examples: [
        {
          name: 'API Monitoring',
          description: 'Performance monitoring for REST API',
          variables: {
            responseTimeThreshold: 500,
            memoryThreshold: 75,
            cpuThreshold: 60
          }
        }
      ]
    });
  }

  /**
   * Register a new template
   */
  registerTemplate(template: TemplateDefinition): void {
    this.templates.set(template.id, template);
    this.emit('template-registered', template);
    console.log(`📋 Template registered: ${template.name}`);
  }

  /**
   * Instantiate a workflow from template
   */
  async instantiateWorkflow(
    templateId: string,
    options: TemplateInstantiationOptions
  ): Promise<Workflow> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate variables
    this.validateVariables(template, options.variables);

    // Create workflow stages
    const stages: WorkflowStage[] = [];
    const stageTemplates = template.stages.filter(s => 
      !options.customizations?.skipStages?.includes(s.id)
    );

    // Add additional stages if specified
    if (options.customizations?.additionalStages) {
      stageTemplates.push(...options.customizations.additionalStages);
    }

    for (let i = 0; i < stageTemplates.length; i++) {
      const stageTemplate = stageTemplates[i];
      if (!stageTemplate) continue;
      
      // Apply variable substitution to configuration
      const configuration = this.substituteVariables(
        stageTemplate.configuration,
        options.variables
      );

      // Apply stage overrides
      const overrides = options.customizations?.stageOverrides?.[stageTemplate.id] || {};
      const finalConfiguration = { ...configuration, ...overrides };

      // Build the stage
      const stage = this.stageBuilder.buildStage(
        `${stageTemplate.id}_${i + 1}`,
        stageTemplate.definitionId,
        finalConfiguration
      );

      // Add transitions
      if (i < stageTemplates.length - 1) {
        const nextStageTemplate = stageTemplates[i + 1];
        if (nextStageTemplate?.id) {
          stage.transitions.push({
            to: `${nextStageTemplate.id}_${i + 2}`,
            priority: 1
          });
        }
      }

      // Apply template-specific conditions and transitions
      if (stageTemplate?.conditions) {
        stage.conditions.push(...stageTemplate.conditions);
      }

      if (stageTemplate?.transitions) {
        stage.transitions.push(...stageTemplate.transitions);
      }

      stages.push(stage);
    }

    // Create the workflow
    const workflow: Workflow = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: options.name,
      description: options.description || template.description,
      stages,
      rules: this.generateDefaultRules(template, options.variables),
      templates: [this.convertToWorkflowTemplate(template)],
      metadata: {
        version: '1.0.0',
        author: 'Template System',
        created: new Date(),
        modified: new Date(),
        tags: [...template.tags, 'from-template'],
        permissions: [{
          role: 'owner',
          actions: ['read', 'write', 'execute', 'delete']
        }]
      }
    };

    // Store instantiation mapping
    this.instantiatedWorkflows.set(templateId, workflow.id);

    this.emit('workflow-instantiated', { template, workflow, options });
    console.log(`✨ Workflow instantiated: ${workflow.name} from template ${template.name}`);

    return workflow;
  }

  /**
   * Validate template variables
   */
  private validateVariables(template: TemplateDefinition, variables: Record<string, any>): void {
    for (const variable of template.variables) {
      const value = variables[variable.name];

      if (variable.required && (value === undefined || value === null)) {
        throw new Error(`Required variable missing: ${variable.name}`);
      }

      if (value !== undefined) {
        this.validateVariableType(variable, value);
      }
    }
  }

  /**
   * Validate variable type
   */
  private validateVariableType(variable: TemplateVariable, value: any): void {
    const expectedType = variable.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== expectedType) {
      throw new Error(
        `Variable ${variable.name} expected type ${expectedType}, got ${actualType}`
      );
    }
  }

  /**
   * Substitute variables in configuration
   */
  private substituteVariables(config: any, variables: Record<string, any>): any {
    if (typeof config === 'string') {
      return config.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return variables[varName] !== undefined ? String(variables[varName]) : match;
      });
    }

    if (Array.isArray(config)) {
      return config.map(item => this.substituteVariables(item, variables));
    }

    if (config && typeof config === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(config)) {
        result[key] = this.substituteVariables(value, variables);
      }
      return result;
    }

    return config;
  }

  /**
   * Generate default rules for template
   */
  private generateDefaultRules(template: TemplateDefinition, variables: Record<string, any>): any[] {
    const rules: any[] = [];

    // Create trigger rule based on template category
    switch (template.category) {
      case 'deployment':
        rules.push({
          id: `${template.id}_git_trigger`,
          name: 'Git Change Trigger',
          description: 'Trigger on Git changes',
          trigger: {
            type: 'event',
            config: {
              eventType: 'git.commit',
              conditions: [{
                field: 'branch',
                operator: 'in',
                value: ['main', 'develop']
              }]
            }
          },
          conditions: [],
          actions: [{
            type: 'workflow',
            config: {
              workflowId: 'current',
              variables
            },
            order: 1
          }],
          enabled: true
        });
        break;

      case 'quality':
        rules.push({
          id: `${template.id}_file_trigger`,
          name: 'File Change Trigger',
          description: 'Trigger on source file changes',
          trigger: {
            type: 'event',
            config: {
              eventType: 'file.change',
              conditions: [{
                field: 'path',
                operator: 'regex',
                value: '\\.(ts|js|tsx|jsx)$'
              }]
            }
          },
          conditions: [],
          actions: [{
            type: 'workflow',
            config: {
              workflowId: 'current',
              variables
            },
            order: 1
          }],
          enabled: true
        });
        break;
    }

    return rules;
  }

  /**
   * Convert template definition to workflow template
   */
  private convertToWorkflowTemplate(template: TemplateDefinition): WorkflowTemplate {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      stages: [], // Will be populated during instantiation
      variables: template.variables,
      examples: template.examples
    };
  }

  /**
   * Get template categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Search templates
   */
  searchTemplates(query: {
    category?: string;
    tags?: string[];
    difficulty?: string;
    search?: string;
  }): TemplateDefinition[] {
    let results = Array.from(this.templates.values());

    if (query.category) {
      results = results.filter(t => t.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(t => 
        query.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (query.difficulty) {
      results = results.filter(t => t.difficulty === query.difficulty);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    return results;
  }

  /**
   * Generate template documentation
   */
  generateDocumentation(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let doc = `# ${template.name}\n\n`;
    doc += `${template.description}\n\n`;
    doc += `**Category:** ${template.category}  \n`;
    doc += `**Difficulty:** ${template.difficulty}  \n`;
    doc += `**Setup Time:** ~${template.estimatedSetupTime} minutes  \n`;
    doc += `**Tags:** ${template.tags.join(', ')}\n\n`;

    if (template.requirements.length > 0) {
      doc += `## Requirements\n\n`;
      for (const req of template.requirements) {
        doc += `- ${req}\n`;
      }
      doc += '\n';
    }

    doc += `## Variables\n\n`;
    doc += `| Name | Type | Required | Default | Description |\n`;
    doc += `|------|------|----------|---------|-------------|\n`;
    
    for (const variable of template.variables) {
      doc += `| ${variable.name} | ${variable.type} | ${variable.required ? 'Yes' : 'No'} | `;
      doc += `${variable.default || '-'} | ${variable.description} |\n`;
    }
    doc += '\n';

    if (template.examples.length > 0) {
      doc += `## Examples\n\n`;
      for (const example of template.examples) {
        doc += `### ${example.name}\n\n`;
        doc += `${example.description}\n\n`;
        doc += `**Variables:**\n`;
        doc += '```json\n';
        doc += JSON.stringify(example.variables, null, 2);
        doc += '\n```\n\n';
      }
    }

    if (template.documentation) {
      doc += `## Overview\n\n${template.documentation.overview}\n\n`;
      
      if (template.documentation.setupInstructions.length > 0) {
        doc += `## Setup Instructions\n\n`;
        for (let i = 0; i < template.documentation.setupInstructions.length; i++) {
          doc += `${i + 1}. ${template.documentation.setupInstructions[i]}\n`;
        }
        doc += '\n';
      }

      if (template.documentation.useCases.length > 0) {
        doc += `## Use Cases\n\n`;
        for (const useCase of template.documentation.useCases) {
          doc += `- ${useCase}\n`;
        }
        doc += '\n';
      }

      if (template.documentation.troubleshooting.length > 0) {
        doc += `## Troubleshooting\n\n`;
        for (const item of template.documentation.troubleshooting) {
          doc += `**${item.issue}**  \n`;
          doc += `${item.solution}\n\n`;
        }
      }
    }

    return doc;
  }

  /**
   * Export template to JSON
   */
  exportTemplate(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return JSON.stringify(template, null, 2);
  }

  /**
   * Import template from JSON
   */
  importTemplate(templateJson: string): void {
    try {
      const template: TemplateDefinition = JSON.parse(templateJson);
      
      // Validate template structure
      this.validateTemplateStructure(template);
      
      this.registerTemplate(template);
    } catch (error) {
      throw new Error(`Failed to import template: ${(error as Error).message}`);
    }
  }

  /**
   * Validate template structure
   */
  private validateTemplateStructure(template: any): void {
    const required = ['id', 'name', 'description', 'category', 'variables', 'stages'];
    
    for (const field of required) {
      if (!template[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(template.variables)) {
      throw new Error('Variables must be an array');
    }

    if (!Array.isArray(template.stages)) {
      throw new Error('Stages must be an array');
    }
  }

  /**
   * Storage methods
   */
  private async loadTemplates(): Promise<void> {
    try {
      // TODO: Implement template persistence
      // const stored = await this.storageManager.get('workflow_templates');
      // if (stored) {
      //   for (const [id, template] of Object.entries(stored)) {
      //     this.templates.set(id, template as TemplateDefinition);
      //   }
      // }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  private async saveTemplates(): Promise<void> {
    try {
      // TODO: Implement template persistence
      // const templates = Object.fromEntries(this.templates);
      // await this.storageManager.set('workflow_templates', templates);
    } catch (error) {
      console.error('Failed to save templates:', error);
    }
  }

  /**
   * Public API methods
   */
  getTemplates(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  async updateTemplate(template: TemplateDefinition): Promise<void> {
    this.validateTemplateStructure(template);
    this.templates.set(template.id, template);
    await this.saveTemplates();
    this.emit('template-updated', template);
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = this.templates.get(id);
    if (template) {
      this.templates.delete(id);
      await this.saveTemplates();
      this.emit('template-deleted', template);
    }
  }

  getInstantiatedWorkflow(templateId: string): string | undefined {
    return this.instantiatedWorkflows.get(templateId);
  }
}