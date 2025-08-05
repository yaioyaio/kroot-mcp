/**
 * 플러그인 샌드박스 워커 스레드
 * 격리된 환경에서 플러그인 실행
 */

const { parentPort, workerData } = require('worker_threads');
const { join } = require('path');

// 워커 데이터에서 설정 추출
const { pluginPath, pluginManifest, environment } = workerData;

let plugin = null;
let apiCallCounter = 0;
const pendingAPICalls = new Map();

/**
 * 메인 스레드로 메시지 전송
 */
function sendToMain(message) {
  if (parentPort) {
    parentPort.postMessage(message);
  }
}

/**
 * 로그 전송
 */
function log(level, message, meta) {
  sendToMain({
    type: 'log',
    level,
    message,
    meta
  });
}

/**
 * API 호출 (메인 스레드로 위임)
 */
function callAPI(api, method, ...args) {
  return new Promise((resolve, reject) => {
    const callId = ++apiCallCounter;
    
    // API 접근 권한 확인
    if (!environment.allowedAPIs.includes(api)) {
      reject(new Error(`API '${api}' not allowed for this plugin`));
      return;
    }

    pendingAPICalls.set(callId, { resolve, reject });

    sendToMain({
      type: 'api_call',
      api,
      method,
      args,
      callId
    });

    // 타임아웃 설정 (30초)
    setTimeout(() => {
      if (pendingAPICalls.has(callId)) {
        pendingAPICalls.delete(callId);
        reject(new Error(`API call timeout: ${api}.${method}`));
      }
    }, 30000);
  });
}

/**
 * 제한된 API 컨텍스트 생성
 */
function createRestrictedAPIContext() {
  const context = {
    metadata: pluginManifest,
    config: pluginManifest.configSchema || {},
    
    // 이벤트 시스템 (제한된)
    events: {
      emit: (event, data) => callAPI('events', 'emit', event, data),
      on: (event, handler) => {
        // 이벤트 구독은 워커에서 직접 처리하기 어려우므로 제한
        log('warn', `Event subscription not supported in sandbox: ${event}`);
      }
    },

    // 로거
    logger: {
      debug: (message, meta) => callAPI('logger', 'debug', message, meta),
      info: (message, meta) => callAPI('logger', 'info', message, meta),
      warn: (message, meta) => callAPI('logger', 'warn', message, meta),
      error: (message, error, meta) => callAPI('logger', 'error', message, error, meta)
    },

    // 파일 시스템 (허용된 경우만)
    fs: environment.allowedAPIs.includes('fs') ? {
      readFile: (path) => callAPI('fs', 'readFile', path),
      writeFile: (path, content) => callAPI('fs', 'writeFile', path, content),
      exists: (path) => callAPI('fs', 'exists', path),
      mkdir: (path) => callAPI('fs', 'mkdir', path),
      readDir: (path) => callAPI('fs', 'readDir', path),
      watch: (path, callback) => {
        log('warn', 'File watching not supported in sandbox');
      }
    } : null,

    // HTTP 클라이언트 (허용된 경우만)
    http: environment.allowedAPIs.includes('http') ? {
      get: (url, options) => callAPI('http', 'get', url, options),
      post: (url, data, options) => callAPI('http', 'post', url, data, options),
      put: (url, data, options) => callAPI('http', 'put', url, data, options),
      delete: (url, options) => callAPI('http', 'delete', url, options)
    } : null,

    // 데이터베이스 (허용된 경우만)
    database: environment.allowedAPIs.includes('database') ? {
      query: (sql, params) => callAPI('database', 'query', sql, params),
      insert: (table, data) => callAPI('database', 'insert', table, data),
      update: (table, data, where) => callAPI('database', 'update', table, data, where),
      delete: (table, where) => callAPI('database', 'delete', table, where)
    } : null,

    // MCP 도구 (허용된 경우만)
    mcp: environment.allowedAPIs.includes('mcp') ? {
      registerTool: (name, description, handler) => callAPI('mcp', 'registerTool', name, description, handler),
      unregisterTool: (name) => callAPI('mcp', 'unregisterTool', name),
      callTool: (name, args) => callAPI('mcp', 'callTool', name, args)
    } : null,

    // 알림 (허용된 경우만)
    notifications: environment.allowedAPIs.includes('notifications') ? {
      send: (message, level, options) => callAPI('notifications', 'send', message, level, options),
      createRule: (rule) => callAPI('notifications', 'createRule', rule),
      removeRule: (ruleId) => callAPI('notifications', 'removeRule', ruleId)
    } : null,

    // 플러그인 간 통신
    communication: {
      sendMessage: (targetPlugin, message) => callAPI('communication', 'sendMessage', targetPlugin, message),
      broadcast: (event, data) => callAPI('communication', 'broadcast', event, data),
      subscribe: (event, handler) => {
        log('warn', 'Communication subscription not fully supported in sandbox');
      },
      unsubscribe: (event, handler) => {
        log('warn', 'Communication unsubscription not fully supported in sandbox');
      }
    },

    // 스토리지
    storage: {
      get: (key) => callAPI('storage', 'get', key),
      set: (key, value) => callAPI('storage', 'set', key, value),
      delete: (key) => callAPI('storage', 'delete', key),
      clear: () => callAPI('storage', 'clear'),
      keys: () => callAPI('storage', 'keys')
    }
  };

  // null인 API 제거
  Object.keys(context).forEach(key => {
    if (context[key] === null) {
      delete context[key];
    }
  });

  return context;
}

