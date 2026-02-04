#!/usr/bin/env node

/**
 * DevFlow Monitor MCP - 릴리즈 테스트 실행 스크립트
 * 
 * 모든 릴리즈 테스트를 실행하고 결과를 보고합니다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

class ReleaseTestRunner {
  private results: TestResult[] = [];

  async run() {
    console.log(chalk.blue.bold('\n🚀 DevFlow Monitor MCP - 릴리즈 테스트 시작\n'));

    // 테스트 목록
    const tests = [
      {
        name: '최종 시스템 테스트',
        command: 'npm test tests/release/final-system-test.ts',
        timeout: 120000 // 2분
      },
      {
        name: '사용자 승인 테스트',
        command: 'npm test tests/release/user-acceptance-test.ts',
        timeout: 180000 // 3분
      },
      {
        name: '부하 테스트',
        command: 'npm test tests/release/load-test.ts -- --reporter=verbose',
        timeout: 300000 // 5분
      }
    ];

    // 각 테스트 실행
    for (const test of tests) {
      await this.runTest(test);
    }

    // 결과 보고
    await this.generateReport();
  }

  private async runTest(test: { name: string; command: string; timeout: number }) {
    const spinner = ora(`${test.name} 실행 중...`).start();
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(test.command, {
        timeout: test.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      const duration = Date.now() - startTime;
      
      this.results.push({
        name: test.name,
        success: true,
        duration,
        output: stdout
      });

      spinner.succeed(chalk.green(`${test.name} 성공 (${(duration / 1000).toFixed(2)}초)`));

      // 주요 메트릭 표시
      this.displayTestMetrics(stdout);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: test.name,
        success: false,
        duration,
        error: error.message,
        output: error.stdout
      });

      spinner.fail(chalk.red(`${test.name} 실패`));
      console.error(chalk.red(`  오류: ${error.message}`));
    }

    console.log(''); // 빈 줄 추가
  }

  private displayTestMetrics(output: string) {
    // 테스트 결과에서 주요 메트릭 추출
    const metrics = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };

    // Vitest 출력 파싱
    const passedMatch = output.match(/(\d+) passed/);
    const failedMatch = output.match(/(\d+) failed/);
    const skippedMatch = output.match(/(\d+) skipped/);
    const durationMatch = output.match(/Duration\s+(\d+\.?\d*)s/);

    if (passedMatch) metrics.passed = parseInt(passedMatch[1]);
    if (failedMatch) metrics.failed = parseInt(failedMatch[1]);
    if (skippedMatch) metrics.skipped = parseInt(skippedMatch[1]);
    if (durationMatch) metrics.duration = parseFloat(durationMatch[1]);

    // 성능 메트릭 추출
    const perfMetrics = this.extractPerformanceMetrics(output);

    // 메트릭 표시
    console.log(chalk.gray('  테스트 결과:'));
    console.log(chalk.gray(`    ✓ 통과: ${metrics.passed}`));
    if (metrics.failed > 0) {
      console.log(chalk.red(`    ✗ 실패: ${metrics.failed}`));
    }
    if (metrics.skipped > 0) {
      console.log(chalk.yellow(`    ○ 건너뜀: ${metrics.skipped}`));
    }

    if (perfMetrics.length > 0) {
      console.log(chalk.gray('  성능 메트릭:'));
      perfMetrics.forEach(metric => {
        console.log(chalk.gray(`    ${metric}`));
      });
    }
  }

  private extractPerformanceMetrics(output: string): string[] {
    const metrics: string[] = [];

    // 이벤트 처리 성능
    const eventsPerSecMatch = output.match(/처리 속도: ([\d.]+) events\/sec/);
    if (eventsPerSecMatch) {
      metrics.push(`이벤트 처리: ${eventsPerSecMatch[1]} events/sec`);
    }

    // 메모리 사용량
    const memoryMatch = output.match(/최대: ([\d.]+)MB/);
    if (memoryMatch) {
      metrics.push(`최대 메모리: ${memoryMatch[1]}MB`);
    }

    // 응답 시간
    const responseTimeMatch = output.match(/평균 응답 시간: ([\d.]+)ms/);
    if (responseTimeMatch) {
      metrics.push(`평균 응답 시간: ${responseTimeMatch[1]}ms`);
    }

    return metrics;
  }

  private async generateReport() {
    console.log(chalk.blue.bold('\n📊 릴리즈 테스트 결과 요약\n'));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    // 요약 통계
    console.log(chalk.white('전체 결과:'));
    console.log(chalk.green(`  ✓ 통과: ${passedTests}/${totalTests}`));
    if (failedTests > 0) {
      console.log(chalk.red(`  ✗ 실패: ${failedTests}/${totalTests}`));
    }
    console.log(chalk.gray(`  총 소요 시간: ${(totalDuration / 1000).toFixed(2)}초`));

    // 개별 테스트 결과
    console.log(chalk.white('\n개별 테스트 결과:'));
    this.results.forEach(result => {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      const duration = `(${(result.duration / 1000).toFixed(2)}초)`;
      console.log(`  ${icon} ${result.name} ${chalk.gray(duration)}`);
    });

    // 릴리즈 준비 상태
    console.log(chalk.blue.bold('\n🎯 릴리즈 준비 상태:\n'));
    
    const isReadyForRelease = failedTests === 0;
    
    if (isReadyForRelease) {
      console.log(chalk.green.bold('✅ 시스템이 릴리즈 준비가 완료되었습니다!'));
      console.log(chalk.gray('\n다음 단계:'));
      console.log(chalk.gray('  1. 버전 태깅: npm version [major|minor|patch]'));
      console.log(chalk.gray('  2. 릴리즈 노트 작성'));
      console.log(chalk.gray('  3. 배포 진행'));
    } else {
      console.log(chalk.red.bold('❌ 릴리즈 전 해결해야 할 문제가 있습니다.'));
      console.log(chalk.gray('\n실패한 테스트를 수정한 후 다시 실행하세요.'));
    }

    // 상세 보고서 생성
    await this.saveDetailedReport();

    // 종료 코드 설정
    process.exit(isReadyForRelease ? 0 : 1);
  }

  private async saveDetailedReport() {
    const reportPath = path.join(process.cwd(), 'release-test-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        duration: this.results.reduce((sum, r) => sum + r.duration, 0)
      },
      results: this.results,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage()
      }
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`\n상세 보고서 저장됨: ${reportPath}`));
  }
}

// 메인 실행
if (require.main === module) {
  const runner = new ReleaseTestRunner();
  runner.run().catch(error => {
    console.error(chalk.red('테스트 실행 중 오류 발생:'), error);
    process.exit(1);
  });
}