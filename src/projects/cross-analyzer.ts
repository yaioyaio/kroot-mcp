/**
 * DevFlow Monitor MCP - 크로스 프로젝트 분석기
 * 
 * 여러 프로젝트 간의 관계, 유사성, 의존성을 분석하는 고급 분석 엔진입니다.
 */

import { EventEmitter } from 'events';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

import {
  ProjectMetadata,
  ProjectMetrics,
  CrossProjectAnalysis,
  AnalysisType,
  AnalysisResult,
  Insight,
  Recommendation,
  DependencyType,
  ProjectPriority
} from './types.js';

import { Logger } from '../utils/logger.js';

/**
 * 분석기 설정
 */
export interface CrossAnalyzerConfig {
  /** 최소 신뢰도 임계값 */
  minConfidence: number;
  
  /** 분석 시간 윈도우 (일) */
  timeWindow: number;
  
  /** 최대 동시 분석 작업 수 */
  maxConcurrentAnalysis: number;
  
  /** 유사성 분석 가중치 */
  similarityWeights: {
    techStack: number;
    codeStyle: number;
    projectStructure: number;
    dependencies: number;
    teamMembers: number;
  };
  
  /** 성능 분석 임계값 */
  performanceThresholds: {
    buildTime: number; // 초
    testTime: number;  // 초
    codeQuality: number; // 0-100
    testCoverage: number; // 0-100
  };
}

/**
 * 분석 컨텍스트
 */
export interface AnalysisContext {
  /** 분석 ID */
  id: string;
  
  /** 대상 프로젝트들 */
  projects: ProjectMetadata[];
  
  /** 프로젝트 메트릭들 */
  metrics: Map<string, ProjectMetrics[]>;
  
  /** 분석 타입 */
  type: AnalysisType;
  
  /** 분석 시작 시간 */
  startTime: number;
  
  /** 설정 */
  config: CrossAnalyzerConfig;
}

/**
 * 크로스 프로젝트 분석기
 */
export class CrossProjectAnalyzer extends EventEmitter {
  private config: CrossAnalyzerConfig;
  private logger: Logger;
  private runningAnalysis = new Map<string, AnalysisContext>();

  constructor(config: Partial<CrossAnalyzerConfig> = {}) {
    super();
    
    this.config = {
      minConfidence: config.minConfidence ?? 0.7,
      timeWindow: config.timeWindow ?? 30,
      maxConcurrentAnalysis: config.maxConcurrentAnalysis ?? 3,
      similarityWeights: {
        techStack: 0.3,
        codeStyle: 0.2,
        projectStructure: 0.2,
        dependencies: 0.2,
        teamMembers: 0.1,
        ...config.similarityWeights
      },
      performanceThresholds: {
        buildTime: 300, // 5분
        testTime: 120,  // 2분
        codeQuality: 80,
        testCoverage: 80,
        ...config.performanceThresholds
      }
    };
    
    this.logger = new Logger('CrossProjectAnalyzer');
    
    this.logger.info('크로스 프로젝트 분석기 초기화됨', {
      minConfidence: this.config.minConfidence,
      timeWindow: this.config.timeWindow
    });
  }

