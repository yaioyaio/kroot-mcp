/**
 * DevFlow Monitor MCP - 피드백 분석기
 * 
 * 수집된 피드백을 분석하고 인사이트를 도출합니다.
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import {
  FeedbackMetadata,
  FeedbackAnalysis,
  FeedbackType,
  FeedbackPriority,
  FeedbackEvent,
  FeedbackEventType,
  ImprovementSuggestion
} from './types.js';
type DatabaseService = {
  prepare: (sql: string) => any;
};
import { Logger } from '../utils/logger.js';

const logger = new Logger('FeedbackAnalyzer');

/**
 * 피드백 분석기 설정
 */
export interface FeedbackAnalyzerConfig {
  /** 데이터베이스 서비스 */
  database: DatabaseService;
  
  /** 유사도 임계값 (0-1) */
  similarityThreshold?: number;
  
  /** 최소 피드백 수 (개선 제안 생성용) */
  minFeedbackForSuggestion?: number;
  
  /** 감정 분석 활성화 */
  enableSentimentAnalysis?: boolean;
  
  /** 키워드 추출 최대 개수 */
  maxKeywords?: number;
}

/**
 * 피드백 분석기
 */
export class FeedbackAnalyzer extends EventEmitter {
  private config: Required<FeedbackAnalyzerConfig>;
  private db: DatabaseService;
  
  constructor(config: FeedbackAnalyzerConfig) {
    super();
    
    this.config = {
      ...config,
      similarityThreshold: config.similarityThreshold ?? 0.7,
      minFeedbackForSuggestion: config.minFeedbackForSuggestion ?? 3,
      enableSentimentAnalysis: config.enableSentimentAnalysis ?? true,
      maxKeywords: config.maxKeywords ?? 10
    };
    
    this.db = config.database;
    this.initializeDatabase();
  }
  
