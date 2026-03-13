---
name: flutter-best-practices
description: Flutter/Dart development best practices for widget composition, state management, and performance
scope: core
user-invocable: false
---

## Purpose

Apply Flutter and Dart best practices from official documentation and community standards. Covers widget patterns, state management (Riverpod/BLoC), performance optimization, testing, security, and Dart 3.x language patterns.

## Core Principles

```
Widget composition over inheritance
Unidirectional data flow
Immutable state
const by default
Platform-adaptive design
```

## Rules

### 1. Widget Patterns

```yaml
composition:
  prefer: "Small, focused StatelessWidget classes"
  avoid: "Helper functions returning Widget (no Element identity)"
  reason: "Flutter diffing depends on widget type identity"

const_constructors:
  rule: "Mark all static widgets const"
  pattern: "const Text('Hello'), const SizedBox(height: 8)"
  impact: "Zero rebuild cost — compile-time constant"

sizing_widgets:
  prefer: "SizedBox for spacing/sizing"
  avoid: "Container when only size is needed"
  reason: "SizedBox is lighter, no decoration overhead"

state_choice:
  StatelessWidget: "No mutable state, pure rendering"
  StatefulWidget: "Local ephemeral state (animations, form input)"
  InheritedWidget: "Data propagation down tree (base of Provider)"

build_context:
  rule: "Never store BuildContext across async gaps"
  pattern: |
    // BAD
    final ctx = context;
    await Future.delayed(Duration(seconds: 1));
    Navigator.of(ctx).push(...); // context may be invalid

    // GOOD
    if (!mounted) return;
    Navigator.of(context).push(...);

keys:
  ValueKey: "When items have unique business identity"
  ObjectKey: "When items are objects without natural key"
  UniqueKey: "Force rebuild on every build (rare)"
  GlobalKey: "Cross-widget state access (use sparingly)"

lists:
  prefer: "ListView.builder for >10 items (lazy construction)"
  avoid: "ListView(children: [...]) for large lists"
  optimization: "Set itemExtent to skip intrinsic layout passes"

layout:
  rule: "Constraints flow down, sizes flow up"
  common_error: "Unbounded constraints in Column/Row children"
  fix: "Wrap with Expanded/Flexible or constrain explicitly"

repaint_boundary:
  when: "Frequently repainting subtrees (animations, video, maps)"
  effect: "Isolates paint scope, prevents cascade repaints"
  detect: "DevTools → highlight repaints toggle"

slivers:
  prefer: "CustomScrollView + SliverList.builder for complex scrolling"
  use_for: "Floating headers, parallax, mixed scroll content"
  avoid: "Nested ListView in ListView"
```

### 2. State Management

```yaml
default_choice:
  new_projects: "Riverpod 3.0"
  enterprise: "BLoC 9.0"
  simple_prototypes: "setState or Provider"
  avoid: "GetX (maintenance crisis, runtime crashes)"

riverpod_patterns:
  reactive_read: "ref.watch(provider) — in build methods only"
  one_time_read: "ref.read(provider) — in callbacks, onPressed"
  never: "ref.watch inside non-build methods"
  async_state: "AsyncNotifier + AsyncValue (loading/data/error)"
  family: "family modifier for parameterized providers"
  keep_alive: "Only when justified (expensive computations)"
  invalidate_vs_refresh: |
    ref.invalidate(provider)  // reset to loading, lazy re-fetch
    ref.refresh(provider)     // immediate re-fetch, return new value

bloc_patterns:
  one_event_per_action: "One UI action = one event class"
  cubit_vs_bloc: |
    Cubit: direct emit(state) — for simple state changes
    Bloc: event → state mapping — when audit trail needed
  never: "Emit state in constructor body"
  listener_vs_consumer: |
    BlocListener: side effects (navigation, snackbar)
    BlocConsumer: rebuild UI + side effects
    BlocBuilder: rebuild UI only (most common)
  stream_management: "Cancel subscriptions in close()"

state_immutability:
  rule: "All state objects must be immutable"
  tool: "freezed package for copyWith/==/hashCode generation"
  pattern: |
    @freezed
    class UserState with _$UserState {
      const factory UserState({
        required String name,
        required int age,
        @Default(false) bool isLoading,
      }) = _UserState;
    }

result_type:
  rule: "Return Result<T> from repositories, never throw"
  pattern: |
    sealed class Result<T> {
      const Result();
    }
    final class Ok<T> extends Result<T> {
      const Ok(this.value);
      final T value;
    }
    final class Error<T> extends Result<T> {
      const Error(this.error);
      final Exception error;
    }
```

### 3. Performance

