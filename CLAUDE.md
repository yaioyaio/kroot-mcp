# devflow-monitor-mcp — CLAUDE.md

이 저장소의 에이전트 진입 문서다. 프로젝트 전반 규칙은 kroot 루트의 `CLAUDE.md`·`AGENTS.md` 를 따른다(`AGENTS.md` 와 같은 내용).

## 🔴 민감정보 — 모든 작업자 공통 (2026-11-11)

누가 작업하든, 어떤 AI 에이전트(Claude Code·Codex·그 밖의 도구)든, 어떤 세션·워크트리·서브에이전트든 예외 없이 적용한다. 다른 어떤 작업 지시보다 우선한다. 같은 절이 kroot 루트 `CLAUDE.md`·`AGENTS.md` 와 이 프로젝트에 포함된 모든 저장소의 진입 문서에 있다.

1. **시크릿 파일을 읽지 않는다 — 특히 `*.env.*`.** `.env`, `.env.local`, `.env.<환경>`, `<이름>.env`, `<이름>.env.<접미사>`(백업본 포함), `*.deploy.*env`, 키·인증서(`*.pem/*.key/*.p12/*.jks`), `*secret*`·`*credential*`·`*token*` 값 파일, `~/.ssh`. `*.example` 만 예외다. cat/grep/head/tail/sed/awk/source/복사, 파일 읽기·검색 도구, python·node 등 다른 프로그램으로 여는 것 모두 같다.
2. **값이 출력되는 명령을 실행하지 않는다.** `docker inspect`(출력 필드 미지정 또는 Env·전체 Config), `docker exec/run … env|printenv|set`, `docker compose config`, 호스트 `env`·`printenv`. 컨테이너 상태는 `docker inspect <c> --format '{{.State.Status}} {{.RestartCount}} {{.Image}}'` 처럼 필드를 지정해 본다.
3. **로그 원문을 그대로 출력하지 않는다.** 컨테이너·앱 로그에는 접속 문자열(`scheme://user:pass@host`)·계정명이 섞여 나온다. 건수만 세거나 자격부·계정·주소를 지운 뒤 본다.
4. **DB 사용자명·비밀번호·접속 URL·토큰·키·서버 IP/호스트/계정/경로**를 명령 인자·출력·보고서·커밋에 넣지 않는다.
5. **전달 의무.** 서브에이전트·워크트리 작업자·다른 에이전트에게 일을 맡길 때 이 절을 지시서에 넣는다. 맡은 쪽이 다시 맡길 때도 그대로 넘긴다.
6. **차단 장치를 우회하지 않는다.** Claude Code 세션에는 실행 전 차단 훅(`block-secret-exposure.sh`)과 `permissions.deny` 가 1·2번을 막는다(서브에이전트 포함). Codex·일반 터미널에는 이 장치가 없으므로 규칙이 유일한 방어다 — 더 엄격히 지킨다.
7. **값이 꼭 필요한 작업은 하지 않는다.** 사용자가 직접 실행할 스크립트를 제공한다. 노출되면 축소하지 않고 사고로 보고한다.

