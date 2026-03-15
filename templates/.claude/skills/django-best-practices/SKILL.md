---
name: django-best-practices
description: Django patterns for production-ready Python web applications
scope: core
user-invocable: false
---

## Purpose

Apply Django patterns for building production-ready, secure, and maintainable Python web applications.

## Rules

### 1. Project Structure

```yaml
structure:
  settings_split: true
  layout: "config/{settings/{base,development,production}.py,urls.py,wsgi.py} + apps/{core/,users/,<feature>/} + templates/ + static/ + requirements/{base,development,production}.txt"

app_module_contents:
  models.py: Database models
  views.py: Request handlers
  urls.py: URL patterns (with app_name)
  serializers.py: DRF serializers (if API)
  forms.py: Django forms
  admin.py: Admin customization
  services.py: Business logic layer
  managers.py: Custom model managers
  signals.py: Django signals (use sparingly)
  tests/: Test suite (mirror app structure)
```

Reference: guides/django-best-practices/README.md

### 2. Models Best Practices

```yaml
custom_user_model:
  rule: ALWAYS create a custom User model, even if identical to default
  location: apps/users/models.py
  reason: Impossible to swap default User model mid-project
  pattern: "Extend AbstractUser, set AUTH_USER_MODEL in settings"

primary_key:
  default: BigAutoField
  settings: DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

model_meta:
  required:
    - __str__: human-readable representation
    - Meta.ordering: consistent default ordering
    - Meta.verbose_name: singular display name
    - Meta.verbose_name_plural: plural display name

query_optimization:
  foreign_key: select_related()    # Single SQL JOIN
  many_to_many: prefetch_related() # Separate query + Python join
  partial_fields: only() / defer() # Load subset of fields
  aggregations: F() and Q() objects for complex expressions
  bulk_ops:
    create: bulk_create(objs, batch_size=1000)
    update: bulk_update(objs, fields, batch_size=1000)

indexing:
  - Frequently filtered fields: db_index=True
  - Frequently ordered fields: Meta.ordering fields
  - Multi-column: Meta.indexes with models.Index
  - Unique together: Meta.unique_together or UniqueConstraint

constraints:
  use: Meta.constraints for database-level enforcement
  types: "UniqueConstraint, CheckConstraint"

soft_delete:
  pattern: is_active = models.BooleanField(default=True)
  manager: Override default manager to filter is_active=True

custom_managers:
  rule: Use managers for reusable querysets
```

Reference: guides/django-best-practices/README.md

### 3. Views Best Practices

```yaml
cbv_vs_fbv:
  cbv: Standard CRUD, predictable patterns (ListView, DetailView, etc.)
  fbv: Complex custom logic, non-standard workflows

thin_views:
  rule: Keep views thin — delegate business logic to services/models

shortcuts:
  - get_object_or_404(Model, pk=pk): Returns 404 instead of 500
  - get_list_or_404(Model, **kwargs): 404 if empty list

mixins:
  authentication: LoginRequiredMixin
  permissions: PermissionRequiredMixin
  user_pass: UserPassesTestMixin

status_codes:
  200: OK (default for success)
  201: Created (after successful creation)
  302: Redirect (after POST success — PRG pattern)
  400: Bad Request (validation error)
  403: Forbidden (permission denied)
  404: Not Found
  405: Method Not Allowed
```

### 4. URL Patterns

```yaml
namespacing:
  app_name: Required in every app's urls.py
  usage: "reverse('app_name:url_name') or {% url 'app_name:url_name' %}"

syntax:
  prefer: path() over re_path() for clarity
  use_re_path: Only for complex regex patterns

naming:
  rule: Name ALL URL patterns
  convention: "{resource}-{action} (e.g., article-list, article-detail)"

inclusion:
  root_urls: Use include() for app-level URLs
```

Reference: guides/django-best-practices/README.md

### 5. Forms & Validation

```yaml
model_forms:
  rule: Use ModelForm when form maps to a model
  fields: "Explicitly list fields (never use fields = '__all__')"

validation:
  field_level: clean_<field>() method
  cross_field: clean() method
  built_in: Use Django validators (MaxValueValidator, RegexValidator, etc.)
```

Reference: guides/django-best-practices/README.md

### 6. Security

```yaml
environment:
  SECRET_KEY: Never hardcode — read from environment variable
  DEBUG: False in production (MUST)
  ALLOWED_HOSTS: Explicitly set in production (MUST)

https:
  SECURE_SSL_REDIRECT: true
  SESSION_COOKIE_SECURE: true
  CSRF_COOKIE_SECURE: true
  SECURE_HSTS_SECONDS: 3600  # Start small, increase to 31536000
  SECURE_HSTS_INCLUDE_SUBDOMAINS: true

clickjacking:
  X_FRAME_OPTIONS: DENY

content_type:
  SECURE_CONTENT_TYPE_NOSNIFF: true

csrf:
  rule: Enabled by default via CsrfViewMiddleware — do NOT disable

sql_injection:
  rule: Use ORM, avoid raw SQL; if needed, use parameterized queries

xss:
  rule: Templates auto-escape by default — never use |safe with user content

deployment_check:
  command: python manage.py check --deploy
  run: Before every production deployment
```

