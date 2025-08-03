/**
 * GitMonitor 수동 테스트 스크립트
 * 
 * 실제 Git 저장소에서 GitMonitor의 동작을 테스트합니다.
 * 
 * 실행 방법:
 * node tests/manual/test-git-monitor.js
 */

import { GitMonitor } from '../../dist/monitors/git.js';
import { EventEngine } from '../../dist/events/index.js';

async function testGitMonitor() {
  console.log('🔧 GitMonitor 수동 테스트 시작');
  console.log('=====================================');

  const eventEngine = new EventEngine();
  let eventCount = 0;

  // 이벤트 구독 설정
  eventEngine.subscribe('*', (event) => {
    eventCount++;
    console.log(`\n📧 이벤트 #${eventCount} 수신:`);
    console.log(`   타입: ${event.type}`);
    console.log(`   시간: ${event.timestamp.toLocaleTimeString()}`);
    console.log(`   소스: ${event.source}`);
    
    if (event.data) {
      switch (event.type) {
        case 'git:commit':
          console.log(`   커밋: ${event.data.hash?.substring(0, 7)} - ${event.data.message}`);
          console.log(`   작성자: ${event.data.author?.name}`);
          if (event.data.stats) {
            console.log(`   통계: +${event.data.stats.insertions} -${event.data.stats.deletions} (${event.data.stats.files} 파일)`);
          }
          if (event.data.analysis?.conventional) {
            console.log(`   분석: ${event.data.analysis.type} (Conventional Commits)`);
          }
          break;
          
        case 'git:branch_created':
        case 'git:branch_updated':
        case 'git:branch_deleted':
          console.log(`   브랜치: ${event.data.branchName}`);
          if (event.data.pattern) {
            console.log(`   패턴: ${event.data.pattern.type} (${event.data.pattern.conventional ? '규칙적' : '커스텀'})`);
          }
          break;
          
        case 'git:merge':
          console.log(`   대상 브랜치: ${event.data.targetBranch}`);
          console.log(`   커밋 수: ${event.data.commitCount}`);
          if (event.data.analysis) {
            console.log(`   머지 타입: ${event.data.analysis.mergeType}`);
            console.log(`   위험도: ${event.data.analysis.risk}`);
          }
          break;
          
        case 'git:monitor_started':
        case 'git:monitor_stopped':
          console.log(`   저장소: ${event.data.repositoryPath}`);
          break;
      }
    }
  });

  try {
    // GitMonitor 인스턴스 생성
    console.log('\n🚀 GitMonitor 인스턴스 생성 중...');
    const gitMonitor = new GitMonitor(eventEngine, {
      repositoryPath: process.cwd(), // 현재 디렉토리
      pollInterval: 2000, // 2초마다 체크
      trackBranches: true,
      trackCommits: true,
      trackMerges: true,
      analyzeCommitMessages: true
    });

    // 설정 정보 출력
    const config = gitMonitor.getConfig();
    console.log('\n⚙️ GitMonitor 설정:');
    console.log(`   저장소 경로: ${config.repositoryPath}`);
    console.log(`   폴링 간격: ${config.pollInterval}ms`);
    console.log(`   브랜치 추적: ${config.trackBranches ? '활성화' : '비활성화'}`);
    console.log(`   커밋 추적: ${config.trackCommits ? '활성화' : '비활성화'}`);
    console.log(`   머지 추적: ${config.trackMerges ? '활성화' : '비활성화'}`);

    // GitMonitor 시작
    console.log('\n▶️ GitMonitor 시작 중...');
    await gitMonitor.start();
    console.log('✅ GitMonitor가 성공적으로 시작되었습니다.');

    // 상태 확인
    console.log(`📊 실행 상태: ${gitMonitor.isRunning ? '실행 중' : '정지'}`);

    // 잠시 대기하여 이벤트 모니터링
    console.log('\n🔄 Git 활동을 모니터링 중입니다...');
    console.log('   💡 다른 터미널에서 Git 명령어를 실행해보세요:');
    console.log('   - git add .');
    console.log('   - git commit -m "test: GitMonitor 테스트"');
    console.log('   - git checkout -b feature/test-branch');
    console.log('   - git merge feature/test-branch');
    console.log('\n⏱️ 30초 동안 대기 중... (Ctrl+C로 중단)');

    // 30초 대기
    await new Promise(resolve => setTimeout(resolve, 30000));

    // GitMonitor 정지
    console.log('\n⏹️ GitMonitor 정지 중...');
    await gitMonitor.stop();
    console.log('✅ GitMonitor가 성공적으로 정지되었습니다.');

    // 최종 통계
    console.log('\n📈 최종 통계:');
    console.log(`   총 이벤트 수: ${eventCount}개`);
    console.log(`   실행 상태: ${gitMonitor.isRunning ? '실행 중' : '정지'}`);

    // EventEngine 통계
    const engineStats = eventEngine.getStatistics();
    console.log(`   EventEngine 총 이벤트: ${engineStats.totalEvents}개`);
    console.log(`   Git 이벤트: ${engineStats.eventsByCategory.git || 0}개`);

  } catch (error) {
    console.error('\n❌ 테스트 중 오류 발생:', error.message);
    
    if (error.message.includes('not a Git repository')) {
      console.log('\n💡 해결 방법:');
      console.log('   1. Git 저장소 초기화: git init');
      console.log('   2. 또는 Git 저장소 디렉토리에서 실행');
    }
    
    process.exit(1);
  }

  console.log('\n🎉 GitMonitor 테스트 완료!');
  console.log('=====================================');
}

// 스크립트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testGitMonitor().catch(console.error);
}

export { testGitMonitor };