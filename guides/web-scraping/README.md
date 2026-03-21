# Web Scraping Best Practices

Reliable patterns for BeautifulSoup and Playwright-based web scraping, with emphasis on Korean government site parsing (QC crawling).

---

## 1. BeautifulSoup Parsing Patterns

### Table Parsing

```python
from bs4 import BeautifulSoup

def parse_table(html: str, table_index: int = 0) -> list[dict]:
    """Parse an HTML table into a list of dicts keyed by header text."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if table_index >= len(tables):
        return []

    table = tables[table_index]
    headers = [th.get_text(strip=True) for th in table.find_all("th")]

    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td"])
        if not cells:
            continue
        row = {}
        for i, td in enumerate(cells):
            key = headers[i] if i < len(headers) else f"col_{i}"
            row[key] = td.get_text(strip=True)
        rows.append(row)
    return rows
```

#### Handling rowspan/colspan

```python
def parse_complex_table(table_element) -> list[list[str]]:
    """Handle rowspan and colspan by expanding cells into a 2D grid."""
    rows = table_element.find_all("tr")
    if not rows:
        return []

    # Determine grid dimensions
    max_cols = 0
    for tr in rows:
        col_count = sum(
            int(cell.get("colspan", 1)) for cell in tr.find_all(["td", "th"])
        )
        max_cols = max(max_cols, col_count)

    grid: list[list[str | None]] = [
        [None] * max_cols for _ in range(len(rows))
    ]

    for row_idx, tr in enumerate(rows):
        col_idx = 0
        for cell in tr.find_all(["td", "th"]):
            # Skip cells already filled by rowspan
            while col_idx < max_cols and grid[row_idx][col_idx] is not None:
                col_idx += 1
            if col_idx >= max_cols:
                break

            text = cell.get_text(strip=True)
            rowspan = int(cell.get("rowspan", 1))
            colspan = int(cell.get("colspan", 1))

            for dr in range(rowspan):
                for dc in range(colspan):
                    r, c = row_idx + dr, col_idx + dc
                    if r < len(grid) and c < max_cols:
                        grid[r][c] = text
            col_idx += colspan

    return [[cell or "" for cell in row] for row in grid]
```

### List Extraction

```python
def extract_definition_list(soup: BeautifulSoup) -> dict[str, str]:
    """Extract <dl> definition lists into key-value pairs."""
    result = {}
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            result[dt.get_text(strip=True)] = dd.get_text(strip=True)
    return result


def extract_nested_list(ul_element) -> list:
    """Recursively extract nested ul/ol into a tree structure."""
    items = []
    for li in ul_element.find_all("li", recursive=False):
        text = li.find(string=True, recursive=False)
        text = text.strip() if text else ""
        children_ul = li.find(["ul", "ol"])
        if children_ul:
            items.append({"text": text, "children": extract_nested_list(children_ul)})
        else:
            items.append({"text": li.get_text(strip=True)})
    return items
```

### iframe Content Access

```python
import httpx

async def fetch_iframe_content(
    page_html: str, base_url: str, client: httpx.AsyncClient
) -> list[BeautifulSoup]:
    """Fetch and parse all iframe sources from a page."""
    soup = BeautifulSoup(page_html, "html.parser")
    iframes = soup.find_all("iframe")
    results = []

    for iframe in iframes:
        src = iframe.get("src")
        if not src:
            continue
        # Resolve relative URLs
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            from urllib.parse import urljoin
            src = urljoin(base_url, src)

        resp = await client.get(src, follow_redirects=True)
        results.append(BeautifulSoup(resp.text, "html.parser"))
    return results
```

### Korean Text Encoding

```python
import httpx

def fetch_with_encoding(url: str, *, fallback_encoding: str = "euc-kr") -> str:
    """Fetch a page, auto-detecting EUC-KR/CP949 encoding."""
    resp = httpx.get(url, follow_redirects=True)

    # 1. Check HTTP header
    content_type = resp.headers.get("content-type", "")
    if "charset=" in content_type.lower():
        declared = content_type.split("charset=")[-1].strip().lower()
        if declared in ("euc-kr", "euckr", "cp949"):
            return resp.content.decode("cp949", errors="replace")

    # 2. Check meta tag
    raw = resp.content
    probe = raw[:2048].decode("ascii", errors="ignore").lower()
    if "euc-kr" in probe or "euckr" in probe:
        return raw.decode("cp949", errors="replace")

    # 3. Try UTF-8, then fallback
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode(fallback_encoding, errors="replace")
```

