# Tech Review Guide

## 오픈소스 라이선스 위험 사례

| 프로젝트 | 변경 내용 | 연도 |
|----------|----------|------|
| HashiCorp Terraform | BSL 전환 | 2023 |
| Redis | 라이선스 변경 | 2024 |
| Elasticsearch | SSPL 전환 | 2021 |

## 추상화 레이어 패턴

```typescript
// 추상 인터페이스
interface DBSchemaAbstraction {
  models: Model[];
  relations: Relation[];
  indexes: Index[];
}

// 구현체별 Emitter
class PrismaEmitter implements SchemaEmitter { }
class TypeORMEmitter implements SchemaEmitter { }
class ANSISQLEmitter implements SchemaEmitter { }
```

## 토큰 효율화 전략

### Symbolic Index 패턴
```
agents/database/User → refs/prisma-schema#User → 직접 로드
→ 벡터 계산 없이 O(1) 접근
```

### 하이브리드 Query Router
```
쿼리 유형 분석 → 최적 검색 방식 선택
├── 구조적 참조 → Symbolic Index
├── 반복 프롬프트 → Cache
├── 메타데이터 → Local OLAP
└── 의미적 유사도 → RAG
```
