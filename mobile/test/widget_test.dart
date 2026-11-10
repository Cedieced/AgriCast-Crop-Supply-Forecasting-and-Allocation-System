import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:agriflow_field/main.dart';

void main() {
  test('Boac field lists include all 61 barangays', () {
    expect(barangays, hasLength(61));
    expect(barangays.toSet(), hasLength(61));
  });

  test('crop maturity and yield defaults support automatic calculations', () {
    expect(crops['Rice']!['maturity'], 120);
    expect(crops['Rice']!['yield'], 4500);
    expect(crops['Corn']!['maturity'], 110);
    expect(crops['Mongo']!['maturity'], 90);
  });

  test('release mobile builds require an internally configured API URL', () {
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
        debugBuild: false,
      ),
      isEmpty,
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
        override: 'https://api.example.gov.ph/api',
        debugBuild: false,
      ),
      'https://api.example.gov.ph/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
        override: 'http://api.example.gov.ph/api',
        debugBuild: false,
      ),
      isEmpty,
    );
    expect(
      resolveApiBaseUrl(
        isWeb: true,
        currentUri: Uri.parse('https://field.example.gov.ph/'),
        debugBuild: false,
      ),
      isEmpty,
    );
  });

  test('API health check uses the centralized configured base URL', () async {
    final client = MockClient((request) async {
      expect(request.url.toString(), 'https://api.example.gov.ph/api/health');
      return http.Response('{"status":"ok"}', 200);
    });
    final api = FieldApi(client, const FlutterSecureStorage(),
        baseUrl: 'https://api.example.gov.ph/api');

    await api.checkHealth();
    client.close();
  });

  test('expired sessions are detected before using a stored token', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/api/auth/me');
      expect(request.headers['authorization'], 'Bearer stale-token');
      return http.Response('{"error":"Invalid or expired token"}', 401);
    });
    final api = FieldApi(client, const FlutterSecureStorage(),
        baseUrl: 'https://api.example.gov.ph/api');

    expect(await api.validateSession('stale-token'), isFalse);
    client.close();
  });

  testWidgets('sign-in has no API URL field', (tester) async {
    final api = FieldApi(
      MockClient((_) async => http.Response('{}', 200)),
      const FlutterSecureStorage(),
      baseUrl: 'https://api.example.gov.ph/api',
    );
    await tester.pumpWidget(
      MaterialApp(home: LoginPage(api: api, onSignedIn: (_) {})),
    );

    expect(find.byType(TextField), findsNWidgets(2));
    expect(find.text('Email address'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.textContaining('API server URL'), findsNothing);
  });

  test(
      'Flutter web login targets the local API instead of the Android emulator',
      () {
    expect(
      resolveApiBaseUrl(
        isWeb: true,
        currentUri: Uri.parse('http://localhost:5174/'),
      ),
      'http://localhost:4000/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: true,
        currentUri: Uri.parse('http://10.0.10.85:5174/'),
      ),
      'http://10.0.10.85:4000/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: true,
        currentUri: Uri.parse('https://field.example.gov.ph/'),
      ),
      'https://field.example.gov.ph:4000/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
      ),
      'http://10.0.10.85:4000/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
        debugBuild: false,
      ),
      isEmpty,
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
        override: 'http://192.168.2.9:4000/api',
      ),
      'http://192.168.2.9:4000/api',
    );
  });
}