### CSS Selector vs find/find_all

| Method | Best For | Example |
|--------|----------|---------|
| `soup.select("div.content > p")` | Complex nested paths, class/id combos | Multi-level CSS paths |
| `soup.find("div", class_="content")` | Simple single-element lookup | Known structure |
| `soup.find_all("a", href=True)` | Attribute filtering | Collecting all links |
| `soup.select_one("#main-table tr:nth-child(2)")` | Positional targeting | Specific row/cell |

**Rule of thumb**: Use `select()` for paths, `find()`/`find_all()` for attribute filters.

---

## 2. Playwright Navigation & Wait Strategies

### Wait Event Comparison

| Event | When to Use | Caveat |
|-------|-------------|--------|
| `networkidle` | SPA with lazy-loaded data | Slow; waits for 500ms of no requests |
| `domcontentloaded` | Server-rendered pages | JS may not have executed yet |
| `load` | Traditional pages with images/fonts | Blocks on all resources |
| `commit` | Fastest; navigation started | Page not rendered yet |

```python
from playwright.async_api import async_playwright

async def scrape_dynamic_page(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            locale="ko-KR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        # Use domcontentloaded for gov sites (faster than networkidle)
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        # Then wait for the specific content element
        await page.wait_for_selector("#content-area", timeout=10_000)

        html = await page.content()
        await browser.close()
        return html
```

### JavaScript Redirect Detection

```python
async def follow_js_redirects(page, url: str, max_redirects: int = 5) -> str:
    """Follow JS redirects (window.location, meta refresh) up to N hops."""
    visited = set()

    for _ in range(max_redirects):
        if page.url in visited:
            break
        visited.add(page.url)

        # Wait for potential JS redirect
        try:
            await page.wait_for_navigation(timeout=3_000)
        except Exception:
            break  # No redirect happened

    return page.url
```

### Dynamic Content Waiting

```python
async def wait_for_ajax_table(page, table_selector: str = "table") -> str:
    """Wait for a table to be populated by AJAX."""
    # Wait for at least one data row
    await page.wait_for_selector(
        f"{table_selector} tbody tr",
        state="attached",
        timeout=15_000,
    )

    # Optional: wait for a loading spinner to disappear
    try:
        await page.wait_for_selector(
            ".loading, .spinner",
            state="detached",
            timeout=5_000,
        )
    except Exception:
        pass  # No spinner found, proceed

    return await page.content()
```

### page.evaluate() for Complex Extraction

```python
async def extract_table_via_js(page) -> list[dict]:
    """Use page.evaluate() when DOM is complex or heavily JS-rendered."""
    return await page.evaluate("""
        () => {
            const table = document.querySelector('#data-table');
            if (!table) return [];

            const headers = [...table.querySelectorAll('th')]
                .map(th => th.textContent.trim());
            const rows = [...table.querySelectorAll('tbody tr')];

            return rows.map(tr => {
                const cells = [...tr.querySelectorAll('td')];
                const obj = {};
                cells.forEach((td, i) => {
                    obj[headers[i] || `col_${i}`] = td.textContent.trim();
                });
                return obj;
            });
        }
    """)
```

### Browser Context Isolation for Parallel Scraping

```python
import asyncio

async def parallel_scrape(urls: list[str]) -> list[str]:
    """Scrape multiple URLs in parallel using isolated browser contexts."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        async def scrape_one(url: str) -> str:
            # Each URL gets its own context (cookies, storage isolated)
            context = await browser.new_context()
            page = await context.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                return await page.content()
            finally:
                await context.close()

        # Limit concurrency to avoid overloading target
        semaphore = asyncio.Semaphore(3)

        async def bounded_scrape(url: str) -> str:
            async with semaphore:
                return await scrape_one(url)

        results = await asyncio.gather(
            *[bounded_scrape(url) for url in urls],
            return_exceptions=True,
        )
        await browser.close()
        return [r if isinstance(r, str) else "" for r in results]
```

