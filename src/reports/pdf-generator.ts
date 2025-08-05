/**
 * DevFlow Monitor MCP - PDF 보고서 생성기
 * 
 * PDF 형식의 보고서를 생성하는 모듈입니다.
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import {
  ReportMetadata,
  ReportConfig,
  ReportData,
  ReportSection,
  ReportSectionType,
  ChartData,
  TableData,
  ReportStyling
} from './types.js';

/**
 * PDF 생성기 설정
 */
export interface PDFGeneratorConfig {
  /** 폰트 디렉토리 */
  fontsPath?: string;
  
  /** 이미지 디렉토리 */
  imagesPath?: string;
  
  /** 기본 여백 */
  margins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  
  /** 페이지 크기 */
  pageSize?: 'A4' | 'Letter' | 'Legal';
  
  /** 페이지 방향 */
  orientation?: 'portrait' | 'landscape';
}

/**
 * PDF 보고서 생성기
 */
export class PDFGenerator {
  private logger: Logger;
  private config: Required<PDFGeneratorConfig>;
  
  constructor(config: PDFGeneratorConfig = {}) {
    this.logger = new Logger('PDFGenerator');
    this.config = {
      fontsPath: config.fontsPath || './fonts',
      imagesPath: config.imagesPath || './images',
      margins: config.margins || {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      },
      pageSize: config.pageSize || 'A4',
      orientation: config.orientation || 'portrait'
    };
  }

