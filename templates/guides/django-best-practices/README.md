# Django Best Practices Guide

> Reference: Django 6.0 Official Documentation + Community Best Practices

## Sources

- https://docs.djangoproject.com/en/6.0/
- https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/
- https://github.com/HackSoftware/Django-Styleguide (HackSoft style guide)

---

## Quick Reference

### Project Setup

**Recommended project structure:**

```
project/
├── config/
│   ├── settings/
│   │   ├── base.py          # Shared settings
│   │   ├── development.py   # Dev overrides
│   │   └── production.py    # Prod overrides
│   ├── urls.py
│   └── wsgi.py
├── apps/
│   ├── core/                # Shared utilities
│   ├── users/               # Custom User model
│   └── {feature}/           # Feature apps
├── templates/
├── static/
├── requirements/
│   ├── base.txt
│   ├── development.txt      # + debug-toolbar, factory-boy
│   └── production.txt       # + gunicorn, whitenoise
└── manage.py
```

**Settings split pattern:**

```python
# config/settings/base.py
SECRET_KEY = env('SECRET_KEY')
DEBUG = False
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'users.User'

# config/settings/development.py
from .base import *
DEBUG = True
INSTALLED_APPS += ['debug_toolbar']

# config/settings/production.py
from .base import *
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')
DATABASES = {'default': env.db()}
```

**Always create a custom User model first:**

```python
# apps/users/models.py
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    pass  # Extend later without pain
```

---

### Models

**Model best practices:**

```python
from django.db import models

class Article(models.Model):
    title = models.CharField(max_length=200, db_index=True)
    body = models.TextField()
    author = models.ForeignKey('users.User', on_delete=models.CASCADE)
    status = models.CharField(
        max_length=20,
        choices=[('draft', 'Draft'), ('published', 'Published')],
        default='draft'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()
    published = PublishedManager()  # Custom manager

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'article'
        verbose_name_plural = 'articles'
        indexes = [
            models.Index(fields=['status', 'created_at']),
        ]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(title=''),
                name='article_title_not_empty'
            )
        ]

    def __str__(self):
        return self.title
```

**Query optimization:**

```python
# N+1 prevention
articles = Article.objects.select_related('author').prefetch_related('tags')

# Partial field loading
titles = Article.objects.values_list('id', 'title')  # No ORM object

# Bulk operations (never loop .save())
Article.objects.bulk_create(articles, batch_size=1000)
Article.objects.bulk_update(articles, ['status'], batch_size=1000)

# Complex queries with F() and Q()
from django.db.models import F, Q
Article.objects.filter(Q(status='published') | Q(author=request.user))
Article.objects.update(view_count=F('view_count') + 1)
```

---

### Views & URLs

**Class-Based Views for standard CRUD:**

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView

class ArticleListView(ListView):
    model = Article
    template_name = 'articles/list.html'
    context_object_name = 'articles'
    paginate_by = 20

    def get_queryset(self):
        return Article.published.select_related('author')

class ArticleCreateView(LoginRequiredMixin, CreateView):
    model = Article
    form_class = ArticleForm
    template_name = 'articles/form.html'

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)
```

**URL namespacing (required):**

```python
# apps/articles/urls.py
app_name = 'articles'  # REQUIRED

urlpatterns = [
    path('', ArticleListView.as_view(), name='list'),
    path('<int:pk>/', ArticleDetailView.as_view(), name='detail'),
    path('create/', ArticleCreateView.as_view(), name='create'),
]

# Usage: reverse('articles:detail', args=[pk])
# Template: {% url 'articles:detail' article.pk %}
```

---

### Security Checklist

Run before every production deployment: `python manage.py check --deploy`

**Required production settings:**

```python
# config/settings/production.py

# Core
DEBUG = False
SECRET_KEY = env('SECRET_KEY')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')

# HTTPS
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Cookies
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

# Content security
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_BROWSER_XSS_FILTER = True
```

**Security built-ins (never disable):**

| Protection | Middleware / Setting | Default |
|------------|---------------------|---------|
| CSRF | `CsrfViewMiddleware` | On |
| XSS | Template auto-escaping | On |
| SQL injection | ORM parameterized queries | On |
| Clickjacking | `XFrameOptionsMiddleware` | On |
| Session security | `SessionMiddleware` | On |

---

### Performance

**N+1 query prevention:**

```python
# Bad: N+1
for article in Article.objects.all():
    print(article.author.username)  # 1 query per article