```yaml
build_optimization:
  const_widgets: "Mark immutable widgets const — zero rebuild"
  localize_setState: "Call setState on smallest possible subtree"
  extract_widgets: "StatelessWidget class > helper method"
  child_parameter: |
    // GOOD: static child passed through
    AnimatedBuilder(
      animation: controller,
      builder: (context, child) => Transform.rotate(
        angle: controller.value,
        child: child, // not rebuilt
      ),
      child: const ExpensiveWidget(), // built once
    )

rebuild_avoidance:
  consumer_placement: "Place Consumer/ListenableBuilder as deep as possible"
  read_in_callbacks: "context.read<T>() not context.watch<T>() in handlers"
  selector: "Use BlocSelector/Selector for partial state rebuilds"

rendering:
  avoid_opacity: "Use color.withValues(alpha:) (Flutter 3.27+) or AnimatedOpacity instead; color.withOpacity() is deprecated"
  avoid_clip: "Pre-clip static content; avoid ClipRRect in animations"
  minimize_saveLayer: "ShaderMask, ColorFilter, Chip trigger saveLayer"

compute_offloading:
  rule: "Isolate.run() for operations >16ms (one frame budget)"
  web_compatible: "Use compute() for web-compatible apps"
  use_for: "JSON parsing, image processing, complex filtering"

frame_budget:
  target: "<8ms build + <8ms render = 16.67ms (60fps)"
  profiling: "flutter run --profile, not debug mode"
  tool: "DevTools Performance view for jank detection"
```

### 4. Testing

```yaml
test_pyramid:
  unit: "Single class/function — fast, low confidence"
  widget: "Single widget tree — fast, medium confidence"
  integration: "Full app on device — slow, high confidence"
  golden: "Visual regression via matchesGoldenFile()"

widget_test_pattern: |
  testWidgets('shows loading then content', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [productsProvider.overrideWith((_) => fakeProducts)],
        child: const MaterialApp(home: ProductListScreen()),
      ),
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.byType(ProductCard), findsNWidgets(3));
  });

mocking:
  prefer: "mocktail (null-safe, no codegen)"
  avoid: "Legacy mockito with build_runner"
  fakes: "Use Fake implementations for deterministic tests"
  pattern: |
    class FakeProductRepository extends Fake implements ProductRepository {
      @override
      Future<Result<List<Product>>> getAll() async => Ok(testProducts);
    }

bloc_testing: |
  blocTest<AuthBloc, AuthState>(
    'emits [loading, success] when login succeeds',
    build: () => AuthBloc(FakeAuthRepository()),
    act: (bloc) => bloc.add(LoginRequested('user', 'pass')),
    expect: () => [AuthLoading(), isA<AuthSuccess>()],
  );

coverage_target:
  widget_tests: "80%+ for UI logic"
  unit_tests: "90%+ for business logic"
  integration: "Critical user flows only"
```

### 5. Security

```yaml
secrets:
  never: "Hardcode API keys, tokens, or credentials in source"
  best: "Backend proxy for all sensitive API calls"
  use: "--dart-define-from-file=.env for NON-SECRET build config only (feature flags, environment URLs)"
  warning: "dart-define values are embedded in compiled binary and extractable via static analysis. Use only for non-secret build configuration (feature flags, environment URLs)."

storage:
  sensitive_data: "flutter_secure_storage v10+ (Keychain/Keystore)"
  never: "SharedPreferences for tokens, PII, or credentials"
  ios: "AppleOptions(useSecureEnclave: true) for high-value"
  android: "AndroidOptions(encryptedSharedPreferences: true)"
  web_warning: "flutter_secure_storage on Web uses localStorage by default, which is accessible to any JavaScript on the page (XSS vulnerable). For Web targets, use HttpOnly cookies managed by backend or in-memory-only storage for sensitive data."

network:
  tls: "Certificate pinning (SPKI) for financial/health apps"
  cleartext: "cleartextTrafficPermitted=false in network_security_config"
  ios_ats: "NSAllowsArbitraryLoads=false (default, never override)"

release_builds:
  obfuscate: "--obfuscate --split-debug-info=<path>"
  proguard: "Configure android/app/proguard-rules.pro"
  debug_check: "Remove all kDebugMode unguarded print() calls"
  rule: "Never ship debug APK to production"

deep_links:
  validate: "Allow-list all URI parameters with RegExp"
  reject: "Arbitrary schemes and unvalidated paths"
  prefer: "Universal Links (iOS) and App Links (Android) only"

logging:
  rule: "Guard print() with kDebugMode"
  prefer: "dart:developer log() for debug output"
  never: "Log PII, tokens, or credentials"
```

### 6. Dart Language Patterns

