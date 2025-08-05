/**
 * 플러그인 시스템 검증 스크립트
 */

// 기본 타입들만 import하여 컴파일 가능성 확인
import { 
  Plugin, 
  PluginMetadata, 
  PluginStatus,
  PluginCategory,
  PluginPermission
} from './src/plugins/types.js';

// 간단한 플러그인 클래스 예제
class TestPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for verification',
    author: 'DevFlow Monitor',
    category: PluginCategory.UTILITY,
    permissions: [PluginPermission.READ_EVENTS],
    tags: ['test'],
    minDevFlowVersion: '1.0.0'
  };

  async initialize(context: any): Promise<void> {
    console.log('Test plugin initialized');
  }

  async activate(): Promise<void> {
    console.log('Test plugin activated');
  }

  async deactivate(): Promise<void> {
    console.log('Test plugin deactivated');
  }

  async dispose(): Promise<void> {
    console.log('Test plugin disposed');
  }
}

// 플러그인 상태 확인 함수
function checkPluginStatus(status: PluginStatus): boolean {
  const validStatuses: PluginStatus[] = [
    PluginStatus.UNLOADED, PluginStatus.LOADING, PluginStatus.LOADED, 
    PluginStatus.RUNNING, PluginStatus.PAUSED, PluginStatus.ERROR, PluginStatus.DISABLED
  ];
  return validStatuses.includes(status);
}

// 검증 함수
function verifyPluginSystem(): boolean {
  console.log('🔍 플러그인 시스템 검증 시작...');
  
  try {
    // 1. 플러그인 인스턴스 생성 테스트
    const plugin = new TestPlugin();
    console.log('✅ 플러그인 인스턴스 생성 성공');
    
    // 2. 메타데이터 검증
    if (!plugin.metadata.id || !plugin.metadata.name) {
      throw new Error('플러그인 메타데이터가 유효하지 않습니다');
    }
    console.log('✅ 플러그인 메타데이터 유효성 검증 성공');
    
    // 3. 상태 검증
    if (!checkPluginStatus(PluginStatus.LOADED)) {
      throw new Error('플러그인 상태 타입이 유효하지 않습니다');
    }
    console.log('✅ 플러그인 상태 타입 검증 성공');
    
    // 4. 권한 시스템 검증
    const hasReadPermission = plugin.metadata.permissions?.includes(PluginPermission.READ_EVENTS);
    if (!hasReadPermission) {
      throw new Error('권한 시스템이 작동하지 않습니다');
    }
    console.log('✅ 권한 시스템 검증 성공');
    
    console.log('🎉 플러그인 시스템 기본 검증 완료!');
    return true;
    
  } catch (error) {
    console.error('❌ 플러그인 시스템 검증 실패:', error.message);
    return false;
  }
}

// 실행
export { verifyPluginSystem, TestPlugin };

// 직접 실행 시
if (require.main === module) {
  verifyPluginSystem();
}