### 7. Testing

```yaml
framework:
  preferred: pytest-django (over unittest)
  config: pytest.ini or pyproject.toml with [tool.pytest.ini_options]

test_classes:
  database: TestCase (wraps each test in transaction)
  no_database: SimpleTestCase (faster)
  live_server: LiveServerTestCase (for Selenium)

test_data:
  preferred: factory_boy or model_bakery
  avoid: fixtures (hard to maintain, slow)

request_testing:
  Client: Full request/response cycle (preferred for views)
  RequestFactory: Faster, no middleware (for unit testing views)

settings_override:
  decorator: '@override_settings(...)'

coverage:
  target: 80%+
  exclude: migrations, admin, settings

structure:
  mirror_app: tests/test_models.py, tests/test_views.py, tests/test_forms.py
```

Reference: guides/django-best-practices/README.md

### 8. Performance

```yaml
n_plus_1_prevention:
  check: Use django-debug-toolbar in development
  fix_fk: select_related('author', 'category')
  fix_m2m: prefetch_related('tags', 'comments')
  complex: Prefetch object with custom queryset

partial_loading:
  only: "only('id', 'title', 'created_at') — Load only these fields"
  defer: "defer('body', 'metadata') — Load all except these"
  values: "values('id', 'title') — Returns dicts (no ORM overhead)"
  values_list: "values_list('id', flat=True) — Returns flat list"

caching:
  backend: Redis (preferred), Memcached
  view_cache: "'@cache_page(60 * 15)' decorator"
  template_cache: "'{% cache 500 sidebar %}' template tag"
  low_level: cache.get/set/delete for fine-grained control

pagination:
  list_views: Always paginate large querysets
  page_size: Set reasonable default (20-50 items)
  drf: PageNumberPagination or CursorPagination

bulk_operations:
  create: "bulk_create(articles, batch_size=1000)"
  update: "bulk_update(articles, ['status'], batch_size=1000)"
  avoid: Loops calling .save() on many objects
```

### 9. Django REST Framework (DRF)

```yaml
serializers:
  standard_crud: ModelSerializer
  read_only: Use SerializerMethodField for computed values
  write_validation: validate_<field>() and validate() methods

viewsets:
  standard: ModelViewSet for full CRUD
  custom: ViewSet with explicit action methods
  routers: DefaultRouter or SimpleRouter for URL generation

authentication:
  jwt: djangorestframework-simplejwt (recommended)
  token: DRF built-in TokenAuthentication
  session: SessionAuthentication (for browser clients)

permissions:
  global: DEFAULT_PERMISSION_CLASSES in settings
  per_view: permission_classes attribute on ViewSet
  object_level: has_object_permission() in custom permission class

versioning:
  method: NamespaceVersioning or URLPathVersioning

throttling:
  anonymous: AnonRateThrottle
  authenticated: UserRateThrottle
  custom: Extend BaseThrottle

pagination:
  global: DEFAULT_PAGINATION_CLASS in settings
  types: PageNumberPagination (simple), CursorPagination (large datasets)
```

Reference: guides/django-best-practices/README.md

### 10. Deployment

```yaml
wsgi_asgi:
  wsgi: gunicorn (4 workers per CPU core)
  asgi: uvicorn with gunicorn workers (for async/WebSocket)

static_files:
  development: Django's staticfiles
  production: whitenoise middleware OR CDN (S3 + CloudFront)
  command: python manage.py collectstatic --noinput

database:
  development: SQLite (acceptable)
  production: PostgreSQL (MUST — never SQLite in production)
  connection_pooling: Use pgBouncer or django-db-connection-pool

migrations:
  deploy: Run as part of CI/CD pipeline before server restart
  zero_downtime: Use additive migrations (add nullable columns, backfill, then add constraint)

logging:
  config: LOGGING dict in settings
  handler: File handler in production, console in development
  level: WARNING in production, DEBUG in development

environment_variables:
  tool: python-decouple or django-environ
  never: Hardcode secrets in settings files

health_check:
  endpoint: /health/ returning 200 OK
  checks: Database connection, cache connection, disk space
```

## Application

When writing Django code:

1. **Always** create a custom User model before any other models
2. **Always** split settings into base/development/production
3. **Prefer** CBVs for standard CRUD, FBVs for custom logic
4. **Use** select_related/prefetch_related to prevent N+1 queries
5. **Apply** the security checklist for every production deployment
6. **Test** with pytest-django and factory_boy
7. **Never** use `fields = '__all__'` in ModelForms or ModelSerializer
8. **Run** `python manage.py check --deploy` before shipping
