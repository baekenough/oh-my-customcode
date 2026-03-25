# Flutter Testing

> Reference: docs.flutter.dev/testing/overview

## Test Pyramid

| Level | Speed | Confidence | Tool |
|-------|-------|------------|------|
| Unit | Fast | Low | `flutter_test` |
| Widget | Fast | Medium | `testWidgets`, `WidgetTester` |
| Integration | Slow | High | `integration_test` package |
| Golden | Fast | Visual | `matchesGoldenFile()` |

## Widget Tests (Primary)

```dart
testWidgets('ProductCard displays name and price', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: ProductCard(
        product: Product(id: 1, name: 'Widget', price: 9.99),
      ),
    ),
  );

  expect(find.text('Widget'), findsOneWidget);
  expect(find.text('\$9.99'), findsOneWidget);
});

testWidgets('tapping add button calls onAdd', (tester) async {
  var called = false;
  await tester.pumpWidget(
    MaterialApp(
      home: AddButton(onAdd: () => called = true),
    ),
  );

  await tester.tap(find.byType(ElevatedButton));
  expect(called, isTrue);
});
```

## Riverpod Testing

```dart
testWidgets('ProductListScreen shows products', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        productListProvider.overrideWith(
          () => FakeProductListNotifier(),
        ),
      ],
      child: const MaterialApp(home: ProductListScreen()),
    ),
  );

  await tester.pumpAndSettle();
  expect(find.byType(ProductCard), findsNWidgets(3));
});
```

## BLoC Testing

```dart
blocTest<CounterCubit, int>(
  'increment emits [1] when initial state is 0',
  build: () => CounterCubit(),
  act: (cubit) => cubit.increment(),
  expect: () => [1],
);

blocTest<AuthBloc, AuthState>(
  'login emits [loading, success] on valid credentials',
  build: () => AuthBloc(FakeAuthRepository()),
  act: (bloc) => bloc.add(LoginRequested('user@test.com', 'pass123')),
  expect: () => [
    isA<AuthLoading>(),
    isA<AuthSuccess>(),
  ],
);
```

## Mocking with mocktail

```dart
class MockProductRepository extends Mock implements ProductRepository {}

void main() {
  late MockProductRepository mockRepo;

  setUp(() {
    mockRepo = MockProductRepository();
  });

  test('getProducts returns list', () async {
    when(() => mockRepo.getAll()).thenAnswer(
      (_) async => Ok([Product(id: 1, name: 'Test', price: 9.99)]),
    );

    final result = await mockRepo.getAll();
    expect(result, isA<Ok<List<Product>>>());
  });
}
```

## Golden Tests

```dart
testWidgets('ProductCard matches golden', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: ProductCard(product: testProduct),
    ),
  );

  await expectLater(
    find.byType(ProductCard),
    matchesGoldenFile('goldens/product_card.png'),
  );
});

// Update goldens: flutter test --update-goldens
```

## Accessibility Testing

```dart
testWidgets('meets accessibility guidelines', (tester) async {
  final handle = tester.ensureSemantics();
  await tester.pumpWidget(const MaterialApp(home: MyScreen()));

  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));

  handle.dispose();
});
```

## Test Organization

```
test/
├── unit/
│   ├── repositories/product_repository_test.dart
│   └── viewmodels/home_viewmodel_test.dart
├── widget/
│   ├── screens/product_list_screen_test.dart
│   └── widgets/product_card_test.dart
├── goldens/
│   └── product_card.png
integration_test/
└── app_test.dart
```