  /**
   * 크로스 프로젝트 분석 실행
   */
  async analyze(
    projects: ProjectMetadata[],
    metrics: Map<string, ProjectMetrics[]>,
    type: AnalysisType
  ): Promise<CrossProjectAnalysis> {
    
    if (this.runningAnalysis.size >= this.config.maxConcurrentAnalysis) {
      throw new Error('최대 동시 분석 작업 수를 초과했습니다');
    }

    const analysisId = uuidv4();
    const context: AnalysisContext = {
      id: analysisId,
      projects,
      metrics,
      type,
      startTime: Date.now(),
      config: this.config
    };

    this.runningAnalysis.set(analysisId, context);

    try {
      this.logger.info('크로스 프로젝트 분석 시작', {
        id: analysisId,
        type,
        projectCount: projects.length
      });

      const analysis: CrossProjectAnalysis = {
        id: analysisId,
        timestamp: Date.now(),
        projects: projects.map(p => p.id),
        type,
        results: [],
        insights: [],
        recommendations: []
      };

      // 분석 타입에 따른 분석 실행
      switch (type) {
        case AnalysisType.SIMILARITY:
          analysis.results = await this.analyzeSimilarity(context);
          break;
        case AnalysisType.DEPENDENCY:
          analysis.results = await this.analyzeDependencies(context);
          break;
        case AnalysisType.PERFORMANCE:
          analysis.results = await this.analyzePerformance(context);
          break;
        case AnalysisType.QUALITY:
          analysis.results = await this.analyzeQuality(context);
          break;
        case AnalysisType.TREND:
          analysis.results = await this.analyzeTrends(context);
          break;
        case AnalysisType.BOTTLENECK:
          analysis.results = await this.analyzeBottlenecks(context);
          break;
        case AnalysisType.COLLABORATION:
          analysis.results = await this.analyzeCollaboration(context);
          break;
        default:
          throw new Error(`지원되지 않는 분석 타입: ${type}`);
      }

      // 인사이트 생성
      analysis.insights = this.generateInsights(analysis.results, context);

      // 권장사항 생성
      analysis.recommendations = this.generateRecommendations(analysis.results, analysis.insights, context);

      this.logger.info('크로스 프로젝트 분석 완료', {
        id: analysisId,
        type,
        resultsCount: analysis.results.length,
        insightsCount: analysis.insights.length,
        recommendationsCount: analysis.recommendations.length,
        duration: Date.now() - context.startTime
      });

      return analysis;

    } catch (error) {
      this.logger.error('크로스 프로젝트 분석 실패:', { id: analysisId, error });
      throw error;
    } finally {
      this.runningAnalysis.delete(analysisId);
    }
  }

  /**
   * 유사성 분석
   */
  private async analyzeSimilarity(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects } = context;

