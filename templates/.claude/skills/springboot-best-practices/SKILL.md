---
name: springboot-best-practices
description: Spring Boot patterns for enterprise Java applications
---

## Purpose

Apply Spring Boot patterns for building enterprise-grade applications.

## Rules

### 1. Project Structure

```yaml
structure:
  layout: layered architecture
  packages:
    - controller: REST endpoints
    - service: Business logic
    - repository: Data access
    - model/entity: Domain objects
    - dto: Data transfer objects
    - config: Configuration classes
    - exception: Custom exceptions

example: |
  com.example.app/
  ├── controller/
  │   └── UserController.java
  ├── service/
  │   ├── UserService.java
  │   └── impl/UserServiceImpl.java
  ├── repository/
  │   └── UserRepository.java
  ├── model/
  │   └── User.java
  ├── dto/
  │   ├── UserRequest.java
  │   └── UserResponse.java
  ├── config/
  │   └── SecurityConfig.java
  └── exception/
      └── UserNotFoundException.java
```

### 2. Dependency Injection

```yaml
prefer:
  - Constructor injection over field injection
  - Interface-based dependencies
  - @RequiredArgsConstructor with final fields

patterns: |
  // GOOD: Constructor injection
  @Service
  @RequiredArgsConstructor
  public class UserService {
      private final UserRepository userRepository;
      private final EmailService emailService;
  }

  // AVOID: Field injection
  @Service
  public class UserService {
      @Autowired
      private UserRepository userRepository; // Not recommended
  }
```

### 3. REST API Design

```yaml
controller:
  annotations:
    - "@RestController"
    - "@RequestMapping with base path"
    - "@Validated for input validation"

patterns: |
  @RestController
  @RequestMapping("/api/v1/users")
  @RequiredArgsConstructor
  public class UserController {

      private final UserService userService;

      @GetMapping("/{id}")
      public ResponseEntity<UserResponse> getUser(@PathVariable Long id) {
          return ResponseEntity.ok(userService.findById(id));
      }

      @PostMapping
      @ResponseStatus(HttpStatus.CREATED)
      public UserResponse createUser(@Valid @RequestBody UserRequest request) {
          return userService.create(request);
      }

      @PutMapping("/{id}")
      public UserResponse updateUser(
          @PathVariable Long id,
          @Valid @RequestBody UserRequest request
      ) {
          return userService.update(id, request);
      }

      @DeleteMapping("/{id}")
      @ResponseStatus(HttpStatus.NO_CONTENT)
      public void deleteUser(@PathVariable Long id) {
          userService.delete(id);
      }
  }
```

### 4. Service Layer

```yaml
principles:
  - Business logic in service layer
  - Transaction boundaries at service level
  - Interface + implementation pattern

patterns: |
  public interface UserService {
      UserResponse findById(Long id);
      UserResponse create(UserRequest request);
  }

  @Service
  @Transactional(readOnly = true)
  @RequiredArgsConstructor
  public class UserServiceImpl implements UserService {

      private final UserRepository userRepository;
      private final UserMapper userMapper;

      @Override
      public UserResponse findById(Long id) {
          User user = userRepository.findById(id)
              .orElseThrow(() -> new UserNotFoundException(id));
          return userMapper.toResponse(user);
      }

      @Override
      @Transactional
      public UserResponse create(UserRequest request) {
          User user = userMapper.toEntity(request);
          return userMapper.toResponse(userRepository.save(user));
      }
  }
```

### 5. Data Access

```yaml
repository:
  use: Spring Data JPA
  custom_queries: "@Query annotation or method naming"

patterns: |
  public interface UserRepository extends JpaRepository<User, Long> {

      Optional<User> findByEmail(String email);

      @Query("SELECT u FROM User u WHERE u.status = :status")
      List<User> findByStatus(@Param("status") UserStatus status);

      @Query(value = "SELECT * FROM users WHERE created_at > :date",
             nativeQuery = true)
      List<User> findRecentUsers(@Param("date") LocalDateTime date);
  }

entity: |
  @Entity
  @Table(name = "users")
  @Getter
  @NoArgsConstructor(access = AccessLevel.PROTECTED)
  public class User {

      @Id
      @GeneratedValue(strategy = GenerationType.IDENTITY)
      private Long id;

      @Column(nullable = false, unique = true)
      private String email;

      @Enumerated(EnumType.STRING)
      private UserStatus status;

      @CreatedDate
      private LocalDateTime createdAt;
  }
```

