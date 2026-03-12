# Flutter Security Guide

> Reference: OWASP Mobile Top 10 (2024), Flutter Official Documentation

## OWASP Mobile Top 10 Mapping

### M1 — Improper Credential Usage

- Never hardcode API keys, tokens, or credentials in source code
- Backend proxy pattern: route ALL sensitive API calls through server
- `--dart-define-from-file=.env` is for NON-SECRET build config only (values are extractable from binary)
- Credential rotation: implement token refresh with `dio` interceptor
- OAuth2 flow: use `flutter_appauth` for PKCE-based authentication

### M2 — Inadequate Supply Chain Security

- Run `dart pub audit` before every release to check for known vulnerabilities
- Pin exact versions in `pubspec.yaml` for production (`package: 1.2.3` not `package: ^1.2.3`)
- Verify package publisher on pub.dev (look for verified publisher badge)
- Review transitive dependencies: `dart pub deps --style=compact`
- Avoid packages with no recent updates (> 12 months without commits)

### M3 — Insecure Authentication/Authorization

- Biometric authentication: `local_auth` package with `BiometricType.fingerprint` / `BiometricType.face`
- Session management: implement token expiry checking before API calls
- JWT client-side validation: verify `exp`, `aud`, `iss` claims before using tokens
- Re-authentication: require biometric/PIN for sensitive operations (payment, profile changes)
- Deep link auth: validate authentication state before processing deep link navigation

### M4 — Insufficient Input/Output Validation

- Validate ALL deep link URI parameters with RegExp allowlists
- Sanitize user input before displaying in WebView (`flutter_inappwebview`)
- Use `Uri.parse()` with try-catch, never trust raw string URLs
- Output encoding: escape HTML entities when rendering user content
- Form validation: use `TextFormField` validators, never trust client-side validation alone

### M5 — Insecure Communication

- Certificate pinning (SPKI): use `dio` with custom `SecurityContext`
- Extract SPKI hash: `openssl s_client -connect host:443 | openssl x509 -pubkey | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64`
- Include backup pins for certificate rotation
- Android: `network_security_config.xml` with `cleartextTrafficPermitted=false`
- iOS: ATS enabled (`NSAllowsArbitraryLoads=false`), never override in production

### M6 — Inadequate Privacy Controls

- Request minimum platform permissions (camera, location, contacts)
- iOS: provide usage description strings in Info.plist for every permission
- Android: use runtime permissions, respect "Don't ask again"
- Data minimization: only collect and store data that is necessary
- GDPR/CCPA: implement data export and deletion capabilities

### M7 — Insufficient Binary Protections

- Release builds: `flutter build --obfuscate --split-debug-info=debug-info/`
- Store debug symbols securely for crash reporting (Crashlytics, Sentry)
- Android ProGuard: configure `android/app/proguard-rules.pro`
- Note: `--obfuscate` does NOT apply to `flutter build web` (JS minification is the web equivalent)
- Anti-tampering: consider `flutter_jailbreak_detection` for integrity checks

### M8 — Security Misconfiguration

- Android: set `android:debuggable="false"` in release manifest
- Android: set `android:allowBackup="false"` to prevent ADB data extraction
- iOS: enable data protection with `NSFileProtectionComplete`
- Remove all debug logging in release: guard with `kDebugMode`
- Firebase: secure `google-services.json` / `GoogleService-Info.plist` (add to .gitignore)

### M9 — Insecure Data Storage

- Sensitive data: `flutter_secure_storage` v10+ (iOS Keychain / Android EncryptedSharedPreferences)
- iOS: `IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device)`
- Android: `AndroidOptions(encryptedSharedPreferences: true)`
- Web WARNING: `flutter_secure_storage` uses localStorage on Web (XSS vulnerable) — use HttpOnly cookies or in-memory storage
- Never use `SharedPreferences` for tokens, PII, or credentials
- Screenshot protection: Android `FLAG_SECURE` via `flutter_windowmanager`

### M10 — Insufficient Cryptography

- Use `pointycastle` or `cryptography` package for custom crypto operations
- Avoid: MD5, SHA-1, DES, ECB mode, hardcoded IVs/keys
- Prefer: AES-256-GCM for symmetric, RSA-OAEP or ECDSA for asymmetric
- Key storage: always delegate to platform Keychain/Keystore, never store in app data
- Random number generation: use `Random.secure()` for security-sensitive values

## Platform-Specific Security

### iOS

- Keychain with Secure Enclave: `IOSOptions(useSecureEnclave: true)` for high-value data
- ATS enforcement: never add `NSAllowsArbitraryLoads` exception for production
- Jailbreak detection: `flutter_jailbreak_detection` package

### Android

- Keystore-backed encryption via `EncryptedSharedPreferences`
- Network security config: pin certificates, block cleartext
- Root detection: `flutter_jailbreak_detection` or `safe_device`
- `allowBackup=false` in AndroidManifest.xml

### Web

- CSP headers: configure on the server hosting Flutter web app
- Avoid storing sensitive data in localStorage or sessionStorage
- Use HttpOnly, Secure, SameSite cookies for authentication tokens
- XSS prevention: sanitize all user-generated content before rendering

## Package Recommendations

| Category | Package | Notes |
|----------|---------|-------|
| Secure Storage | `flutter_secure_storage` | Keychain/Keystore, v10+; Web: localStorage (XSS risk) |
| OAuth2 / PKCE | `flutter_appauth` | PKCE-based auth flows |
| Biometrics | `local_auth` | Fingerprint, Face ID |
| HTTP (pinning) | `dio` | Custom `SecurityContext` for certificate pinning |
| Crypto | `cryptography` | AES-GCM, RSA-OAEP, ECDSA |
| Integrity check | `flutter_jailbreak_detection` | Root/jailbreak detection |
| Screenshot protect | `flutter_windowmanager` | Android `FLAG_SECURE` |