/**
 * 플러그인 로드 및 실행
 */
async function loadAndRunPlugin() {
  try {
    log('info', `Loading plugin from: ${pluginPath}`);

    // 플러그인 모듈 로드
    const pluginMainPath = join(pluginPath, pluginManifest.main);
    
    // 동적 import 또는 require 사용
    let PluginClass;
    try {
      // ES 모듈 시도
      const module = await import(`file://${pluginMainPath}`);
      PluginClass = module.default || module.Plugin || module;
    } catch (esError) {
      try {
        // CommonJS 모듈 시도
        delete require.cache[require.resolve(pluginMainPath)];
        const module = require(pluginMainPath);
        PluginClass = module.default || module.Plugin || module;
      } catch (cjsError) {
        throw new Error(`Failed to load plugin: ${esError.message} | ${cjsError.message}`);
      }
    }

    if (typeof PluginClass !== 'function') {
      throw new Error('Plugin must export a class or constructor function');
    }

    // 플러그인 인스턴스 생성
    plugin = new PluginClass();

    // 인터페이스 검증
    const requiredMethods = ['initialize', 'activate', 'deactivate', 'dispose'];
    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        throw new Error(`Missing required method: ${method}`);
      }
    }

    if (!plugin.metadata || typeof plugin.metadata !== 'object') {
      throw new Error('Missing plugin metadata');
    }

    log('info', `Plugin loaded: ${plugin.metadata.name}`);

    // 제한된 API 컨텍스트 생성
    const context = createRestrictedAPIContext();

    // 플러그인 초기화
    await plugin.initialize(context);
    log('info', 'Plugin initialized');

    // 플러그인 활성화
    await plugin.activate();
    log('info', 'Plugin activated');

    // 메트릭 전송
    sendToMain({
      type: 'metric',
      data: {
        status: 'running',
        memoryUsage: process.memoryUsage().heapUsed,
        startTime: new Date()
      }
    });

  } catch (error) {
    log('error', `Failed to load plugin: ${error.message}`, error);
    process.exit(1);
  }
}

/**
 * 메인 스레드 메시지 처리
 */
if (parentPort) {
  parentPort.on('message', (message) => {
    try {
      switch (message.type) {
        case 'api_response':
          handleAPIResponse(message);
          break;
        
        case 'shutdown':
          handleShutdown();
          break;
        
        default:
          log('warn', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      log('error', `Error handling message: ${error.message}`, error);
    }
  });
}

/**
 * API 응답 처리
 */
function handleAPIResponse(message) {
  const { callId, result, error } = message;
  const pendingCall = pendingAPICalls.get(callId);
  
  if (pendingCall) {
    pendingAPICalls.delete(callId);
    
    if (error) {
      pendingCall.reject(new Error(error));
    } else {
      pendingCall.resolve(result);
    }
  }
}

/**
 * 종료 처리
 */
async function handleShutdown() {
  try {
    log('info', 'Shutting down plugin...');
    
    if (plugin) {
      await plugin.deactivate();
      await plugin.dispose();
    }
    
    log('info', 'Plugin shutdown complete');
    process.exit(0);
  } catch (error) {
    log('error', `Error during shutdown: ${error.message}`, error);
    process.exit(1);
  }
}

/**
 * 에러 핸들링
 */
process.on('uncaughtException', (error) => {
  log('error', `Uncaught exception: ${error.message}`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', `Unhandled rejection: ${reason}`, { promise });
  process.exit(1);
});

// 플러그인 로드 시작
loadAndRunPlugin().catch((error) => {
  log('error', `Fatal error: ${error.message}`, error);
  process.exit(1);
});

// 정기적으로 메트릭 전송
setInterval(() => {
  sendToMain({
    type: 'metric',
    data: {
      memoryUsage: process.memoryUsage().heapUsed,
      timestamp: new Date()
    }
  });
}, 10000); // 10초마다