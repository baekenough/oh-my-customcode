# Flutter Architecture

> Reference: docs.flutter.dev/app-architecture

## Official MVVM Pattern

```
UI Layer
  ├─ View (Widget)           — display only, no business logic
  └─ ViewModel (ChangeNotifier / Notifier) — state + commands

Data Layer
  ├─ Repository              — single source of truth per domain
  └─ Service                 — stateless external API wrapper

Domain Layer (optional)
  └─ UseCase                 — cross-repository business logic
```

### Dependency Rules

- View knows only its ViewModel
- ViewModel knows Repositories (private)
- Repository knows Services (private)
- **Direction always inward** — UI depends on data, never reverse

### ViewModel with Commands

```dart
class HomeViewModel extends ChangeNotifier {
  HomeViewModel({required BookingRepository bookingRepository})
      : _bookingRepository = bookingRepository {
    load = Command0(_load)..execute();
  }

  final BookingRepository _bookingRepository;
  late final Command0 load;

  List<BookingSummary> _bookings = [];
  UnmodifiableListView<BookingSummary> get bookings =>
      UnmodifiableListView(_bookings);

  Future<Result> _load() async {
    final result = await _bookingRepository.getBookingsList();
    if (result case Ok(:final value)) _bookings = value;
    notifyListeners();
    return result;
  }
}
```

## Project Structure

### Medium Apps (Official MVVM)

```
lib/
├── ui/
│   ├── core/
│   │   ├── themes/app_theme.dart
│   │   └── widgets/loading_indicator.dart
│   └── home/
│       ├── home_screen.dart
│       └── home_viewmodel.dart
├── data/
│   ├── repositories/booking_repository.dart
│   └── services/api_service.dart
└── domain/ (optional)
    └── use_cases/get_bookings_usecase.dart
```

### Large Apps (Clean Architecture)

```
lib/
├── core/
│   ├── error/failures.dart
│   ├── network/api_client.dart
│   └── utils/extensions.dart
└── features/
    └── auth/
        ├── data/
        │   ├── datasources/auth_remote_datasource.dart
        │   ├── models/user_model.dart
        │   └── repositories/auth_repository_impl.dart
        ├── domain/
        │   ├── entities/user.dart
        │   ├── repositories/auth_repository.dart
        │   └── use_cases/login_usecase.dart
        └── presentation/
            ├── bloc/auth_bloc.dart
            ├── pages/login_page.dart
            └── widgets/login_form.dart
```

## Navigation (go_router)

```dart
final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/product/:id',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return ProductDetailScreen(id: id);
      },
    ),
    ShellRoute(
      builder: (context, state, child) => ScaffoldWithNavBar(child: child),
      routes: [/* nested tab routes */],
    ),
  ],
  redirect: (context, state) {
    final isLoggedIn = /* check auth */;
    if (!isLoggedIn && state.matchedLocation != '/login') return '/login';
    return null;
  },
);
```

## Data Models (freezed)

```dart
@freezed
class Product with _$Product {
  const factory Product({
    required int id,
    required String name,
    required double price,
    @Default('') String description,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);
}
```