    // 프로젝트 쌍별 유사성 분석
    for (let i = 0; i < projects.length; i++) {
      for (let j = i + 1; j < projects.length; j++) {
        const project1 = projects[i];
        const project2 = projects[j];

        if (project1 && project2) {
          const similarity = await this.calculateProjectSimilarity(project1, project2, context);
          
          if (similarity.score >= this.config.minConfidence) {
            results.push({
              type: 'similarity',
              score: similarity.score,
              confidence: similarity.confidence,
              data: {
                project1Id: project1.id,
                project1Name: project1.name,
                project2Id: project2.id,
                project2Name: project2.name,
                details: similarity.details
              },
              description: `${project1.name}과 ${project2.name}의 유사도: ${Math.round(similarity.score * 100)}%`
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * 프로젝트 간 유사성 계산
   */
  private async calculateProjectSimilarity(
    project1: ProjectMetadata,
    project2: ProjectMetadata,
    context: AnalysisContext
  ): Promise<{ score: number; confidence: number; details: any }> {
    
    const weights = this.config.similarityWeights;
    let totalScore = 0;
    let totalWeight = 0;
    const details: any = {};

    // 기술 스택 유사성
    const techStackSimilarity = this.calculateTechStackSimilarity(project1, project2);
    totalScore += techStackSimilarity * weights.techStack;
    totalWeight += weights.techStack;
    details.techStack = techStackSimilarity;

    // 프로젝트 구조 유사성
    const structureSimilarity = this.calculateStructureSimilarity(project1, project2);
    totalScore += structureSimilarity * weights.projectStructure;
    totalWeight += weights.projectStructure;
    details.structure = structureSimilarity;

    // 코드 스타일 유사성 (파일이 존재하는 경우에만)
    const codeStyleSimilarity = await this.calculateCodeStyleSimilarity(project1, project2);
    if (codeStyleSimilarity >= 0) {
      totalScore += codeStyleSimilarity * weights.codeStyle;
      totalWeight += weights.codeStyle;
      details.codeStyle = codeStyleSimilarity;
    }

    // 의존성 유사성
    const dependencySimilarity = await this.calculateDependencySimilarity(project1, project2);
    if (dependencySimilarity >= 0) {
      totalScore += dependencySimilarity * weights.dependencies;
      totalWeight += weights.dependencies;
      details.dependencies = dependencySimilarity;
    }

    // 팀 멤버 유사성
    const teamSimilarity = this.calculateTeamSimilarity(project1, project2);
    totalScore += teamSimilarity * weights.teamMembers;
    totalWeight += weights.teamMembers;
    details.team = teamSimilarity;

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const confidence = totalWeight / Object.values(weights).reduce((a, b) => a + b, 0);

    return {
      score: finalScore,
      confidence,
      details
    };
  }

  /**
   * 기술 스택 유사성 계산
   */
  private calculateTechStackSimilarity(project1: ProjectMetadata, project2: ProjectMetadata): number {
    // 프로젝트 타입 기반 유사성
    if (project1.type === project2.type) {
      return 0.8; // 같은 타입이면 높은 유사성
    }

    // 관련 타입들 간의 유사성
    const relatedTypes = {
      'web_application': ['api_service', 'microservice'],
      'mobile_application': ['web_application'],
      'api_service': ['web_application', 'microservice'],
      'microservice': ['api_service'],
      'library': ['cli_tool'],
      'cli_tool': ['library']
    };

    const related = relatedTypes[project1.type as keyof typeof relatedTypes] || [];
    if (related.includes(project2.type)) {
      return 0.6;
    }

    return 0.2; // 기본 유사성
  }

  /**
   * 프로젝트 구조 유사성 계산
   */
  private calculateStructureSimilarity(project1: ProjectMetadata, project2: ProjectMetadata): number {
    const paths1 = project1.paths;
    const paths2 = project2.paths;

    // 공통 디렉토리 구조 비교
    const commonStructure = [
      'source', 'test', 'docs', 'build', 'config'
    ].filter(key => {
      const p1HasDir = paths1[key as keyof typeof paths1]?.length > 0;
      const p2HasDir = paths2[key as keyof typeof paths2]?.length > 0;
      return p1HasDir && p2HasDir;
    });

    return commonStructure.length / 5; // 최대 5개 디렉토리
  }

  /**
   * 코드 스타일 유사성 계산
   */
  private async calculateCodeStyleSimilarity(
    project1: ProjectMetadata,
    project2: ProjectMetadata
  ): Promise<number> {
    try {
      // 설정 파일들 비교
      const configFiles = [
        '.eslintrc.json',
        '.prettierrc',
        'tsconfig.json',
        '.editorconfig',
        'package.json'
      ];

      let similarity = 0;
      let fileCount = 0;

      for (const configFile of configFiles) {
        const path1 = join(project1.paths.root, configFile);
        const path2 = join(project2.paths.root, configFile);

        if (existsSync(path1) && existsSync(path2)) {
          const config1 = this.parseConfigFile(path1);
          const config2 = this.parseConfigFile(path2);
          
          if (config1 && config2) {
            similarity += this.compareConfigs(config1, config2);
            fileCount++;
          }
        }
      }

      return fileCount > 0 ? similarity / fileCount : -1;
    } catch (error) {
      this.logger.debug('코드 스타일 유사성 계산 실패:', error);
      return -1;
    }
  }

  /**
   * 설정 파일 파싱
   */
  private parseConfigFile(filePath: string): any {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * 설정 비교
   */
  private compareConfigs(config1: any, config2: any): number {
    // 간단한 키 기반 비교
    const keys1 = new Set(Object.keys(config1));
    const keys2 = new Set(Object.keys(config2));
    
    const commonKeys = new Set([...keys1].filter(key => keys2.has(key)));
    const allKeys = new Set([...keys1, ...keys2]);
    
    return commonKeys.size / allKeys.size;
  }

  /**
   * 의존성 유사성 계산
   */
  private async calculateDependencySimilarity(
    project1: ProjectMetadata,
    project2: ProjectMetadata
  ): Promise<number> {
    try {
      const deps1 = await this.extractDependencies(project1);
      const deps2 = await this.extractDependencies(project2);

      if (deps1.length === 0 || deps2.length === 0) {
        return -1;
      }

      const set1 = new Set(deps1);
      const set2 = new Set(deps2);
      
      const intersection = new Set([...set1].filter(dep => set2.has(dep)));
      const union = new Set([...set1, ...set2]);

      return intersection.size / union.size; // Jaccard 유사도
    } catch (error) {
      this.logger.debug('의존성 유사성 계산 실패:', error);
      return -1;
    }
  }

  /**
   * 프로젝트 의존성 추출
   */
  private async extractDependencies(project: ProjectMetadata): Promise<string[]> {
    const packageJsonPath = join(project.paths.root, 'package.json');
    
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const deps = [
          ...Object.keys(packageJson.dependencies || {}),
          ...Object.keys(packageJson.devDependencies || {}),
          ...Object.keys(packageJson.peerDependencies || {})
        ];
        return deps;
      } catch (error) {
        this.logger.debug('package.json 파싱 실패:', error);
      }
    }

    return [];
  }

  /**
   * 팀 유사성 계산
   */
  private calculateTeamSimilarity(project1: ProjectMetadata, project2: ProjectMetadata): number {
    // 같은 소유자인 경우
    if (project1.owner.userId === project2.owner.userId) {
      return 1.0;
    }

    // 같은 팀인 경우
    if (project1.owner.teamId && project1.owner.teamId === project2.owner.teamId) {
      return 0.8;
    }

    return 0.1; // 기본 유사성
  }

  /**
   * 의존성 분석
   */
  private async analyzeDependencies(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects } = context;

    // 프로젝트 간 의존성 관계 분석
    for (let i = 0; i < projects.length; i++) {
      for (let j = 0; j < projects.length; j++) {
        if (i === j) continue;

        const source = projects[i];
        const target = projects[j];
        
        if (!source || !target) continue;

        const dependencies = await this.detectProjectDependencies(source, target);
        
        for (const dep of dependencies) {
          results.push({
            type: 'dependency',
            score: dep.strength,
            confidence: 0.8,
            data: {
              sourceId: source?.id || '',
              sourceName: source?.name || '',
              targetId: target?.id || '',
              targetName: target?.name || '',
              dependencyType: dep.type,
              description: dep.description
            },
            description: `${source.name} → ${target.name}: ${dep.description}`
          });
        }
      }
    }

    return results;
  }

  /**
   * 프로젝트 간 의존성 감지
   */
  private async detectProjectDependencies(
    source: ProjectMetadata,
    target: ProjectMetadata
  ): Promise<Array<{ type: DependencyType; strength: number; description: string }>> {
    
    const dependencies: Array<{ type: DependencyType; strength: number; description: string }> = [];

    // 직접 의존성 확인 (package.json에 다른 프로젝트가 포함된 경우)
    const sourceDeps = await this.extractDependencies(source);
    if (sourceDeps.includes(target.name)) {
      dependencies.push({
        type: DependencyType.DIRECT,
        strength: 0.9,
        description: `${source.name}이 ${target.name}을 직접 의존`
      });
    }

    // 공유 리소스 의존성 (같은 데이터베이스, API 등)
    if (this.hasSharedResources(source, target)) {
      dependencies.push({
        type: DependencyType.SHARED_RESOURCE,
        strength: 0.7,
        description: `${source.name}과 ${target.name}이 공유 리소스 사용`
      });
    }

    // 팀 의존성 (같은 팀이 관리하는 프로젝트)
    if (source.owner.teamId && source.owner.teamId === target.owner.teamId) {
      dependencies.push({
        type: DependencyType.TEAM_DEPENDENCY,
        strength: 0.5,
        description: `${source.name}과 ${target.name}이 같은 팀에서 관리됨`
      });
    }

    return dependencies;
  }

  /**
   * 공유 리소스 여부 확인
   */
  private hasSharedResources(project1: ProjectMetadata, project2: ProjectMetadata): boolean {
    // 간단한 구현: 같은 타입의 API 서비스인 경우
    return project1.type === 'api_service' && project2.type === 'api_service';
  }

  /**
   * 성능 분석
   */
  private async analyzePerformance(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects, metrics } = context;

    for (const project of projects) {
      const projectMetrics = metrics.get(project.id) || [];
      
      if (projectMetrics.length === 0) continue;

      const latestMetrics = projectMetrics[projectMetrics.length - 1];
      if (!latestMetrics || !latestMetrics.performance) continue;
      const performance = latestMetrics.performance;

      // 빌드 시간 분석
      if (performance.buildTime > this.config.performanceThresholds.buildTime) {
        results.push({
          type: 'performance_issue',
          score: Math.min(performance.buildTime / this.config.performanceThresholds.buildTime, 2.0),
          confidence: 0.9,
          data: {
            projectId: project.id,
            projectName: project.name,
            metric: 'buildTime',
            value: performance.buildTime,
            threshold: this.config.performanceThresholds.buildTime
          },
          description: `${project.name}의 빌드 시간이 임계값을 초과함 (${performance.buildTime}초)`
        });
      }

      // 테스트 시간 분석
      if (performance.testTime > this.config.performanceThresholds.testTime) {
        results.push({
          type: 'performance_issue',
          score: Math.min(performance.testTime / this.config.performanceThresholds.testTime, 2.0),
          confidence: 0.9,
          data: {
            projectId: project.id,
            projectName: project.name,
            metric: 'testTime',
            value: performance.testTime,
            threshold: this.config.performanceThresholds.testTime
          },
          description: `${project.name}의 테스트 시간이 임계값을 초과함 (${performance.testTime}초)`
        });
      }
    }

    return results;
  }

  /**
   * 품질 분석
   */
  private async analyzeQuality(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects, metrics } = context;

    for (const project of projects) {
      const projectMetrics = metrics.get(project.id) || [];
      
      if (projectMetrics.length === 0) continue;

      const latestMetrics = projectMetrics[projectMetrics.length - 1];
      if (!latestMetrics || !latestMetrics.quality) continue;
      const quality = latestMetrics.quality;

      // 코드 품질 분석
      if (quality.codeQuality < this.config.performanceThresholds.codeQuality) {
        results.push({
          type: 'quality_issue',
          score: (this.config.performanceThresholds.codeQuality - quality.codeQuality) / 100,
          confidence: 0.8,
          data: {
            projectId: project.id,
            projectName: project.name,
            metric: 'codeQuality',
            value: quality.codeQuality,
            threshold: this.config.performanceThresholds.codeQuality
          },
          description: `${project.name}의 코드 품질이 기준보다 낮음 (${quality.codeQuality}/100)`
        });
      }

      // 테스트 커버리지 분석
      if (quality.testCoverage < this.config.performanceThresholds.testCoverage) {
        results.push({
          type: 'quality_issue',
          score: (this.config.performanceThresholds.testCoverage - quality.testCoverage) / 100,
          confidence: 0.9,
          data: {
            projectId: project.id,
            projectName: project.name,
            metric: 'testCoverage',
            value: quality.testCoverage,
            threshold: this.config.performanceThresholds.testCoverage
          },
          description: `${project.name}의 테스트 커버리지가 기준보다 낮음 (${quality.testCoverage}%)`
        });
      }
    }

    return results;
  }

  /**
   * 트렌드 분석
   */
  private async analyzeTrends(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects, metrics } = context;

    for (const project of projects) {
      const projectMetrics = metrics.get(project.id) || [];
      
      if (projectMetrics.length < 2) continue;

      const trend = this.calculateMetricsTrend(projectMetrics);
      
      results.push({
        type: 'trend',
        score: Math.abs(trend.slope),
        confidence: trend.confidence,
        data: {
          projectId: project.id,
          projectName: project.name,
          trend: trend.direction,
          slope: trend.slope,
          metrics: trend.keyMetrics
        },
        description: `${project.name}의 전반적 트렌드: ${trend.direction}`
      });
    }

    return results;
  }

  /**
   * 메트릭 트렌드 계산
   */
  private calculateMetricsTrend(metrics: ProjectMetrics[]): {
    direction: 'improving' | 'declining' | 'stable';
    slope: number;
    confidence: number;
    keyMetrics: any;
  } {
    // 간단한 트렌드 분석 (실제로는 더 복잡한 통계 분석 필요)
    const recent = metrics.slice(-5); // 최근 5개 데이터 포인트
    
    if (recent.length < 2) {
      return {
        direction: 'stable',
        slope: 0,
        confidence: 0,
        keyMetrics: {}
      };
    }

    const first = recent[0];
    const last = recent[recent.length - 1];
    
    if (!first || !last || !first.quality || !last.quality || !first.performance || !last.performance) {
      return {
        direction: 'stable' as const,
        confidence: 0,
        details: {}
      };
    }

    // 주요 지표들의 변화 계산
    const qualityChange = (last.quality.codeQuality - first.quality.codeQuality) * 0.4;
    const performanceChange = -(last.performance.buildTime - first.performance.buildTime) * 0.3;
    const coverageChange = (last.quality.testCoverage - first.quality.testCoverage) * 0.3;

    const totalChange = qualityChange + performanceChange + coverageChange;
    
    let direction: 'improving' | 'declining' | 'stable';
    if (totalChange > 5) {
      direction = 'improving';
    } else if (totalChange < -5) {
      direction = 'declining';
    } else {
      direction = 'stable';
    }

    return {
      direction,
      slope: totalChange,
      confidence: 0.7,
      keyMetrics: {
        qualityChange,
        performanceChange,
        coverageChange
      }
    };
  }

  /**
   * 병목 현상 분석
   */
  private async analyzeBottlenecks(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects, metrics } = context;

    // 전체 프로젝트 대비 성능 비교
    const allMetrics = Array.from(metrics.values()).flat();
    if (allMetrics.length === 0) return results;

    // 평균값 계산
    const validMetrics = allMetrics.filter(m => m.performance);
    if (validMetrics.length === 0) return results;
    
    const avgBuildTime = validMetrics.reduce((sum, m) => sum + m.performance.buildTime, 0) / validMetrics.length;
    const avgTestTime = validMetrics.reduce((sum, m) => sum + m.performance.testTime, 0) / validMetrics.length;

    for (const project of projects) {
      const projectMetrics = metrics.get(project.id) || [];
      
      if (projectMetrics.length === 0) continue;

      const latestMetrics = projectMetrics[projectMetrics.length - 1];
      if (!latestMetrics || !latestMetrics.performance) continue;
      const performance = latestMetrics.performance;

      // 빌드 시간 병목
      if (performance.buildTime > avgBuildTime * 1.5) {
        results.push({
          type: 'bottleneck',
          score: performance.buildTime / avgBuildTime,
          confidence: 0.8,
          data: {
            projectId: project.id,
            projectName: project.name,
            bottleneckType: 'build',
            value: performance.buildTime,
            average: avgBuildTime
          },
          description: `${project.name}의 빌드 시간이 평균보다 ${Math.round((performance.buildTime / avgBuildTime - 1) * 100)}% 느림`
        });
      }

      // 테스트 시간 병목
      if (performance.testTime > avgTestTime * 1.5) {
        results.push({
          type: 'bottleneck',
          score: performance.testTime / avgTestTime,
          confidence: 0.8,
          data: {
            projectId: project.id,
            projectName: project.name,
            bottleneckType: 'test',
            value: performance.testTime,
            average: avgTestTime
          },
          description: `${project.name}의 테스트 시간이 평균보다 ${Math.round((performance.testTime / avgTestTime - 1) * 100)}% 느림`
        });
      }
    }

    return results;
  }