### 6. Exception Handling

```yaml
global_handler:
  use: "@ControllerAdvice"
  custom_exceptions: domain-specific

patterns: |
  @RestControllerAdvice
  public class GlobalExceptionHandler {

      @ExceptionHandler(UserNotFoundException.class)
      @ResponseStatus(HttpStatus.NOT_FOUND)
      public ErrorResponse handleUserNotFound(UserNotFoundException ex) {
          return new ErrorResponse("USER_NOT_FOUND", ex.getMessage());
      }

      @ExceptionHandler(MethodArgumentNotValidException.class)
      @ResponseStatus(HttpStatus.BAD_REQUEST)
      public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
          List<String> errors = ex.getBindingResult()
              .getFieldErrors()
              .stream()
              .map(e -> e.getField() + ": " + e.getDefaultMessage())
              .toList();
          return new ErrorResponse("VALIDATION_ERROR", errors);
      }
  }
```

### 7. Configuration

```yaml
profiles:
  use: application-{profile}.yml
  externalize: sensitive values

patterns: |
  # application.yml
  spring:
    profiles:
      active: ${SPRING_PROFILES_ACTIVE:local}
    datasource:
      url: ${DATABASE_URL}
      username: ${DATABASE_USERNAME}
      password: ${DATABASE_PASSWORD}

  # application-local.yml
  spring:
    datasource:
      url: jdbc:h2:mem:testdb
      driver-class-name: org.h2.Driver

configuration_class: |
  @Configuration
  @ConfigurationProperties(prefix = "app")
  @Validated
  public class AppProperties {

      @NotBlank
      private String name;

      @Min(1)
      private int maxConnections;

      // getters, setters
  }
```

### 8. Security

```yaml
principles:
  - Use Spring Security
  - Externalize secrets
  - Implement proper authentication

patterns: |
  @Configuration
  @EnableWebSecurity
  @RequiredArgsConstructor
  public class SecurityConfig {

      private final JwtTokenProvider tokenProvider;

      @Bean
      public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
          return http
              .csrf(csrf -> csrf.disable())
              .sessionManagement(session ->
                  session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
              .authorizeHttpRequests(auth -> auth
                  .requestMatchers("/api/v1/auth/**").permitAll()
                  .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                  .anyRequest().authenticated())
              .addFilterBefore(jwtFilter(), UsernamePasswordAuthenticationFilter.class)
              .build();
      }
  }
```

### 9. Testing

```yaml
layers:
  unit: "@MockBean, Mockito"
  integration: "@SpringBootTest"
  slice: "@WebMvcTest, @DataJpaTest"

patterns: |
  // Controller test
  @WebMvcTest(UserController.class)
  class UserControllerTest {

      @Autowired
      private MockMvc mockMvc;

      @MockBean
      private UserService userService;

      @Test
      void getUser_shouldReturnUser() throws Exception {
          given(userService.findById(1L))
              .willReturn(new UserResponse(1L, "test@example.com"));

          mockMvc.perform(get("/api/v1/users/1"))
              .andExpect(status().isOk())
              .andExpect(jsonPath("$.email").value("test@example.com"));
      }
  }

  // Repository test
  @DataJpaTest
  class UserRepositoryTest {

      @Autowired
      private UserRepository userRepository;

      @Test
      void findByEmail_shouldReturnUser() {
          User user = userRepository.save(new User("test@example.com"));

          Optional<User> found = userRepository.findByEmail("test@example.com");

          assertThat(found).isPresent();
          assertThat(found.get().getEmail()).isEqualTo("test@example.com");
      }
  }
```

## Application

When writing Spring Boot code:

1. **Always** use constructor injection
2. **Always** use layered architecture
3. **Prefer** interface-based services
4. **Use** DTOs for API contracts
5. **Handle** exceptions globally
6. **Externalize** configuration
7. **Secure** endpoints properly
8. **Test** each layer appropriately