# Good: 2 queries total
for article in Article.objects.select_related('author'):
    print(article.author.username)

# Good: M2M prefetch
Article.objects.prefetch_related('tags', 'comments__author')

# Advanced: Custom prefetch
from django.db.models import Prefetch
Article.objects.prefetch_related(
    Prefetch('comments', queryset=Comment.objects.filter(approved=True))
)
```

**Caching:**

```python
# Settings
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': env('REDIS_URL'),
    }
}

# View-level caching
from django.views.decorators.cache import cache_page

@cache_page(60 * 15)  # 15 minutes
def my_view(request):
    ...

# Low-level API
from django.core.cache import cache
data = cache.get_or_set('my_key', expensive_function, timeout=300)
```

---

### Testing

**pytest-django setup:**

```ini
# pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.test
python_files = tests/test_*.py
python_classes = Test*
python_functions = test_*
```

**Factory pattern:**

```python
# apps/articles/tests/factories.py
import factory
from factory.django import DjangoModelFactory

class UserFactory(DjangoModelFactory):
    class Meta:
        model = 'users.User'
    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda o: f'{o.username}@example.com')

class ArticleFactory(DjangoModelFactory):
    class Meta:
        model = 'articles.Article'
    title = factory.Faker('sentence')
    author = factory.SubFactory(UserFactory)
    status = 'published'
```

**Test structure:**

```python
# apps/articles/tests/test_views.py
import pytest
from django.urls import reverse

@pytest.mark.django_db
class TestArticleListView:
    def test_returns_published_articles(self, client):
        ArticleFactory.create_batch(3, status='published')
        ArticleFactory(status='draft')

        url = reverse('articles:list')
        response = client.get(url)

        assert response.status_code == 200
        assert len(response.context['articles']) == 3

    def test_requires_login_for_create(self, client):
        url = reverse('articles:create')
        response = client.get(url)
        assert response.status_code == 302  # Redirect to login
```

---

### REST API (DRF)

**Serializers:**

```python
from rest_framework import serializers

class ArticleSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    tags = serializers.StringRelatedField(many=True)

    class Meta:
        model = Article
        fields = ['id', 'title', 'body', 'author_name', 'tags', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_author_name(self, obj):
        return obj.author.get_full_name()
```

**ViewSets + Routers:**

```python
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.published.select_related('author')
    serializer_class = ArticleSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        article = self.get_object()
        article.status = 'published'
        article.save()
        return Response({'status': 'published'})

# urls.py
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('articles', ArticleViewSet, basename='article')

urlpatterns = [path('api/v1/', include(router.urls))]
```

**Authentication (JWT):**

```python
# settings/base.py
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
    },
}
```

---

### Deployment

**Gunicorn configuration:**

```bash
# gunicorn.conf.py
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'  # or 'uvicorn.workers.UvicornWorker' for ASGI
bind = '0.0.0.0:8000'
timeout = 30
keepalive = 2
max_requests = 1000
max_requests_jitter = 100
```

**Static files with whitenoise:**

```python
# settings/production.py
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # After SecurityMiddleware
    ...
]
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
```

**Deployment checklist:**

```bash
# Before every production deployment
python manage.py check --deploy
python manage.py migrate --run-syncdb
python manage.py collectstatic --noinput

# Database
# Use PostgreSQL (psycopg2-binary or psycopg[binary])
# Set up pgBouncer for connection pooling

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
        'file': {'class': 'logging.FileHandler', 'filename': '/var/log/django.log'},
    },
    'root': {'handlers': ['console', 'file'], 'level': 'WARNING'},
}
```

---

## Package Recommendations

| Category | Package | Notes |
|----------|---------|-------|
| Settings | `django-environ` or `python-decouple` | Environment variable management |
| Auth | `djangorestframework-simplejwt` | JWT for APIs |
| API | `djangorestframework` | REST framework |
| Testing | `pytest-django`, `factory_boy` | Test infrastructure |
| Debug | `django-debug-toolbar` | Query inspection (dev only) |
| Static | `whitenoise` | Static file serving |
| Tasks | `celery` + `redis` | Background task queue |
| Caching | `django-redis` | Redis cache backend |
| Storage | `django-storages` + `boto3` | S3 media storage |
| Filtering | `django-filter` | DRF filter integration |
| Cors | `django-cors-headers` | CORS for SPA frontends |