  /**
   * 데이터베이스 초기화
   */
  private initializeDatabase(): void {
    // 분석 결과 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS feedback_analysis (
        id TEXT PRIMARY KEY,
        feedback_id TEXT NOT NULL,
        sentiment_score REAL,
        sentiment_label TEXT,
        sentiment_confidence REAL,
        suggested_priority TEXT,
        priority_confidence REAL,
        keywords TEXT,
        analyzed_at INTEGER NOT NULL,
        FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
      )
    `).run();
    
    // 유사 피드백 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS similar_feedback (
        feedback_id TEXT NOT NULL,
        similar_id TEXT NOT NULL,
        similarity REAL NOT NULL,
        PRIMARY KEY (feedback_id, similar_id),
        FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
        FOREIGN KEY (similar_id) REFERENCES feedback(id) ON DELETE CASCADE
      )
    `).run();
    
    // 개선 제안 테이블
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS improvement_suggestions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        impact_users INTEGER,
        impact_severity TEXT,
        impact_effort TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        feedback_ids TEXT NOT NULL
      )
    `).run();
    
    // 인덱스 생성
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_analysis_feedback ON feedback_analysis(feedback_id)').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS idx_similar_feedback ON similar_feedback(feedback_id)').run();
  }
  
  /**
   * 피드백 분석
   */
  async analyzeFeedback(feedback: FeedbackMetadata): Promise<FeedbackAnalysis> {
    try {
      logger.info('Analyzing feedback', { id: feedback.id, type: feedback.type });
      
      // 감정 분석
      const sentiment = this.config.enableSentimentAnalysis
        ? this.analyzeSentiment(feedback)
        : { score: 0, label: 'neutral' as const, confidence: 0 };
      
      // 카테고리 추천
      const suggestedCategories = this.suggestCategories(feedback);
      
      // 우선순위 추천
      const suggestedPriority = this.suggestPriority(feedback);
      
      // 유사 피드백 찾기
      const similarFeedback = await this.findSimilarFeedback(feedback);
      
      // 키워드 추출
      const keywords = this.extractKeywords(feedback);
      
      // 분석 결과 생성
      const analysis: FeedbackAnalysis = {
        id: uuidv4(),
        feedbackId: feedback.id,
        sentiment,
        suggestedCategories,
        suggestedPriority,
        similarFeedback,
        keywords,
        analyzedAt: Date.now()
      };
      
      // 분석 결과 저장
      this.saveAnalysis(analysis);
      
      // 유사 피드백 저장
      if (similarFeedback.length > 0) {
        this.saveSimilarFeedback(feedback.id, similarFeedback);
      }
      
      // 개선 제안 생성 체크
      await this.checkForImprovementSuggestions(feedback, analysis);
      
      // 이벤트 발생
      const event: FeedbackEvent = {
        type: FeedbackEventType.FEEDBACK_ANALYZED,
        feedbackId: feedback.id,
        timestamp: Date.now(),
        details: { sentiment: sentiment.label, similarCount: similarFeedback.length }
      };
      this.emit('feedbackAnalyzed', event);
      
      return analysis;
      
    } catch (error) {
      logger.error('Failed to analyze feedback', { feedbackId: feedback.id, error });
      throw error;
    }
  }
  
  /**
   * 감정 분석
   */
  private analyzeSentiment(feedback: FeedbackMetadata): {
    score: number;
    label: 'positive' | 'neutral' | 'negative';
    confidence: number;
  } {
    const text = `${feedback.title} ${feedback.description}`.toLowerCase();
    
    // 긍정적 키워드
    const positiveWords = [
      'great', 'excellent', 'love', 'amazing', 'wonderful', 'fantastic',
      'helpful', 'useful', 'perfect', 'awesome', 'good', 'nice', 'thank',
      'appreciate', 'satisfied', 'happy', 'pleased', 'impressive'
    ];
    
    // 부정적 키워드
    const negativeWords = [
      'bad', 'terrible', 'hate', 'awful', 'horrible', 'useless', 'broken',
      'frustrating', 'annoying', 'disappointed', 'unhappy', 'poor', 'worst',
      'fail', 'crash', 'bug', 'issue', 'problem', 'error', 'slow'
    ];
    
    // 강화 단어
    const intensifiers = ['very', 'extremely', 'really', 'totally', 'absolutely'];
    
    let score = 0;
    let wordCount = 0;
    
    // 단어별 점수 계산
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = 0;
      
      if (positiveWords.includes(word)) {
        wordScore = 1;
      } else if (negativeWords.includes(word)) {
        wordScore = -1;
      }
      
      // 강화 단어 체크
      if (wordScore !== 0 && i > 0 && intensifiers.includes(words[i - 1])) {
        wordScore *= 1.5;
      }
      
      if (wordScore !== 0) {
        score += wordScore;
        wordCount++;
      }
    }
    
    // 정규화 (-1 to 1)
    const normalizedScore = wordCount > 0 ? Math.max(-1, Math.min(1, score / wordCount)) : 0;
    
    // 라벨 결정
    let label: 'positive' | 'neutral' | 'negative';
    if (normalizedScore > 0.3) {
      label = 'positive';
    } else if (normalizedScore < -0.3) {
      label = 'negative';
    } else {
      label = 'neutral';
    }
    
    // 신뢰도 계산
    const confidence = Math.min(1, wordCount / 10);
    
    return { score: normalizedScore, label, confidence };
  }
  
  /**
   * 카테고리 추천
   */
  private suggestCategories(feedback: FeedbackMetadata): Array<{
    category: string;
    confidence: number;
  }> {
    const text = `${feedback.title} ${feedback.description}`.toLowerCase();
    const categories: Array<{ category: string; confidence: number }> = [];
    
    // 카테고리별 키워드
    const categoryKeywords: Record<string, string[]> = {
      ui_ux: ['ui', 'ux', 'interface', 'design', 'layout', 'button', 'screen', 'display', 'visual'],
      performance: ['slow', 'fast', 'speed', 'performance', 'lag', 'freeze', 'memory', 'cpu'],
      functionality: ['feature', 'function', 'work', 'behavior', 'action', 'operation'],
      integration: ['api', 'integration', 'connect', 'sync', 'webhook', 'external'],
      documentation: ['docs', 'documentation', 'guide', 'tutorial', 'help', 'readme'],
      security: ['security', 'auth', 'permission', 'access', 'token', 'password'],
      workflow: ['workflow', 'process', 'flow', 'step', 'sequence', 'automation']
    };
    
    // 각 카테고리에 대한 점수 계산
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      let matches = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          matches++;
        }
      }
      
      if (matches > 0) {
        const confidence = Math.min(1, matches / keywords.length);
        categories.push({ category, confidence });
      }
    }
    
    // 신뢰도 순으로 정렬
    categories.sort((a, b) => b.confidence - a.confidence);
    
    return categories.slice(0, 3); // 상위 3개 반환
  }
  
  /**
   * 우선순위 추천
   */
  private suggestPriority(feedback: FeedbackMetadata): {
    priority: FeedbackPriority;
    confidence: number;
  } {
    const text = `${feedback.title} ${feedback.description}`.toLowerCase();
    
    // 우선순위별 키워드 및 가중치
    const priorityKeywords: Record<FeedbackPriority, { keywords: string[]; weight: number }> = {
      [FeedbackPriority.CRITICAL]: {
        keywords: ['crash', 'data loss', 'security breach', 'critical', 'emergency', 'urgent'],
        weight: 4
      },
      [FeedbackPriority.HIGH]: {
        keywords: ['bug', 'error', 'broken', 'fail', 'issue', 'problem', 'important'],
        weight: 3
      },
      [FeedbackPriority.MEDIUM]: {
        keywords: ['improve', 'enhance', 'update', 'change', 'modify', 'adjust'],
        weight: 2
      },
      [FeedbackPriority.LOW]: {
        keywords: ['nice to have', 'minor', 'small', 'cosmetic', 'typo', 'suggestion'],
        weight: 1
      }
    };
    
    // 각 우선순위에 대한 점수 계산
    const scores: Record<FeedbackPriority, number> = {
      [FeedbackPriority.CRITICAL]: 0,
      [FeedbackPriority.HIGH]: 0,
      [FeedbackPriority.MEDIUM]: 0,
      [FeedbackPriority.LOW]: 0
    };
    
    let totalMatches = 0;
    
    for (const [priority, { keywords, weight }] of Object.entries(priorityKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          scores[priority as FeedbackPriority] += weight;
          totalMatches++;
        }
      }
    }
    
    // 가장 높은 점수의 우선순위 선택
    let suggestedPriority = FeedbackPriority.MEDIUM; // 기본값
    let maxScore = 0;
    
    for (const [priority, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        suggestedPriority = priority as FeedbackPriority;
      }
    }
    
    // 신뢰도 계산
    const confidence = totalMatches > 0 ? Math.min(1, totalMatches / 5) : 0.3;
    
    return { priority: suggestedPriority, confidence };
  }
  
  /**
   * 유사 피드백 찾기
   */
  private async findSimilarFeedback(feedback: FeedbackMetadata): Promise<Array<{
    id: string;
    similarity: number;
    title: string;
  }>> {
    // 최근 30일 이내의 피드백만 검색
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const candidates = this.db.prepare(`
      SELECT id, title, description, type 
      FROM feedback 
      WHERE id != ? AND submitted_at > ?
      ORDER BY submitted_at DESC 
      LIMIT 100
    `).all(feedback.id, thirtyDaysAgo) as any[];
    
    const similar: Array<{ id: string; similarity: number; title: string }> = [];
    
    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(
        `${feedback.title} ${feedback.description}`,
        `${candidate.title} ${candidate.description}`
      );
      
      if (similarity >= this.config.similarityThreshold) {
        similar.push({
          id: candidate.id,
          similarity,
          title: candidate.title
        });
      }
    }
    
    // 유사도 순으로 정렬
    similar.sort((a, b) => b.similarity - a.similarity);
    
    return similar.slice(0, 5); // 상위 5개 반환
  }
  
  /**
   * 텍스트 유사도 계산 (Jaccard 유사도)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * 키워드 추출
   */
  private extractKeywords(feedback: FeedbackMetadata): string[] {
    const text = `${feedback.title} ${feedback.description}`.toLowerCase();
    
    // 불용어
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might'
    ]);
    
    // 단어 추출 및 필터링
    const words = text
      .split(/\s+/)
      .map(word => word.replace(/[^a-z0-9]/g, ''))
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // 단어 빈도 계산
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    
    // 빈도순 정렬
    const sortedWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
    
    return sortedWords.slice(0, this.config.maxKeywords);
  }
  
  /**
   * 개선 제안 생성 체크
   */
  private async checkForImprovementSuggestions(
    feedback: FeedbackMetadata,
    analysis: FeedbackAnalysis
  ): Promise<void> {
    // 유사한 피드백이 충분히 있는지 확인
    if (analysis.similarFeedback.length < this.config.minFeedbackForSuggestion - 1) {
      return;
    }
    
    // 이미 제안이 있는지 확인
    const existingSuggestion = this.db.prepare(`
      SELECT id FROM improvement_suggestions
      WHERE feedback_ids LIKE ?
    `).get(`%${feedback.id}%`) as any;
    
    if (existingSuggestion) {
      return;
    }
    
    // 유사 피드백들의 정보 수집
    const similarIds = [feedback.id, ...analysis.similarFeedback.map(f => f.id)];
    const placeholders = similarIds.map(() => '?').join(',');
    
    const similarFeedbacks = this.db.prepare(`
      SELECT * FROM feedback WHERE id IN (${placeholders})
    `).all(...similarIds) as any[];
    
    // 공통 패턴 분석
    const commonKeywords = this.findCommonKeywords(similarFeedbacks);
    const avgPriority = this.calculateAveragePriority(similarFeedbacks);
    
    // 개선 제안 생성
    const suggestion: ImprovementSuggestion = {
      id: uuidv4(),
      feedbackIds: similarIds,
      type: this.determineImprovementType(feedback.type),
      title: `Address recurring ${feedback.type.replace('_', ' ')}: ${commonKeywords.join(', ')}`,
      description: this.generateImprovementDescription(similarFeedbacks, commonKeywords),
      impact: {
        users: similarFeedbacks.length,
        severity: this.calculateImpactSeverity(avgPriority),
        effort: 'medium' // 기본값, 실제로는 더 정교한 계산 필요
      },
      status: 'proposed',
      createdAt: Date.now()
    };
    
    // 제안 저장
    this.saveImprovementSuggestion(suggestion);
    
    // 이벤트 발생
    const event: FeedbackEvent = {
      type: FeedbackEventType.IMPROVEMENT_SUGGESTED,
      timestamp: Date.now(),
      details: { suggestionId: suggestion.id, feedbackCount: similarIds.length }
    };
    this.emit('improvementSuggested', event);
    
    logger.info('Improvement suggestion generated', {
      suggestionId: suggestion.id,
      feedbackCount: similarIds.length
    });
  }
  
  /**
   * 공통 키워드 찾기
   */
  private findCommonKeywords(feedbacks: any[]): string[] {
    const allKeywords = new Map<string, number>();
    
    for (const feedback of feedbacks) {
      const keywords = this.extractKeywords({
        id: feedback.id,
        title: feedback.title,
        description: feedback.description,
        type: feedback.type
      } as FeedbackMetadata);
      
      for (const keyword of keywords) {
        allKeywords.set(keyword, (allKeywords.get(keyword) || 0) + 1);
      }
    }
    
    // 50% 이상의 피드백에서 나타난 키워드
    const threshold = feedbacks.length * 0.5;
    const commonKeywords = Array.from(allKeywords.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([keyword]) => keyword);
    
    return commonKeywords.slice(0, 5);
  }
  
  /**
   * 평균 우선순위 계산
   */
  private calculateAveragePriority(feedbacks: any[]): number {
    const priorityValues: Record<FeedbackPriority, number> = {
      [FeedbackPriority.CRITICAL]: 4,
      [FeedbackPriority.HIGH]: 3,
      [FeedbackPriority.MEDIUM]: 2,
      [FeedbackPriority.LOW]: 1
    };
    
    const sum = feedbacks.reduce((acc, f) => acc + priorityValues[f.priority as FeedbackPriority], 0);
    return sum / feedbacks.length;
  }
  
  /**
   * 개선 타입 결정
   */
  private determineImprovementType(feedbackType: FeedbackType): 'feature' | 'fix' | 'enhancement' | 'documentation' {
    switch (feedbackType) {
      case FeedbackType.BUG_REPORT:
      case FeedbackType.PERFORMANCE_ISSUE:
        return 'fix';
      case FeedbackType.FEATURE_REQUEST:
        return 'feature';
      case FeedbackType.DOCUMENTATION:
        return 'documentation';
      default:
        return 'enhancement';
    }
  }
  
  /**
   * 영향도 심각도 계산
   */
  private calculateImpactSeverity(avgPriority: number): 'high' | 'medium' | 'low' {
    if (avgPriority >= 3.5) return 'high';
    if (avgPriority >= 2.5) return 'medium';
    return 'low';
  }
  
  /**
   * 개선 설명 생성
   */
  private generateImprovementDescription(feedbacks: any[], keywords: string[]): string {
    const types = new Set(feedbacks.map(f => f.type));
    const typeList = Array.from(types).join(', ');
    
    return `Multiple users (${feedbacks.length}) have reported similar ${typeList} related to: ${keywords.join(', ')}. ` +
           `This recurring pattern suggests a systematic issue that should be addressed to improve user experience.`;
  }
  
  /**
   * 분석 결과 저장
   */
  private saveAnalysis(analysis: FeedbackAnalysis): void {
    const stmt = this.db.prepare(`
      INSERT INTO feedback_analysis (
        id, feedback_id, sentiment_score, sentiment_label, sentiment_confidence,
        suggested_priority, priority_confidence, keywords, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      analysis.id,
      analysis.feedbackId,
      analysis.sentiment.score,
      analysis.sentiment.label,
      analysis.sentiment.confidence,
      analysis.suggestedPriority.priority,
      analysis.suggestedPriority.confidence,
      JSON.stringify(analysis.keywords),
      analysis.analyzedAt
    );
  }
  
  /**
   * 유사 피드백 저장
   */
  private saveSimilarFeedback(feedbackId: string, similarFeedback: Array<{
    id: string;
    similarity: number;
    title: string;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO similar_feedback (feedback_id, similar_id, similarity)
      VALUES (?, ?, ?)
    `);
    
    for (const similar of similarFeedback) {
      stmt.run(feedbackId, similar.id, similar.similarity);
    }
  }
  
  /**
   * 개선 제안 저장
   */
  private saveImprovementSuggestion(suggestion: ImprovementSuggestion): void {
    const stmt = this.db.prepare(`
      INSERT INTO improvement_suggestions (
        id, type, title, description, impact_users, impact_severity,
        impact_effort, status, created_at, feedback_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      suggestion.id,
      suggestion.type,
      suggestion.title,
      suggestion.description,
      suggestion.impact.users,
      suggestion.impact.severity,
      suggestion.impact.effort,
      suggestion.status,
      suggestion.createdAt,
      JSON.stringify(suggestion.feedbackIds)
    );
  }
  
  /**
   * 분석 결과 조회
   */
  async getAnalysis(feedbackId: string): Promise<FeedbackAnalysis | null> {
    const row = this.db.prepare(`
      SELECT * FROM feedback_analysis WHERE feedback_id = ?
    `).get(feedbackId) as any;
    
    if (!row) {
      return null;
    }
    
    // 유사 피드백 조회
    const similarRows = this.db.prepare(`
      SELECT sf.similar_id, sf.similarity, f.title
      FROM similar_feedback sf
      JOIN feedback f ON sf.similar_id = f.id
      WHERE sf.feedback_id = ?
      ORDER BY sf.similarity DESC
    `).all(feedbackId) as any[];
    
    return {
      id: row.id,
      feedbackId: row.feedback_id,
      sentiment: {
        score: row.sentiment_score,
        label: row.sentiment_label,
        confidence: row.sentiment_confidence
      },
      suggestedCategories: [], // TODO: 카테고리 저장/조회 구현
      suggestedPriority: {
        priority: row.suggested_priority,
        confidence: row.priority_confidence
      },
      similarFeedback: similarRows.map(r => ({
        id: r.similar_id,
        similarity: r.similarity,
        title: r.title
      })),
      keywords: JSON.parse(row.keywords || '[]'),
      analyzedAt: row.analyzed_at
    };
  }
  
  /**
   * 개선 제안 목록 조회
   */
  async listImprovementSuggestions(
    status?: string,
    limit: number = 50
  ): Promise<ImprovementSuggestion[]> {
    let query = 'SELECT * FROM improvement_suggestions';
    const params: any[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const rows = this.db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      feedbackIds: JSON.parse(row.feedback_ids),
      type: row.type,
      title: row.title,
      description: row.description,
      impact: {
        users: row.impact_users,
        severity: row.impact_severity,
        effort: row.impact_effort
      },
      status: row.status,
      createdAt: row.created_at
    }));
  }
}