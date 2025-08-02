# MCP (Model Context Protocol) 소개

## MCP란?

**Model Context Protocol** - Anthropic이 개발한 AI 모델과 외부 시스템 간의 표준 통신 프로토콜

## 주요 특징

1. **도구 확장**: AI가 사용할 수 있는 커스텀 도구 제공
2. **컨텍스트 공유**: 외부 데이터소스와 연결
3. **표준화된 인터페이스**: JSON-RPC 기반 통신

## MCP 서버 기본 구조

```typescript
// 기본 MCP 서버 예시
{
  tools: [{
    name: "search_database",
    description: "데이터베이스 검색",
    inputSchema: { ... }
  }],
  
  resources: [{
    uri: "file:///path/to/resource",
    mimeType: "text/plain"
  }]
}
```

## 활용 예시

- 데이터베이스 직접 연결
- 파일 시스템 고급 접근
- 외부 API 통합
- 커스텀 비즈니스 로직 실행

## Claude Desktop 연동

MCP 서버는 Claude Desktop 앱에서 설정하여 AI가 추가 기능을 사용할 수 있게 합니다.

## MCP 시스템 구성요소

```
[사용자] → [Claude Desktop] → [MCP Server] → [외부 시스템]
                ↑                    ↓
            MCP Client           MCP Protocol
           (내장되어 있음)        (JSON-RPC)
```

### 개발 필요 요소

- **MCP 서버만 개발하면 됩니다**
- Claude Desktop이 MCP 클라이언트 역할
- 사용자는 Claude Desktop을 통해 상호작용
- MCP 프로토콜은 이미 정의됨

---

작성일: 2025-08-02  
최종 수정일: 2025-01-03  
작성자: yaioyaio