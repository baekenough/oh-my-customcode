---
name: springboot-best-practices
description: Spring Boot patterns for enterprise Java applications
scope: core
user-invocable: false
---

## Rules

### 1. Project Structure
Layered architecture: controller (REST), service (business logic), repository (data access), model/entity, dto, config, exception.

### 2. Dependency Injection
Constructor injection preferred. Use @RequiredArgsConstructor with final fields. Avoid field injection with @Autowired.

```java
// GOOD: Constructor injection
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final EmailService emailService;
}
```

### 3. REST API Design
@RestController + @RequestMapping. Use @Validated for input, ResponseEntity for responses, proper HTTP status codes.

See `examples/controller-example.java` for reference implementation.

### 4. Service Layer
Business logic in services. @Transactional boundaries at service level. Interface + implementation pattern.

See `examples/service-example.java` for reference implementation.

### 5. Data Access
Spring Data JPA. @Query or method naming for custom queries. @Entity with proper JPA annotations.

See `examples/repository-example.java` and `examples/entity-example.java` for reference implementations.

### 6. Exception Handling
@RestControllerAdvice for global handling. Domain-specific exceptions with proper HTTP status mapping.

See `examples/exception-handler-example.java` for reference implementation.

### 7. Configuration
Profile-based: application-{profile}.yml. @ConfigurationProperties for type-safe config. Externalize sensitive values.

```yaml
# application.yml
spring:
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:local}
  datasource:
    url: ${DATABASE_URL}
    username: ${DATABASE_USERNAME}
    password: ${DATABASE_PASSWORD}
```

See `examples/config-properties-example.java` for type-safe configuration properties.

### 8. Security
Spring Security with SecurityFilterChain. Externalize secrets. Proper authentication/authorization patterns.

See `examples/security-config-example.java` for reference implementation.

### 9. Testing
@WebMvcTest (controller), @DataJpaTest (repository), @SpringBootTest (integration), @MockBean for mocking.

See `examples/controller-test-example.java` and `examples/repository-test-example.java` for reference implementations.

## Application

Always: constructor injection, layered architecture, DTOs, global exception handling, externalized config, proper security, layer-appropriate tests.
