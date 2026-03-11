# Flutter State Management

> Reference: riverpod.dev, bloclibrary.dev, docs.flutter.dev/data-and-backend/state-mgmt

## Selection Guide

| Approach | Complexity | Scalability | Best For |
|----------|-----------|-------------|----------|
| **Riverpod 3.0** | Medium | Excellent | New projects (default) |
| **BLoC 9.0** | High | Excellent | Enterprise, regulated industries |
| **Provider** | Low | Moderate | Simple apps, learning |
| **setState** | Low | Poor | Ephemeral local UI state |
| **GetX** | Low | Poor | **AVOID** for new projects |

## Riverpod 3.0 (Default)

### Provider Types

```dart
// Simple value provider
@riverpod
String greeting(Ref ref) => 'Hello, World!';

// Async data provider
@riverpod
Future<List<Product>> products(Ref ref) async {
  final api = ref.watch(apiClientProvider);
  return api.getProducts();
}

// Stateful notifier
@riverpod
class Counter extends _$Counter {
  @override
  int build() => 0;

  void increment() => state++;
  void decrement() => state--;
}

// Async stateful notifier
@riverpod
class ProductList extends _$ProductList {
  @override
  Future<List<Product>> build() async {
    return ref.watch(productRepositoryProvider).getAll();
  }

  Future<void> addProduct(Product product) async {
    await ref.read(productRepositoryProvider).add(product);
    ref.invalidateSelf();
  }
}
```

### UI Consumption

```dart
class ProductListScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(productListProvider);

    return state.when(
      loading: () => const CircularProgressIndicator(),
      error: (e, st) => Text('Error: $e'),
      data: (products) => ListView.builder(
        itemCount: products.length,
        itemBuilder: (_, i) => ProductCard(products[i]),
      ),
    );
  }
}
```

### Key Rules

- `ref.watch()` in build methods only (reactive)
- `ref.read()` in callbacks and event handlers (one-time)
- Never call `ref.watch()` inside non-build methods
- Use `family` for parameterized providers
- Use `keepAlive` sparingly (expensive computations only)

## BLoC 9.0 (Enterprise)

### Cubit (Simple)

```dart
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);

  void increment() => emit(state + 1);
  void decrement() => emit(state - 1);
}

// UI
BlocBuilder<CounterCubit, int>(
  builder: (context, count) => Text('$count'),
)
```

### Bloc (Full Events)

```dart
// Events
sealed class AuthEvent {}
class LoginRequested extends AuthEvent {
  final String email, password;
  LoginRequested(this.email, this.password);
}

// States
sealed class AuthState {}
class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthSuccess extends AuthState { final User user; AuthSuccess(this.user); }
class AuthFailure extends AuthState { final String error; AuthFailure(this.error); }

// Bloc
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this._authRepo) : super(AuthInitial()) {
    on<LoginRequested>(_onLogin);
  }

  final AuthRepository _authRepo;

  Future<void> _onLogin(LoginRequested event, Emitter<AuthState> emit) async {
    emit(AuthLoading());
    final result = await _authRepo.login(event.email, event.password);
    switch (result) {
      case Ok(:final value): emit(AuthSuccess(value));
      case Error(:final error): emit(AuthFailure(error.toString()));
    }
  }
}
```

### Key Rules

- One event per user action
- Cubit for simple state, Bloc when audit trail needed
- Never emit state in constructor
- `BlocListener` for side effects, `BlocBuilder` for UI
- Cancel subscriptions in `close()`