  /**
   * PDF 보고서 생성
   */
  async generatePDF(
    metadata: ReportMetadata,
    config: ReportConfig,
    data: ReportData,
    outputPath: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // PDF 문서 생성
        const doc = new PDFDocument({
          size: this.config.pageSize,
          layout: this.config.orientation,
          margins: this.config.margins,
          bufferPages: true
        });
        
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        
        // 스타일 적용
        if (config.styling) {
          this.applyStyles(doc, config.styling);
        }
        
        // 표지 생성
        this.generateCoverPage(doc, metadata, config);
        
        // 목차 생성
        this.generateTableOfContents(doc, config.sections.filter(s => s.enabled));
        
        // 섹션별 콘텐츠 생성
        for (const section of config.sections.filter(s => s.enabled)) {
          this.generateSection(doc, section, data);
        }
        
        // 페이지 번호 추가
        this.addPageNumbers(doc);
        
        // 문서 완료
        doc.end();
        
        // 파일로 저장
        if (outputPath) {
          const stream = fs.createWriteStream(outputPath);
          doc.pipe(stream);
        }
      } catch (error) {
        this.logger.error('Failed to generate PDF', error);
        reject(error);
      }
    });
  }

  /**
   * 스타일 적용
   */
  private applyStyles(doc: PDFDocument, styling: ReportStyling): void {
    // 색상 스키마 설정
    if (styling.colors) {
      // PDFKit에서는 직접적인 테마 적용이 제한적이므로
      // 각 요소를 그릴 때 색상을 적용
    }
    
    // 폰트 설정
    if (styling.fonts) {
      try {
        if (styling.fonts.body) {
          const fontPath = path.join(this.config.fontsPath, styling.fonts.body);
          if (fs.existsSync(fontPath)) {
            doc.font(fontPath);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to load custom font', error);
      }
    }
  }

  /**
   * 표지 생성
   */
  private generateCoverPage(
    doc: PDFDocument,
    metadata: ReportMetadata,
    config: ReportConfig
  ): void {
    // 로고 추가
    if (config.styling?.logoUrl) {
      try {
        const logoPath = path.join(this.config.imagesPath, 'logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, doc.page.width / 2 - 50, 100, { width: 100 });
        }
      } catch (error) {
        this.logger.warn('Failed to add logo', error);
      }
    }
    
    // 제목
    doc.fontSize(32)
       .fillColor(config.styling?.colors?.primary || '#333333')
       .text(metadata.title, { align: 'center' });
    
    doc.moveDown(2);
    
    // 부제목
    if (metadata.description) {
      doc.fontSize(16)
         .fillColor('#666666')
         .text(metadata.description, { align: 'center' });
    }
    
    doc.moveDown(4);
    
    // 보고 기간
    doc.fontSize(14)
       .fillColor('#333333')
       .text('Report Period', { align: 'center' });
    
    doc.fontSize(12)
       .fillColor('#666666')
       .text(
         `${new Date(metadata.periodStart).toLocaleDateString()} - ${new Date(metadata.periodEnd).toLocaleDateString()}`,
         { align: 'center' }
       );
    
    // 생성 정보
    doc.moveDown(2);
    doc.fontSize(10)
       .fillColor('#999999')
       .text(`Generated on ${new Date(metadata.createdAt).toLocaleString()}`, { align: 'center' })
       .text(`Created by ${metadata.createdBy}`, { align: 'center' });
    
    // 새 페이지
    doc.addPage();
  }

  /**
   * 목차 생성
   */
  private generateTableOfContents(doc: PDFDocument, sections: ReportSection[]): void {
    doc.fontSize(24)
       .fillColor('#333333')
       .text('Table of Contents');
    
    doc.moveDown();
    
    let pageNumber = 3; // 표지와 목차 다음부터 시작
    
    sections.forEach((section, index) => {
      doc.fontSize(12)
         .fillColor('#0066cc')
         .text(`${index + 1}. ${section.name}`, {
           link: pageNumber,
           underline: true
         });
      
      doc.fillColor('#666666')
         .text(`Page ${pageNumber}`, {
           align: 'right',
           continued: -1
         });
      
      doc.moveDown(0.5);
      pageNumber++; // 실제 구현에서는 섹션별 페이지 수 계산 필요
    });
    
    doc.addPage();
  }

  /**
   * 섹션 생성
   */
  private generateSection(
    doc: PDFDocument,
    section: ReportSection,
    data: ReportData
  ): void {
    // 섹션 제목
    doc.fontSize(20)
       .fillColor('#333333')
       .text(section.name);
    
    doc.moveDown();
    
    // 섹션 타입별 콘텐츠 생성
    switch (section.type) {
      case ReportSectionType.EXECUTIVE_SUMMARY:
        this.generateExecutiveSummary(doc, data);
        break;
        
      case ReportSectionType.METRICS_OVERVIEW:
        this.generateMetricsOverview(doc, data);
        break;
        
      case ReportSectionType.ACTIVITY_TIMELINE:
        this.generateActivityTimeline(doc, data);
        break;
        
      case ReportSectionType.DEVELOPMENT_STAGES:
        this.generateDevelopmentStages(doc, data);
        break;
        
      case ReportSectionType.METHODOLOGY_COMPLIANCE:
        this.generateMethodologyCompliance(doc, data);
        break;
        
      case ReportSectionType.AI_COLLABORATION:
        this.generateAICollaboration(doc, data);
        break;
        
      case ReportSectionType.BOTTLENECK_ANALYSIS:
        this.generateBottleneckAnalysis(doc, data);
        break;
        
      case ReportSectionType.PERFORMANCE_TRENDS:
        this.generatePerformanceTrends(doc, data);
        break;
        
      case ReportSectionType.QUALITY_METRICS:
        this.generateQualityMetrics(doc, data);
        break;
        
      case ReportSectionType.TEAM_PRODUCTIVITY:
        this.generateTeamProductivity(doc, data);
        break;
        
      case ReportSectionType.RECOMMENDATIONS:
        this.generateRecommendations(doc, data);
        break;
        
      case ReportSectionType.CUSTOM:
        this.generateCustomSection(doc, section, data);
        break;
    }
    
    // 섹션 끝에 페이지 추가
    doc.addPage();
  }

  /**
   * 경영진 요약 생성
   */
  private generateExecutiveSummary(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.executiveSummary) return;
    
    const summary = data.analysis.executiveSummary;
    
    // 핵심 지표 박스
    this.drawMetricBox(doc, 'Total Events', summary.totalEvents.toLocaleString(), 50, doc.y);
    this.drawMetricBox(doc, 'Active Users', summary.activeUsers.toString(), 200, doc.y);
    this.drawMetricBox(doc, 'Productivity', `${summary.productivityScore.toFixed(1)}%`, 350, doc.y);
    this.drawMetricBox(doc, 'Quality', `${summary.qualityScore.toFixed(1)}%`, 500, doc.y);
    
    doc.moveDown(4);
    
    // 주요 하이라이트
    if (summary.keyHighlights?.length > 0) {
      doc.fontSize(14)
         .fillColor('#333333')
         .text('Key Highlights');
      
      doc.moveDown(0.5);
      
      summary.keyHighlights.forEach(highlight => {
        doc.fontSize(11)
           .fillColor('#666666')
           .text(`• ${highlight}`, { indent: 20 });
      });
    }
  }

  /**
   * 메트릭 개요 생성
   */
  private generateMetricsOverview(doc: PDFDocument, data: ReportData): void {
    if (!data.metrics) return;
    
    // 메트릭 차트가 있다면 표시
    const metricsChart = data.charts?.find(c => c.id === 'metrics-timeline');
    if (metricsChart) {
      this.drawChart(doc, metricsChart);
    }
    
    // 주요 메트릭 테이블
    if (data.metrics) {
      doc.moveDown();
      this.drawMetricsTable(doc, data.metrics);
    }
  }

  /**
   * 활동 타임라인 생성
   */
  private generateActivityTimeline(doc: PDFDocument, data: ReportData): void {
    if (!data.events || data.events.length === 0) return;
    
    // 활동 히트맵 차트
    const heatmapChart = data.charts?.find(c => c.id === 'activity-heatmap');
    if (heatmapChart) {
      this.drawChart(doc, heatmapChart);
    }
    
    // 최근 활동 목록
    doc.moveDown();
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Recent Activities');
    
    doc.moveDown(0.5);
    
    const recentEvents = data.events.slice(0, 10);
    recentEvents.forEach(event => {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`${new Date(event.timestamp).toLocaleString()} - ${event.category}: ${event.description}`);
    });
  }

  /**
   * 개발 단계 생성
   */
  private generateDevelopmentStages(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.developmentStages) return;
    
    const stages = data.analysis.developmentStages;
    
    // 현재 단계
    doc.fontSize(14)
       .fillColor('#333333')
       .text(`Current Stage: ${stages.currentStage}`);
    
    doc.moveDown();
    
    // 단계 진행률 차트
    const progressChart = data.charts?.find(c => c.id === 'stage-progress');
    if (progressChart) {
      this.drawChart(doc, progressChart);
    }
  }

  /**
   * 방법론 준수도 생성
   */
  private generateMethodologyCompliance(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.methodologyCompliance) return;
    
    const compliance = data.analysis.methodologyCompliance;
    
    // 방법론 점수 차트
    const scoresChart = data.charts?.find(c => c.id === 'methodology-scores');
    if (scoresChart) {
      this.drawChart(doc, scoresChart);
    }
    
    // 상세 점수
    doc.moveDown();
    Object.entries(compliance.scores).forEach(([method, score]) => {
      this.drawProgressBar(doc, method.toUpperCase(), score as number);
      doc.moveDown(0.5);
    });
  }

  /**
   * AI 협업 생성
   */
  private generateAICollaboration(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.aiCollaboration) return;
    
    const ai = data.analysis.aiCollaboration;
    
    // AI 사용 차트
    const usageChart = data.charts?.find(c => c.id === 'ai-usage');
    if (usageChart) {
      this.drawChart(doc, usageChart);
    }
    
    // AI 효과성 메트릭
    doc.moveDown();
    doc.fontSize(12)
       .fillColor('#333333')
       .text('AI Effectiveness Metrics');
    
    doc.moveDown(0.5);
    
    if (ai.effectiveness) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Acceptance Rate: ${(ai.effectiveness.acceptanceRate * 100).toFixed(1)}%`)
         .text(`Modification Rate: ${(ai.effectiveness.modificationRate * 100).toFixed(1)}%`)
         .text(`Time Saved: ${ai.effectiveness.timeSaved} hours`);
    }
  }

  /**
   * 병목 분석 생성
   */
  private generateBottleneckAnalysis(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.bottlenecks) return;
    
    // 병목 테이블
    const bottleneckTable = data.tables?.find(t => t.id === 'bottleneck-list');
    if (bottleneckTable) {
      this.drawTable(doc, bottleneckTable);
    }
  }

  /**
   * 성능 트렌드 생성
   */
  private generatePerformanceTrends(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.performanceTrends) return;
    
    const trends = data.analysis.performanceTrends;
    
    // 트렌드 지표
    Object.entries(trends).forEach(([metric, trend]) => {
      if (trend && typeof trend === 'object') {
        this.drawTrendIndicator(doc, metric, trend);
        doc.moveDown(0.5);
      }
    });
  }

  /**
   * 품질 메트릭 생성
   */
  private generateQualityMetrics(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.qualityMetrics) return;
    
    const quality = data.analysis.qualityMetrics;
    
    // 품질 트렌드 차트
    const trendsChart = data.charts?.find(c => c.id === 'quality-trends');
    if (trendsChart) {
      this.drawChart(doc, trendsChart);
    }
    
    // 품질 지표
    doc.moveDown();
    Object.entries(quality).forEach(([metric, value]) => {
      if (typeof value === 'number') {
        doc.fontSize(10)
           .fillColor('#666666')
           .text(`${metric}: ${value.toFixed(2)}`);
      }
    });
  }

  /**
   * 팀 생산성 생성
   */
  private generateTeamProductivity(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.teamProductivity) return;
    
    const productivity = data.analysis.teamProductivity;
    
    // 생산성 지표
    Object.entries(productivity).forEach(([metric, value]) => {
      if (typeof value === 'number') {
        this.drawMetricBox(doc, metric, value.toFixed(2), doc.x, doc.y);
        doc.moveDown(2);
      }
    });
  }

  /**
   * 권장사항 생성
   */
  private generateRecommendations(doc: PDFDocument, data: ReportData): void {
    if (!data.analysis?.recommendations || data.analysis.recommendations.length === 0) return;
    
    const recommendations = data.analysis.recommendations;
    
    doc.fontSize(12)
       .fillColor('#333333')
       .text('Recommendations');
    
    doc.moveDown(0.5);
    
    recommendations.forEach((rec, index) => {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`${index + 1}. ${rec}`, { indent: 20 });
      doc.moveDown(0.5);
    });
  }

  /**
   * 커스텀 섹션 생성
   */
  private generateCustomSection(
    doc: PDFDocument,
    section: ReportSection,
    data: ReportData
  ): void {
    if (data.custom && data.custom[section.id]) {
      const customData = data.custom[section.id];
      
      // 커스텀 데이터를 JSON으로 표시 (실제 구현에서는 더 나은 렌더링 필요)
      doc.fontSize(10)
         .font('Courier')
         .fillColor('#666666')
         .text(JSON.stringify(customData, null, 2));
    }
  }

  /**
   * 페이지 번호 추가
   */
  private addPageNumbers(doc: PDFDocument): void {
    const pages = doc.bufferedPageRange();
    
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      
      // 표지는 제외
      if (i > 0) {
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        
        doc.fontSize(9)
           .fillColor('#999999')
           .text(
             `Page ${i} of ${pages.count - 1}`,
             0,
             doc.page.height - 50,
             { align: 'center' }
           );
        
        doc.page.margins.bottom = oldBottomMargin;
      }
    }
  }

  /**
   * 유틸리티 메서드들
   */
  
  private drawMetricBox(
    doc: PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number
  ): void {
    const boxWidth = 120;
    const boxHeight = 60;
    
    // 박스 그리기
    doc.rect(x, y, boxWidth, boxHeight)
       .fillAndStroke('#f0f0f0', '#ddd');
    
    // 라벨
    doc.fontSize(9)
       .fillColor('#666666')
       .text(label, x, y + 10, {
         width: boxWidth,
         align: 'center'
       });
    
    // 값
    doc.fontSize(16)
       .fillColor('#333333')
       .text(value, x, y + 30, {
         width: boxWidth,
         align: 'center'
       });
  }

  private drawProgressBar(
    doc: PDFDocument,
    label: string,
    value: number
  ): void {
    const barWidth = 200;
    const barHeight = 20;
    const x = doc.x;
    const y = doc.y;
    
    // 라벨
    doc.fontSize(10)
       .fillColor('#333333')
       .text(`${label}: ${value}%`);
    
    // 배경 막대
    doc.rect(x, y + 20, barWidth, barHeight)
       .fill('#f0f0f0');
    
    // 진행 막대
    doc.rect(x, y + 20, barWidth * (value / 100), barHeight)
       .fill('#4CAF50');
    
    // 테두리
    doc.rect(x, y + 20, barWidth, barHeight)
       .stroke('#ddd');
  }

  private drawTrendIndicator(
    doc: PDFDocument,
    label: string,
    trend: any
  ): void {
    const x = doc.x;
    const y = doc.y;
    
    // 라벨
    doc.fontSize(10)
       .fillColor('#333333')
       .text(label);
    
    // 값과 변화
    const changeColor = trend.change > 0 ? '#4CAF50' : trend.change < 0 ? '#f44336' : '#666666';
    const changeSymbol = trend.change > 0 ? '↑' : trend.change < 0 ? '↓' : '→';
    
    doc.fontSize(12)
       .fillColor('#333333')
       .text(`${trend.value}`, x + 150, y, { continued: true })
       .fillColor(changeColor)
       .text(` ${changeSymbol} ${Math.abs(trend.change)}%`);
  }

  private drawChart(doc: PDFDocument, chart: ChartData): void {
    // 실제 구현에서는 차트 라이브러리를 사용하여 이미지로 변환 후 삽입
    // 여기서는 플레이스홀더 표시
    const chartHeight = 200;
    
    doc.rect(doc.x, doc.y, doc.page.width - doc.x - doc.page.margins.right, chartHeight)
       .fillAndStroke('#f9f9f9', '#ddd');
    
    doc.fontSize(12)
       .fillColor('#999999')
       .text(chart.title, doc.x, doc.y + chartHeight / 2, {
         width: doc.page.width - doc.x - doc.page.margins.right,
         align: 'center'
       });
    
    doc.moveDown(chartHeight / doc.currentLineHeight());
  }

  private drawTable(doc: PDFDocument, table: TableData): void {
    // 테이블 제목
    doc.fontSize(12)
       .fillColor('#333333')
       .text(table.title);
    
    doc.moveDown(0.5);
    
    const startX = doc.x;
    const startY = doc.y;
    const cellPadding = 5;
    const rowHeight = 25;
    
    // 컬럼 너비 계산
    const totalWidth = doc.page.width - doc.x - doc.page.margins.right;
    const columnWidth = totalWidth / table.columns.length;
    
    // 헤더 그리기
    doc.rect(startX, startY, totalWidth, rowHeight)
       .fillAndStroke('#f0f0f0', '#ddd');
    
    table.columns.forEach((col, index) => {
      doc.fontSize(10)
         .fillColor('#333333')
         .text(
           col.title,
           startX + index * columnWidth + cellPadding,
           startY + cellPadding,
           { width: columnWidth - cellPadding * 2 }
         );
    });
    
    // 데이터 행 그리기
    let currentY = startY + rowHeight;
    
    table.rows.slice(0, 10).forEach(row => { // 최대 10행만 표시
      table.columns.forEach((col, index) => {
        doc.fontSize(9)
           .fillColor('#666666')
           .text(
             String(row[col.key] || ''),
             startX + index * columnWidth + cellPadding,
             currentY + cellPadding,
             { width: columnWidth - cellPadding * 2 }
           );
      });
      
      currentY += rowHeight;
      
      // 행 구분선
      doc.moveTo(startX, currentY)
         .lineTo(startX + totalWidth, currentY)
         .stroke('#eee');
    });
    
    doc.y = currentY + 10;
  }

  private drawMetricsTable(doc: PDFDocument, metrics: any): void {
    // 메트릭을 테이블 형태로 표시
    const metricsArray = Object.entries(metrics).filter(([_, value]) => 
      typeof value === 'number' || typeof value === 'string'
    );
    
    const startX = doc.x;
    const cellWidth = 200;
    const rowHeight = 20;
    
    metricsArray.forEach(([key, value], index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      
      doc.fontSize(9)
         .fillColor('#666666')
         .text(
           `${key}: ${value}`,
           startX + col * cellWidth,
           doc.y + row * rowHeight
         );
    });
    
    doc.moveDown(Math.ceil(metricsArray.length / 2) + 1);
  }
}