---

## 3. Government Site Common Patterns

### Korean Government Portal Structures

Korean government sites (`.go.kr`) share common patterns:

| Pattern | Sites | Handling |
|---------|-------|----------|
| Board-list pagination | data.go.kr, me.go.kr | `page=N` or `pageIndex=N` query params |
| iframe-wrapped content | KOSIS, e-Nara | Fetch iframe `src` separately |
| JavaScript-only navigation | Various ministries | Playwright required |
| EUC-KR encoding | Older systems | CP949 decoding (superset of EUC-KR) |
| Session-gated downloads | data.go.kr API | Login + session cookie forwarding |

### JS Redirect Chains

```python
async def handle_gov_redirects(page) -> None:
    """Handle common Korean gov site redirect patterns."""
    # Pattern 1: window.location.href = '...'
    # Pattern 2: document.location.replace('...')
    # Pattern 3: <meta http-equiv="refresh" content="0;url=...">

    # Wait for final destination
    await page.wait_for_load_state("domcontentloaded")

    # Check for meta refresh
    meta_refresh = await page.query_selector('meta[http-equiv="refresh"]')
    if meta_refresh:
        content = await meta_refresh.get_attribute("content")
        if content and "url=" in content.lower():
            target_url = content.split("url=", 1)[-1].strip("'\"")
            await page.goto(target_url, wait_until="domcontentloaded")
```

### Session/Cookie Handling

```python
async def authenticated_gov_scrape(
    login_url: str,
    target_url: str,
    credentials: dict,
) -> str:
    """Login to a government portal and scrape authenticated content."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Step 1: Navigate to login
        await page.goto(login_url, wait_until="networkidle")

        # Step 2: Fill credentials
        await page.fill("#userId", credentials["user_id"])
        await page.fill("#userPw", credentials["password"])
        await page.click("#loginBtn")

        # Step 3: Wait for redirect after login
        await page.wait_for_url("**/main**", timeout=10_000)

        # Step 4: Navigate to target with session cookies
        await page.goto(target_url, wait_until="domcontentloaded")
        html = await page.content()

        await browser.close()
        return html
```

### iframe-Based Content (Common in Korean Gov Sites)

```python
async def extract_iframe_content(page) -> str:
    """Extract content from nested iframes (common in KOSIS, e-Nara)."""
    # Wait for iframe to load
    iframe_element = await page.wait_for_selector("iframe#contentFrame")
    iframe = await iframe_element.content_frame()

    if iframe is None:
        return ""

    # Some sites nest iframes 2-3 levels deep
    nested_iframe = await iframe.query_selector("iframe")
    if nested_iframe:
        iframe = await nested_iframe.content_frame()

    return await iframe.content() if iframe else ""
```

### CAPTCHA and Bot Detection Indicators

| Indicator | Detection | Mitigation |
|-----------|-----------|------------|
| 403 Forbidden | Status code check | Rotate user-agent, add delays |
| Empty response body | `len(html) < 100` | Retry with Playwright |
| CAPTCHA form | `soup.find("form", id="captchaForm")` | Flag for manual intervention |
| Rate limit headers | `Retry-After` header | Respect backoff period |
| JavaScript challenge | Cloudflare/WAF JS | Use Playwright, not httpx |

```python
def detect_bot_block(html: str, status_code: int) -> str | None:
    """Detect common bot-blocking patterns. Returns block type or None."""
    if status_code == 403:
        return "forbidden"
    if status_code == 429:
        return "rate_limited"
    if len(html) < 200:
        return "empty_response"

    soup = BeautifulSoup(html, "html.parser")
    if soup.find("form", id=lambda x: x and "captcha" in x.lower()):
        return "captcha"
    if soup.find("div", class_=lambda x: x and "cf-" in str(x)):
        return "cloudflare"

    return None
```

---

## 4. Smart Parser Design Patterns

### SmartTableDetector

