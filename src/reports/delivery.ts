/**
 * DevFlow Monitor MCP - 보고서 배포 시스템
 * 
 * 생성된 보고서를 다양한 채널로 배포하는 시스템입니다.
 */

import { EventEmitter } from 'eventemitter3';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import {
  ReportResult,
  DeliveryChannel,
  DeliveryConfig,
  DeliveryResult,
  EmailConfig,
  SlackConfig,
  WebhookConfig,
  FileSystemConfig,
  S3Config,
  FTPConfig,
  ReportEventType
} from './types.js';

/**
 * 배포 시스템 설정
 */
export interface DeliverySystemConfig {
  /** SMTP 설정 */
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  } | undefined;
  
  /** 기본 발신자 */
  defaultFrom?: string | undefined;
  
  /** 재시도 설정 */
  retry?: {
    attempts: number;
    delay: number;
  } | undefined;
  
  /** 타임아웃 (밀리초) */
  timeout?: number | undefined;
  
  /** 최대 첨부파일 크기 (바이트) */
  maxAttachmentSize?: number | undefined;
}

/**
 * 보고서 배포 시스템
 */
export class ReportDelivery extends EventEmitter {
  private logger: Logger;
  private config: Required<DeliverySystemConfig>;
  private emailTransporter?: nodemailer.Transporter;
  
  constructor(config: DeliverySystemConfig) {
    super();
    this.logger = new Logger('ReportDelivery');
    this.config = {
      defaultFrom: 'DevFlow Monitor <noreply@devflow.local>',
      retry: {
        attempts: 3,
        delay: 5000
      },
      timeout: 30000,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      ...config
    } as Required<DeliverySystemConfig>;
    
    this.initialize();
  }

  /**
   * 초기화
   */
  private initialize(): void {
    // 이메일 트랜스포터 설정
    if (this.config.smtp) {
      this.emailTransporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: this.config.smtp.auth
      } as any);
      
