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
  pattern: "Check mounted before using context after await"

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

Reference: guides/flutter/fundamentals.md

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
  invalidate_vs_refresh: "ref.invalidate() resets to loading (lazy); ref.refresh() immediate re-fetch"

bloc_patterns:
  one_event_per_action: "One UI action = one event class"
  cubit_vs_bloc: "Cubit for simple state changes; Bloc when audit trail needed"
  never: "Emit state in constructor body"
  listener_vs_consumer: "BlocListener for side effects; BlocConsumer for UI + effects; BlocBuilder for UI only"
  stream_management: "Cancel subscriptions in close()"

state_immutability:
  rule: "All state objects must be immutable"
  tool: "freezed package for copyWith/==/hashCode generation"

result_type:
  rule: "Return Result<T> from repositories, never throw"
  pattern: "sealed class Result<T> with Ok<T> and Error<T> subclasses"
```

Reference: guides/flutter/state-management.md

### 3. Performance

```yaml
build_optimization:
  const_widgets: "Mark immutable widgets const — zero rebuild"
  localize_setState: "Call setState on smallest possible subtree"
  extract_widgets: "StatelessWidget class > helper method"
  child_parameter: "Pass static child through AnimatedBuilder to avoid rebuild"

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

Reference: guides/flutter/performance.md

### 4. Testing

```yaml
test_pyramid:
  unit: "Single class/function — fast, low confidence"
  widget: "Single widget tree — fast, medium confidence"
  integration: "Full app on device — slow, high confidence"
  golden: "Visual regression via matchesGoldenFile()"

widget_test_pattern:
  rule: "Use pumpWidget with ProviderScope overrides, then pump/pumpAndSettle for async"

mocking:
  prefer: "mocktail (null-safe, no codegen)"
  avoid: "Legacy mockito with build_runner"
  fakes: "Use Fake implementations for deterministic tests"

bloc_testing:
  rule: "Use blocTest<Bloc, State> with build/act/expect pattern"

coverage_target:
  widget_tests: "80%+ for UI logic"
  unit_tests: "90%+ for business logic"
  integration: "Critical user flows only"
```

Reference: guides/flutter/testing.md

### 5. Security

```yaml
secrets:
  never: "Hardcode API keys, tokens, or credentials in source"
  best: "Backend proxy for all sensitive API calls"
  use: "--dart-define-from-file=.env for NON-SECRET build config only (feature flags, environment URLs)"
  warning: "dart-define values are embedded in compiled binary and extractable via static analysis"

storage:
  sensitive_data: "flutter_secure_storage v10+ (Keychain/Keystore)"
  never: "SharedPreferences for tokens, PII, or credentials"
  ios: "AppleOptions(useSecureEnclave: true) for high-value"
  android: "AndroidOptions(encryptedSharedPreferences: true)"
  web_warning: "flutter_secure_storage on Web uses localStorage by default (XSS vulnerable). Use HttpOnly cookies or in-memory-only for sensitive data."

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

Reference: guides/flutter/security.md

### 6. Dart Language Patterns

```yaml
naming:
  types: "UpperCamelCase for classes, enums, typedefs, extensions, mixins"
  variables: "lowerCamelCase for variables, parameters, named constants"
  libraries: "lowercase_with_underscores for libraries, packages, directories, source files"
  constants: "lowerCamelCase for const (NOT SCREAMING_CAPS)"
  private: "Prefix with underscore for library-private"
  boolean: "Prefix with is/has/can/should"
  avoid: "Hungarian notation, type prefixes, abbreviations unless universally known"

null_safety:
  default: "Non-nullable types — use ? only when null is meaningful"
  avoid_bang: "Minimize ! operator — use only when null is logically impossible"
  late: "Only when initialization is guaranteed before use"

sealed_classes:
  use_for: "Exhaustive pattern matching on state/result types"
  pattern: "sealed class with subclass per state, exhaustive switch expression"

records:
  use_for: "Lightweight multi-value returns without class boilerplate"
  avoid: "Records for complex data — use freezed classes instead"

extension_types:
  use_for: "Zero-cost type wrappers for primitive IDs"

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

Reference: guides/flutter/fundamentals.md

### 7. Architecture & Project Structure

```yaml
default_structure:
  small_app: "lib/{models,services,screens,widgets}/"
  medium_app: "lib/{ui/{core/,<feature>/},data/{repositories/,services/},domain/}"
  large_app: "lib/{core/,features/<feature>/{data/,domain/,presentation/}}"

navigation:
  default: "go_router (official recommendation)"
  go_vs_push: "context.go() replaces stack; context.push() adds to stack"

dependency_injection:
  riverpod: "Built-in — providers as DI (default)"
  getit: "GetIt + injectable — for non-Riverpod projects"
  rule: "Dependency direction always inward (UI → ViewModel → Repository → Service)"

environments:
  pattern: "Flavors + --dart-define for multi-environment builds"
  rule: "Separate bundle IDs, API URLs, and Firebase config per flavor"
```

Reference: guides/flutter/architecture.md

## Default Stack

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