```python
from dataclasses import dataclass


@dataclass
class TableSignature:
    """Describes expected table structure for auto-detection."""
    required_headers: list[str]
    optional_headers: list[str] = None
    min_rows: int = 1
    header_row_index: int = 0


def detect_table(
    soup: BeautifulSoup,
    signature: TableSignature,
) -> "Tag | None":
    """Find a table matching the given signature."""
    for table in soup.find_all("table"):
        headers = [
            th.get_text(strip=True)
            for th in table.find_all("tr")[signature.header_row_index].find_all(
                ["th", "td"]
            )
        ]
        if all(h in headers for h in signature.required_headers):
            data_rows = table.find_all("tr")[signature.header_row_index + 1 :]
            if len(data_rows) >= signature.min_rows:
                return table
    return None


# Usage
sig = TableSignature(
    required_headers=["항목명", "기준일", "수치"],
    optional_headers=["단위", "비고"],
    min_rows=3,
)
target_table = detect_table(soup, sig)
```

### Adaptive Selectors

```python
class AdaptiveSelector:
    """Try multiple selectors in order, surviving minor layout changes."""

    def __init__(self, selectors: list[str], description: str = ""):
        self.selectors = selectors
        self.description = description

    def find(self, soup: BeautifulSoup):
        for selector in self.selectors:
            result = soup.select(selector)
            if result:
                return result
        return []

    def find_one(self, soup: BeautifulSoup):
        results = self.find(soup)
        return results[0] if results else None


# Define selectors with fallbacks
CONTENT_AREA = AdaptiveSelector(
    selectors=[
        "#content-area",                    # Primary: ID-based
        "div.content_area",                 # Fallback 1: class-based
        "main > div:first-child",           # Fallback 2: structural
        "body > div.wrapper > div.content", # Fallback 3: full path
    ],
    description="Main content area",
)
```

### Schema-First Parsing

```python
from pydantic import BaseModel, field_validator


class QCInspectionResult(BaseModel):
    """Define expected output shape before writing the parser."""
    item_name: str
    inspection_date: str
    result: str  # "적합" | "부적합" | "해당없음"
    standard_value: str | None = None
    measured_value: str | None = None
    unit: str | None = None

    @field_validator("result")
    @classmethod
    def validate_result(cls, v: str) -> str:
        allowed = {"적합", "부적합", "해당없음"}
        if v not in allowed:
            raise ValueError(f"Result must be one of {allowed}, got '{v}'")
        return v


def parse_inspection_table(
    table_element,
    header_map: dict[str, str] | None = None,
) -> list[QCInspectionResult]:
    """Parse table rows into validated Pydantic models."""
    default_map = {
        "항목명": "item_name",
        "검사일자": "inspection_date",
        "결과": "result",
        "기준치": "standard_value",
        "측정치": "measured_value",
        "단위": "unit",
    }
    mapping = header_map or default_map

    headers = [
        th.get_text(strip=True) for th in table_element.find_all("th")
    ]
    results = []

    for tr in table_element.find_all("tr"):
        cells = tr.find_all("td")
        if not cells:
            continue

        raw = {}
        for i, td in enumerate(cells):
            if i < len(headers) and headers[i] in mapping:
                raw[mapping[headers[i]]] = td.get_text(strip=True)

        try:
            results.append(QCInspectionResult(**raw))
        except Exception:
            continue  # Skip malformed rows, log in production

    return results
```

### Fallback Chains

```python
import re


def extract_value(
    soup: BeautifulSoup,
    label: str,
) -> str | None:
    """Extract a value using a fallback chain of strategies."""

    # Strategy 1: CSS selector — label in <th>, value in next <td>
    for th in soup.find_all("th"):
        if label in th.get_text(strip=True):
            td = th.find_next_sibling("td")
            if td:
                return td.get_text(strip=True)

    # Strategy 2: Definition list
    for dt in soup.find_all("dt"):
        if label in dt.get_text(strip=True):
            dd = dt.find_next_sibling("dd")
            if dd:
                return dd.get_text(strip=True)

    # Strategy 3: Label + adjacent text pattern
    label_el = soup.find(string=re.compile(re.escape(label)))
    if label_el:
        parent = label_el.parent
        next_sib = parent.find_next_sibling()
        if next_sib:
            return next_sib.get_text(strip=True)

    # Strategy 4: Regex on raw text
    text = soup.get_text()
    pattern = rf"{re.escape(label)}\s*[:\uff1a]\s*(.+?)(?:\n|$)"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()

    return None
```