```yaml
naming:
  types: "UpperCamelCase for classes, enums, typedefs, extensions, mixins (e.g., HttpClient, JsonParser)"
  variables: "lowerCamelCase for variables, parameters, named constants (e.g., itemCount, defaultTimeout)"
  libraries: "lowercase_with_underscores for libraries, packages, directories, source files (e.g., my_package, slider_menu.dart)"
  constants: "lowerCamelCase for const (e.g., const defaultTimeout = 30), NOT SCREAMING_CAPS"
  private: "Prefix with underscore for library-private (e.g., _internalCache, _helper())"
  boolean: "Prefix with is/has/can/should for booleans (e.g., isEnabled, hasData, canScroll)"
  avoid: "Hungarian notation, type prefixes (strName, lstItems), abbreviations unless universally known (e.g., ok: http, url, id; avoid: mgr, ctx, btn)"

null_safety:
  default: "Non-nullable types — use ? only when null is meaningful"
  avoid_bang: "Minimize ! operator — use only when null is logically impossible"
  late: "Only when initialization is guaranteed before use"
  pattern: |
    // GOOD
    final name = user?.name ?? 'Anonymous';

    // AVOID
    final name = user!.name; // crashes if null

sealed_classes:
  use_for: "Exhaustive pattern matching on state/result types"
  pattern: |
    sealed class AuthState {}
    class AuthInitial extends AuthState {}
    class AuthLoading extends AuthState {}
    class AuthSuccess extends AuthState { final User user; AuthSuccess(this.user); }
    class AuthError extends AuthState { final String message; AuthError(this.message); }

    // Exhaustive switch — compiler enforces all cases
    return switch (state) {
      AuthInitial() => LoginScreen(),
      AuthLoading() => CircularProgressIndicator(),
      AuthSuccess(:final user) => HomeScreen(user: user),
      AuthError(:final message) => ErrorWidget(message),
    };

records:
  use_for: "Lightweight multi-value returns without class boilerplate"
  pattern: "(String name, int age) getUserInfo() => ('Alice', 30);"
  avoid: "Records for complex data — use freezed classes instead"

extension_types:
  use_for: "Zero-cost type wrappers for primitive IDs"
  pattern: "extension type UserId(int id) implements int {}"

immutability:
  prefer: "final variables, const constructors"
  collections: "UnmodifiableListView for exposed lists"
  models: "freezed package for data classes"

async:
  streams: "async* yield for reactive data pipelines"
  futures: "async/await for sequential async operations"
  isolates: "Isolate.run() for CPU-intensive work >16ms"

dynamic:
  avoid: "dynamic type — use generics or Object? instead"
  reason: "No compile-time type checking, reduces IDE support"
```

### 7. Architecture & Project Structure

```yaml
default_structure:
  small_app: |
    lib/
      models/
      services/
      screens/
      widgets/
  medium_app: |
    lib/
      ui/
        core/themes/, core/widgets/
        <feature>/<feature>_screen.dart
        <feature>/<feature>_viewmodel.dart
      data/
        repositories/<entity>_repository.dart
        services/<source>_service.dart
      domain/ (optional)
        use_cases/
  large_app: |
    lib/
      core/ (shared)
      features/<feature>/
        data/datasources/, data/repositories/
        domain/entities/, domain/usecases/
        presentation/bloc/, presentation/pages/

navigation:
  default: "go_router (official recommendation)"
  pattern: |
    GoRoute(
      path: '/product/:id',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return ProductDetailScreen(id: id);
      },
    )
  go_vs_push: |
    context.go('/path')   // replaces stack (navigation reset)
    context.push('/path') // adds to stack (back button works)

dependency_injection:
  riverpod: "Built-in — providers as DI (default)"
  getit: "GetIt + injectable — for non-Riverpod projects"
  rule: "Dependency direction always inward (UI → ViewModel → Repository → Service)"

environments:
  pattern: "Flavors + --dart-define for multi-environment builds"
  command: "flutter run --flavor development --target lib/main/main_development.dart"
  rule: "Separate bundle IDs, API URLs, and Firebase config per flavor"
```

## Default Stack

When starting a new Flutter project, recommend this stack:

```yaml
state_management: Riverpod 3.0
navigation: go_router
models: freezed + json_serializable
di: Riverpod (built-in)
http: dio
linting: very_good_analysis
testing: flutter_test + mocktail
structure: Official MVVM (lib/{ui,data}/)
```

## Enterprise Stack

For regulated or large-team projects:

```yaml
state_management: BLoC 9.0 + Cubit
navigation: go_router or auto_route
models: freezed + json_serializable
di: GetIt + injectable (or Riverpod)
http: dio with interceptors
testing: flutter_test + bloc_test + mocktail (80%+ coverage)
structure: Clean Architecture (features/{feature}/{presentation,domain,data}/)
```

## Application

When writing or reviewing Flutter/Dart code:

1. **Always** use const constructors for static widgets
2. **Always** return Result<T> from repositories, never throw
3. **Always** use flutter_secure_storage for sensitive data
4. **Prefer** Riverpod 3.0 for new projects, BLoC for enterprise
5. **Prefer** StatelessWidget classes over helper functions
6. **Prefer** sealed classes for state/result types (exhaustive matching)
7. **Use** freezed for all data model classes
8. **Use** go_router for navigation with deep linking
9. **Guard** all print() with kDebugMode
10. **Never** use GetX for new projects (maintenance risk)
11. **Never** store sensitive data in SharedPreferences
12. **Never** hardcode API keys in source code