  /**
   * 협업 분석
   */
  private async analyzeCollaboration(context: AnalysisContext): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    const { projects, metrics } = context;

    for (const project of projects) {
      const projectMetrics = metrics.get(project.id) || [];
      
      if (projectMetrics.length === 0) continue;

      const latestMetrics = projectMetrics[projectMetrics.length - 1];
      const team = latestMetrics.team;

      // 협업 점수 분석
      results.push({
        type: 'collaboration',
        score: team.collaborationScore,
        confidence: 0.7,
        data: {
          projectId: project.id,
          projectName: project.name,
          activeDevelopers: team.activeDevelopers,
          codeReviewRate: team.codeReviewRate,
          avgCommitSize: team.avgCommitSize
        },
        description: `${project.name}의 협업 점수: ${Math.round(team.collaborationScore * 100)}/100`
      });
    }

    return results;
  }

  /**
   * 인사이트 생성
   */
  private generateInsights(results: AnalysisResult[], context: AnalysisContext): Insight[] {
    const insights: Insight[] = [];

    // 결과를 타입별로 그룹화
    const groupedResults = new Map<string, AnalysisResult[]>();
    results.forEach(result => {
      const key = result.type;
      if (!groupedResults.has(key)) {
        groupedResults.set(key, []);
      }
      groupedResults.get(key)!.push(result);
    });

    // 각 타입별 인사이트 생성
    groupedResults.forEach((typeResults, type) => {
      const insight = this.generateInsightForType(type, typeResults, context);
      if (insight) {
        insights.push(insight);
      }
    });

    return insights;
  }

  /**
   * 타입별 인사이트 생성
   */
  private generateInsightForType(
    type: string,
    results: AnalysisResult[],
    context: AnalysisContext
  ): Insight | null {
    
    if (results.length === 0) return null;

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    
    switch (type) {
      case 'similarity':
        return {
          id: uuidv4(),
          title: '프로젝트 유사성 패턴',
          description: `${results.length}개의 프로젝트 간 유사성이 발견되었습니다. 평균 유사도: ${Math.round(avgScore * 100)}%`,
          importance: avgScore > 0.8 ? 'high' : avgScore > 0.6 ? 'medium' : 'low',
          category: 'architecture',
          data: { type, resultCount: results.length, avgScore }
        };

      case 'performance_issue':
        return {
          id: uuidv4(),
          title: '성능 이슈 감지',
          description: `${results.length}개 프로젝트에서 성능 문제가 감지되었습니다.`,
          importance: results.length > 2 ? 'critical' : results.length > 1 ? 'high' : 'medium',
          category: 'performance',
          data: { type, resultCount: results.length, avgScore }
        };

      case 'quality_issue':
        return {
          id: uuidv4(),
          title: '코드 품질 문제',
          description: `${results.length}개 프로젝트에서 품질 기준 미달이 확인되었습니다.`,
          importance: results.length > 2 ? 'high' : 'medium',
          category: 'quality',
          data: { type, resultCount: results.length, avgScore }
        };

      case 'bottleneck':
        return {
          id: uuidv4(),
          title: '병목 현상 발견',
          description: `${results.length}개 프로젝트에서 병목 현상이 발견되었습니다.`,
          importance: 'high',
          category: 'performance',
          data: { type, resultCount: results.length, avgScore }
        };

      default:
        return {
          id: uuidv4(),
          title: `${type} 분석 결과`,
          description: `${results.length}개의 ${type} 관련 결과가 발견되었습니다.`,
          importance: 'medium',
          category: 'general',
          data: { type, resultCount: results.length, avgScore }
        };
    }
  }

  /**
   * 권장사항 생성
   */
  private generateRecommendations(
    results: AnalysisResult[],
    insights: Insight[],
    context: AnalysisContext
  ): Recommendation[] {
    
    const recommendations: Recommendation[] = [];

    // 인사이트 기반 권장사항 생성
    insights.forEach(insight => {
      const recommendation = this.generateRecommendationForInsight(insight, results, context);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    });

    return recommendations;
  }

  /**
   * 인사이트별 권장사항 생성
   */
  private generateRecommendationForInsight(
    insight: Insight,
    results: AnalysisResult[],
    context: AnalysisContext
  ): Recommendation | null {
    
    const relatedResults = results.filter(r => r.type === insight.data.type);
    const affectedProjects = [...new Set(relatedResults.map(r => r.data.projectId))];
    
    switch (insight.category) {
      case 'performance':
        return {
          id: uuidv4(),
          title: '성능 최적화 필요',
          description: '성능 문제가 감지된 프로젝트들의 최적화가 필요합니다.',
          priority: insight.importance as any,
          impact: 'high',
          effort: 'medium',
          affectedProjects,
          actions: [
            {
              id: uuidv4(),
              title: '빌드 프로세스 최적화',
              description: '빌드 시간을 단축하기 위한 최적화 작업',
              completed: false
            },
            {
              id: uuidv4(),
              title: '테스트 성능 개선',
              description: '테스트 실행 시간 단축 방안 적용',
              completed: false
            }
          ]
        };

      case 'quality':
        return {
          id: uuidv4(),
          title: '코드 품질 개선 필요',
          description: '코드 품질 기준을 충족하지 못하는 프로젝트들의 개선이 필요합니다.',
          priority: insight.importance as any,
          impact: 'medium',
          effort: 'medium',
          affectedProjects,
          actions: [
            {
              id: uuidv4(),
              title: '코드 리뷰 프로세스 강화',
              description: '코드 리뷰 비율 향상 및 품질 기준 적용',
              completed: false
            },
            {
              id: uuidv4(),
              title: '테스트 커버리지 향상',
              description: '테스트 커버리지를 80% 이상으로 향상',
              completed: false
            }
          ]
        };

      case 'architecture':
        return {
          id: uuidv4(),
          title: '아키텍처 표준화 고려',
          description: '유사한 프로젝트들의 아키텍처 표준화를 고려해보세요.',
          priority: ProjectPriority.MEDIUM,
          impact: 'high',
          effort: 'high',
          affectedProjects,
          actions: [
            {
              id: uuidv4(),
              title: '공통 컴포넌트 라이브러리 구축',
              description: '유사한 기능들을 공통 라이브러리로 추출',
              completed: false
            },
            {
              id: uuidv4(),
              title: '표준 프로젝트 템플릿 작성',
              description: '새 프로젝트를 위한 표준 템플릿 개발',
              completed: false
            }
          ]
        };

      default:
        return null;
    }
  }

  /**
   * 실행 중인 분석 상태 조회
   */
  getRunningAnalysis(): Array<{ id: string; type: AnalysisType; startTime: number; projectCount: number }> {
    return Array.from(this.runningAnalysis.values()).map(context => ({
      id: context.id,
      type: context.type,
      startTime: context.startTime,
      projectCount: context.projects.length
    }));
  }

  /**
   * 분석 취소
   */
  async cancelAnalysis(analysisId: string): Promise<boolean> {
    if (this.runningAnalysis.has(analysisId)) {
      this.runningAnalysis.delete(analysisId);
      this.logger.info('분석 취소됨', { id: analysisId });
      return true;
    }
    return false;
  }
}

export default CrossProjectAnalyzer;