---

## 5. Error Handling

### Timeout Strategies

```python
import httpx

def create_scraping_client() -> httpx.AsyncClient:
    """Create an HTTP client with layered timeout strategy."""
    return httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,    # TCP connection timeout
            read=15.0,      # Read timeout (waiting for response body)
            write=5.0,      # Write timeout (sending request body)
            pool=10.0,      # Connection pool timeout
        ),
        follow_redirects=True,
        limits=httpx.Limits(
            max_connections=10,
            max_keepalive_connections=5,
        ),
    )
```

### Retry with Exponential Backoff

```python
import asyncio
import random
from collections.abc import Callable


async def retry_with_backoff(
    fn: Callable,
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retryable_status: set[int] = frozenset({429, 500, 502, 503, 504}),
    **kwargs,
):
    """Retry an async function with exponential backoff and jitter."""
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            result = await fn(*args, **kwargs)

            # Check HTTP status if result has one
            if hasattr(result, "status_code"):
                if result.status_code in retryable_status:
                    raise httpx.HTTPStatusError(
                        f"Status {result.status_code}",
                        request=result.request,
                        response=result,
                    )
            return result

        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            last_exception = e
            if attempt == max_retries:
                break

            delay = min(base_delay * (2 ** attempt), max_delay)
            jitter = random.uniform(0, delay * 0.1)
            await asyncio.sleep(delay + jitter)

    raise last_exception
```

### Structure Change Detection

```python
import hashlib
import json
from pathlib import Path


class StructureValidator:
    """Detect when a target site's HTML structure has changed."""

    def __init__(self, fingerprint_dir: str = ".scraper_fingerprints"):
        self.fp_dir = Path(fingerprint_dir)
        self.fp_dir.mkdir(exist_ok=True)

    def compute_fingerprint(self, soup: BeautifulSoup, selectors: list[str]) -> str:
        """Create a structural fingerprint from CSS selectors."""
        parts = []
        for sel in selectors:
            elements = soup.select(sel)
            parts.append(f"{sel}:{len(elements)}")
            for el in elements[:3]:  # Sample first 3
                parts.append(f"  tag={el.name},classes={el.get('class')}")
        return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:16]

    def check(self, site_key: str, soup: BeautifulSoup, selectors: list[str]) -> bool:
        """Returns True if structure matches previous fingerprint."""
        fp_file = self.fp_dir / f"{site_key}.json"
        current_fp = self.compute_fingerprint(soup, selectors)

        if fp_file.exists():
            stored = json.loads(fp_file.read_text())
            if stored["fingerprint"] != current_fp:
                return False  # Structure changed!

        # Update fingerprint
        fp_file.write_text(json.dumps({
            "fingerprint": current_fp,
            "selectors": selectors,
        }))
        return True
```

### Stale Content Detection

```python
import hashlib
from datetime import datetime


class ContentFreshnessChecker:
    """Detect when scraped content hasn't actually changed."""

    def __init__(self):
        self._hashes: dict[str, tuple[str, datetime]] = {}

    def is_stale(self, url: str, content: str) -> bool:
        """Returns True if content is identical to last scrape."""
        content_hash = hashlib.md5(content.encode()).hexdigest()
        if url in self._hashes:
            prev_hash, _ = self._hashes[url]
            if prev_hash == content_hash:
                return True

        self._hashes[url] = (content_hash, datetime.now())
        return False
```

---

## 6. Testing

### Snapshot Testing for Parser Outputs

