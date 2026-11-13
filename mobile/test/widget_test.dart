import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

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

  test('nullable numeric fields are safe to convert from API data', () {
    final crop = <String, Object?>{
      'name': 'Rice',
      'average_yield_kg_ha': null,
      'maturity_days': null,
    };
    expect(readNum(crop['average_yield_kg_ha']), isNull);
    expect(readInt(crop['maturity_days']), isNull);
    expect(readString(null), isNull);
    expect(readNum('4500'), 4500);
    expect(readInt('120'), 120);
  });

  test('upgrades a local crop catalog that predates maturity_days', () async {
    sqfliteFfiInit();
    final database = await databaseFactoryFfi.openDatabase(
      inMemoryDatabasePath,
      options: OpenDatabaseOptions(
        version: 3,
        onCreate: (db, _) async {
          await db.execute('''
            CREATE TABLE crop_catalog (
              name TEXT PRIMARY KEY,
              average_yield_kg_ha REAL NOT NULL,
              per_capita_kg_year REAL NOT NULL DEFAULT 0
            )
          ''');
          await db.insert('crop_catalog', {
            'name': 'Rice',
            'average_yield_kg_ha': 4500,
            'per_capita_kg_year': 115,
          });
        },
      ),
    );
    addTearDown(database.close);

    await upgradeLocalDatabase(database, 3);

    final columns = await database.rawQuery('PRAGMA table_info(crop_catalog)');
    expect(columns.any((column) => column['name'] == 'maturity_days'), isTrue);
    final rice = await database.query(
      'crop_catalog',
      where: 'name = ?',
      whereArgs: ['Rice'],
    );
    expect(rice.single['maturity_days'], 120);
    await database.insert('crop_catalog', {
      'name': 'Cucumber',
      'average_yield_kg_ha': 18000,
      'per_capita_kg_year': 1,
      'maturity_days': 60,
    });
    expect(
      await database.query(
        'crop_catalog',
        where: 'name = ?',
        whereArgs: ['Cucumber'],
      ),
      hasLength(1),
    );
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
      'http://192.168.2.9:4000/api',
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