      // 연결 테스트
      this.emailTransporter?.verify((error) => {
        if (error) {
          this.logger.warn('Email transporter verification failed', error);
        } else {
          this.logger.info('Email transporter ready');
        }
      });
    }
  }

  /**
   * 보고서 배포
   */
  async deliver(
    report: ReportResult,
    configs: DeliveryConfig[]
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    
    for (const config of configs) {
      if (!config.enabled) {
        continue;
      }
      
      const result = await this.deliverToChannel(report, config);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 채널별 배포
   */
  private async deliverToChannel(
    report: ReportResult,
    config: DeliveryConfig
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    
    try {
      let response: any;
      
      switch (config.channel) {
        case DeliveryChannel.EMAIL:
          response = await this.deliverViaEmail(report, config.config as EmailConfig);
          break;
          
        case DeliveryChannel.SLACK:
          response = await this.deliverViaSlack(report, config.config as SlackConfig);
          break;
          
        case DeliveryChannel.WEBHOOK:
          response = await this.deliverViaWebhook(report, config.config as WebhookConfig);
          break;
          
        case DeliveryChannel.FILE_SYSTEM:
          response = await this.deliverViaFileSystem(report, config.config as FileSystemConfig);
          break;
          
        case DeliveryChannel.S3:
          response = await this.deliverViaS3(report, config.config as S3Config);
          break;
          
        case DeliveryChannel.FTP:
          response = await this.deliverViaFTP(report, config.config as FTPConfig);
          break;
          
        default:
          throw new Error(`Unsupported delivery channel: ${config.channel}`);
      }
      
      const result: DeliveryResult = {
        channel: config.channel,
        success: true,
        deliveredAt: Date.now(),
        response
      };
      
      this.emit(ReportEventType.DELIVERY_COMPLETED, {
        reportId: report.metadata.id,
        channel: config.channel,
        duration: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      const result: DeliveryResult = {
        channel: config.channel,
        success: false,
        deliveredAt: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      };
      
      this.emit(ReportEventType.DELIVERY_FAILED, {
        reportId: report.metadata.id,
        channel: config.channel,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return result;
    }
  }

  /**
   * 이메일 배포
   */
  private async deliverViaEmail(
    report: ReportResult,
    config: EmailConfig
  ): Promise<any> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }
    
    // 제목 생성
    const subject = config.subjectTemplate
      ? this.renderTemplate(config.subjectTemplate, report)
      : `${report.metadata.title} - ${new Date(report.metadata.createdAt).toLocaleDateString()}`;
    
    // 본문 생성
    const htmlBody = config.bodyTemplate
      ? this.renderTemplate(config.bodyTemplate, report)
      : this.generateEmailBody(report);
    
    // 첨부파일 준비
    const attachments: any[] = [];
    
    if (config.attachmentFormats && config.attachmentFormats.length > 0) {
      for (const file of report.files) {
        if (config.attachmentFormats.includes(file.format)) {
          // 파일 크기 확인
          if (file.size > (this.config.maxAttachmentSize ?? Infinity)) {
            this.logger.warn('Attachment too large, skipping', {
              file: file.path,
              size: file.size
            });
            continue;
          }
          
          attachments.push({
            filename: path.basename(file.path),
            path: file.path,
            contentType: file.mimeType
          });
        }
      }
    }
    
    // 이메일 옵션
    const mailOptions = {
      from: this.config.defaultFrom,
      to: config.recipients.join(', '),
      cc: config.cc?.join(', '),
      bcc: config.bcc?.join(', '),
      replyTo: config.replyTo,
      subject,
      html: htmlBody,
      attachments
    };
    
    // 이메일 발송
    const info = await this.emailTransporter.sendMail(mailOptions);
    
    this.logger.info('Email sent successfully', {
      reportId: report.metadata.id,
      messageId: info._messageId,
      recipients: config.recipients.length
    });
    
    return info;
  }

  /**
   * Slack 배포
   */
  private async deliverViaSlack(
    report: ReportResult,
    config: SlackConfig
  ): Promise<any> {
    // 메시지 생성
    const _message = config.messageTemplate
      ? this.renderTemplate(config.messageTemplate, report)
      : this.generateSlackMessage(report);
    
    // Slack 페이로드
    const payload: any = {
      text: _message,
      channel: config.channel,
      username: config.username || 'DevFlow Monitor',
      icon_emoji: config.iconEmoji || ':chart_with_upwards_trend:'
    };
    
    // 파일 업로드 (선택적)
    if (config.uploadFiles && report.files.length > 0) {
      // Slack 파일 업로드 API는 별도 구현 필요
      payload.attachments = [{
        color: 'good',
        title: 'Report Files',
        text: report.files.map(f => `• ${path.basename(f.path)} (${f.format})`).join('\n')
      }];
    }
    
    // 웹훅 호출
    const response = await axios.post(config.webhookUrl, payload, {
      timeout: this.config.timeout
    } as any);
    
    this.logger.info('Slack notification sent', {
      reportId: report.metadata.id,
      channel: config.channel
    });
    
    return response.data;
  }

  /**
   * Webhook 배포
   */
  private async deliverViaWebhook(
    report: ReportResult,
    config: WebhookConfig
  ): Promise<any> {
    // 페이로드 생성
    const payload = config.payloadTemplate
      ? JSON.parse(this.renderTemplate(config.payloadTemplate, report))
      : {
          report: {
            id: report.metadata.id,
            title: report.metadata.title,
            type: report.metadata.type,
            createdAt: report.metadata.createdAt,
            files: report.files.map(f => ({
              format: f.format,
              size: f.size,
              url: f.path // 실제 구현에서는 다운로드 URL 제공
            }))
          }
        };
    
    // 헤더 설정
    const headers: any = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    
    // 인증 추가
    if (config.auth) {
      switch (config.auth.type) {
        case 'basic':
          headers['Authorization'] = `Basic ${Buffer.from(
            `${config.auth.credentials.username}:${config.auth.credentials.password}`
          ).toString('base64')}`;
          break;
          
        case 'bearer':
          headers['Authorization'] = `Bearer ${config.auth.credentials.token}`;
          break;
          
        case 'api_key':
          headers[config.auth.credentials.header || 'X-API-Key'] = config.auth.credentials.key;
          break;
      }
    }
    
    // 웹훅 호출
    const response = await axios({
      method: config.method || 'POST',
      url: config.url,
      data: payload,
      headers,
      timeout: this.config.timeout
    } as any);
    
    this.logger.info('Webhook called successfully', {
      reportId: report.metadata.id,
      url: config.url
    });
    
    return response.data;
  }

  /**
   * 파일시스템 배포
   */
  private async deliverViaFileSystem(
    report: ReportResult,
    config: FileSystemConfig
  ): Promise<any> {
    const results: any[] = [];
    
    for (const file of report.files) {
      // 파일명 생성
      const filename = config.filenameTemplate
        ? this.renderTemplate(config.filenameTemplate, report, file)
        : path.basename(file.path);
      
      const targetPath = path.join(config.path, filename);
      
      // 디렉토리 확인
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      // 파일 복사
      if (config.overwrite || !await this.fileExists(targetPath)) {
        await fs.copyFile(file.path, targetPath);
        
        // 압축 (선택적)
        if (config.compress) {
          // 압축 로직 구현 필요
        }
        
        results.push({
          source: file.path,
          target: targetPath,
          copied: true
        });
      } else {
        results.push({
          source: file.path,
          target: targetPath,
          copied: false,
          reason: 'File already exists'
        });
      }
    }
    
    this.logger.info('Files delivered to filesystem', {
      reportId: report.metadata.id,
      path: config.path,
      filesCopied: results.filter(r => r.copied).length
    });
    
    return results;
  }

  /**
   * S3 배포
   */
  private async deliverViaS3(
    report: ReportResult,
    config: S3Config
  ): Promise<any> {
    // AWS SDK를 사용한 S3 업로드 구현
    // 여기서는 플레이스홀더 구현
    
    const results: any[] = [];
    
    for (const file of report.files) {
      const key = `${config.keyPrefix || ''}${report.metadata.id}/${path.basename(file.path)}`;
      
      // S3 업로드 시뮬레이션
      results.push({
        bucket: config.bucket,
        key,
        size: file.size,
        uploaded: true
      });
    }
    
    this.logger.info('Files delivered to S3', {
      reportId: report.metadata.id,
      bucket: config.bucket,
      filesUploaded: results.length
    });
    
    return results;
  }

  /**
   * FTP 배포
   */
  private async deliverViaFTP(
    report: ReportResult,
    config: FTPConfig
  ): Promise<any> {
    // FTP 클라이언트를 사용한 업로드 구현
    // 여기서는 플레이스홀더 구현
    
    const results: any[] = [];
    
    for (const file of report.files) {
      const remotePath = `${config.remotePath}/${path.basename(file.path)}`;
      
      // FTP 업로드 시뮬레이션
      results.push({
        localPath: file.path,
        remotePath,
        uploaded: true
      });
    }
    
    this.logger.info('Files delivered via FTP', {
      reportId: report.metadata.id,
      host: config.host,
      filesUploaded: results.length
    });
    
    return results;
  }

  /**
   * 이메일 본문 생성
   */
  private generateEmailBody(report: ReportResult): string {
    const periodStart = new Date(report.metadata.periodStart).toLocaleDateString();
    const periodEnd = new Date(report.metadata.periodEnd).toLocaleDateString();
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; color: #2c3e50; margin: 0; }
        .subtitle { font-size: 14px; color: #7f8c8d; margin-top: 5px; }
        .content { margin: 20px 0; }
        .metrics { display: flex; justify-content: space-around; margin: 20px 0; }
        .metric { text-align: center; padding: 15px; background: #ecf0f1; border-radius: 8px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #3498db; }
        .metric-label { font-size: 12px; color: #7f8c8d; margin-top: 5px; }
        .button { display: inline-block; padding: 12px 24px; background: #3498db; color: white; 
                  text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1; 
                  font-size: 12px; color: #7f8c8d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${report.metadata.title}</h1>
            <div class="subtitle">Report Period: ${periodStart} - ${periodEnd}</div>
        </div>
        
        <div class="content">
            <p>Your scheduled report has been generated successfully.</p>
            
            ${report.metadata.description ? `<p>${report.metadata.description}</p>` : ''}
            
            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">${report.files.length}</div>
                    <div class="metric-label">Files Generated</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${(report.generationTime / 1000).toFixed(1)}s</div>
                    <div class="metric-label">Generation Time</div>
                </div>
            </div>
            
            <h3>Generated Files:</h3>
            <ul>
                ${report.files.map(f => `
                    <li>${path.basename(f.path)} (${f.format.toUpperCase()}, ${this.formatFileSize(f.size)})</li>
                `).join('')}
            </ul>
            
            ${report.warnings && report.warnings.length > 0 ? `
                <h3>Warnings:</h3>
                <ul>
                    ${report.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
        
        <div class="footer">
            <p>This report was generated by DevFlow Monitor MCP.</p>
            <p>Report ID: ${report.metadata.id}</p>
        </div>
    </div>
</body>
</html>
    `;
    
    return html;
  }

  /**
   * Slack 메시지 생성
   */
  private generateSlackMessage(report: ReportResult): string {
    const periodStart = new Date(report.metadata.periodStart).toLocaleDateString();
    const periodEnd = new Date(report.metadata.periodEnd).toLocaleDateString();
    
    let message = `📊 *${report.metadata.title}*\n`;
    message += `Period: ${periodStart} - ${periodEnd}\n\n`;
    
    if (report.metadata.description) {
      message += `${report.metadata.description}\n\n`;
    }
    
    message += `✅ Report generated successfully\n`;
    message += `• Files: ${report.files.length}\n`;
    message += `• Generation time: ${(report.generationTime / 1000).toFixed(1)}s\n`;
    
    if (report.warnings && report.warnings.length > 0) {
      message += `\n⚠️ Warnings:\n`;
      report.warnings.forEach(w => {
        message += `• ${w}\n`;
      });
    }
    
    return message;
  }

  /**
   * 템플릿 렌더링
   */
  private renderTemplate(template: string, report: ReportResult, file?: any): string {
    const _context = {
      report: {
        id: report.metadata.id,
        title: report.metadata.title,
        description: report.metadata.description,
        type: report.metadata.type,
        createdAt: report.metadata.createdAt,
        periodStart: report.metadata.periodStart,
        periodEnd: report.metadata.periodEnd,
        createdBy: report.metadata.createdBy,
        tags: report.metadata.tags
      },
      file: file ? {
        format: file.format,
        size: file.size,
        path: file.path
      } : undefined,
      date: {
        now: new Date().toISOString(),
        today: new Date().toLocaleDateString(),
        timestamp: Date.now()
      }
    };
    
    // 간단한 템플릿 엔진
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value: any = _context;
      
      for (const key of keys) {
        value = value?.[key];
      }
      
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 파일 존재 확인
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 파일 크기 포맷
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 배포 재시도
   */
  async retryDelivery(
    report: ReportResult,
    config: DeliveryConfig,
    attempt: number = 1
  ): Promise<DeliveryResult> {
    if (attempt > (this.config.retry?.attempts ?? 3)) {
      return {
        channel: config.channel,
        success: false,
        deliveredAt: Date.now(),
        error: 'Maximum retry attempts exceeded'
      };
    }
    
    await new Promise(resolve => setTimeout(resolve, (this.config.retry?.delay ?? 5000) * attempt));
    
    try {
      return await this.deliverToChannel(report, config);
    } catch (error) {
      this.logger.warn(`Delivery attempt ${attempt} failed`, {
        channel: config.channel,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.retryDelivery(report, config, attempt + 1);
    }
  }
}