```python
import json
from pathlib import Path

import pytest


FIXTURES_DIR = Path(__file__).parent / "fixtures"
SNAPSHOTS_DIR = Path(__file__).parent / "snapshots"


def load_fixture(name: str) -> str:
    """Load an HTML fixture file."""
    return (FIXTURES_DIR / f"{name}.html").read_text(encoding="utf-8")


def assert_snapshot(name: str, data: list[dict]) -> None:
    """Compare parser output against a stored snapshot."""
    snapshot_file = SNAPSHOTS_DIR / f"{name}.json"
    serialized = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)

    if not snapshot_file.exists():
        # First run: create snapshot
        snapshot_file.parent.mkdir(parents=True, exist_ok=True)
        snapshot_file.write_text(serialized)
        pytest.skip(f"Snapshot created: {snapshot_file}")

    expected = snapshot_file.read_text(encoding="utf-8")
    assert serialized == expected, (
        f"Snapshot mismatch for {name}. "
        f"Run with --update-snapshots to update."
    )


# Usage in tests
def test_parse_qc_inspection_table():
    html = load_fixture("qc_inspection_2024")
    results = parse_inspection_table(
        BeautifulSoup(html, "html.parser").find("table")
    )
    assert_snapshot("qc_inspection_2024", [r.model_dump() for r in results])
```

### Mock HTML Fixtures for Unit Tests

```python
# tests/fixtures/simple_table.html
SIMPLE_TABLE_HTML = """
<html>
<body>
<table id="result-table">
  <thead>
    <tr><th>항목명</th><th>검사일자</th><th>결과</th></tr>
  </thead>
  <tbody>
    <tr><td>수질검사</td><td>2024-01-15</td><td>적합</td></tr>
    <tr><td>대기질검사</td><td>2024-01-16</td><td>부적합</td></tr>
  </tbody>
</table>
</body>
</html>
"""


def test_parse_simple_table():
    soup = BeautifulSoup(SIMPLE_TABLE_HTML, "html.parser")
    table = soup.find("table", id="result-table")
    results = parse_inspection_table(table)
    assert len(results) == 2
    assert results[0].item_name == "수질검사"
    assert results[0].result == "적합"
    assert results[1].result == "부적합"
```

### VCR-Style Recording for Integration Tests

```python
import json
import hashlib
from pathlib import Path

import httpx


class ResponseRecorder:
    """Record and replay HTTP responses for deterministic testing."""

    def __init__(self, cassette_dir: str = "tests/cassettes"):
        self.cassette_dir = Path(cassette_dir)
        self.cassette_dir.mkdir(parents=True, exist_ok=True)

    def _cassette_path(self, url: str, method: str = "GET") -> Path:
        key = hashlib.md5(f"{method}:{url}".encode()).hexdigest()
        return self.cassette_dir / f"{key}.json"

    async def get(
        self,
        url: str,
        client: httpx.AsyncClient,
        *,
        record: bool = False,
    ) -> httpx.Response:
        cassette = self._cassette_path(url)

        if not record and cassette.exists():
            # Replay mode
            data = json.loads(cassette.read_text())
            return httpx.Response(
                status_code=data["status_code"],
                headers=data["headers"],
                content=data["body"].encode("utf-8"),
            )

        # Record mode
        resp = await client.get(url)
        cassette.write_text(json.dumps({
            "url": url,
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "body": resp.text,
        }, ensure_ascii=False, indent=2))
        return resp


# Usage
recorder = ResponseRecorder()

async def test_fetch_gov_data():
    async with httpx.AsyncClient() as client:
        resp = await recorder.get(
            "https://data.go.kr/api/sample",
            client,
            record=False,  # Set True on first run
        )
        assert resp.status_code == 200
```

---

## Quick Reference

| Task | Tool | Key Pattern |
|------|------|-------------|
| Static HTML parsing | BeautifulSoup | `parse_table()`, `select()` |
| JS-rendered content | Playwright | `wait_for_selector()`, `evaluate()` |
| Korean encoding | httpx + CP949 | `fetch_with_encoding()` |
| Gov site login | Playwright contexts | `authenticated_gov_scrape()` |
| Parallel scraping | Playwright + asyncio | `Semaphore(3)` per domain |
| Layout change detection | Structural fingerprint | `StructureValidator.check()` |
| Test reproducibility | VCR cassettes | `ResponseRecorder` |
