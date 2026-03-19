oh-my-customcode는 Claude Code를 커스터마이징하는 AI 에이전트 시스템(npm 패키지)입니다.

**아키텍처**: 44개 전문 에이전트, 75개 스킬, 14개 규칙, 2개 가이드로 구성.
라우팅 스킬(secretary/dev-lead/de-lead/qa-lead)이 작업을 전문 서브에이전트에 위임하는 오케스트레이션 패턴.

**에이전트 분류**:
- SW Engineer (언어 6, 백엔드 6, 프론트엔드 4, 도구 3)
- Data Engineering 6, Database 3, Security 1, Infrastructure 2
- QA 3, Manager 6, System 2, Architect 2

**핵심 규칙**: R006 관심사 분리, R007 에이전트 식별, R009 병렬 실행, R010 오케스트레이터 위임.

**기술 스택**: TypeScript/Bun, GitHub Actions, npm.
**CLI 명령**: omcustom init, list, doctor.
**디렉토리**: .claude/agents/, .claude/skills/, .claude/rules/, guides/, packages/.
