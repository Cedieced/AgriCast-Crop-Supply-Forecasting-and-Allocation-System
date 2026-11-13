import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart' show debugPrint, kDebugMode, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';
import 'package:uuid/uuid.dart';

const configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');
const localDevelopmentApiBaseUrl = String.fromEnvironment(
  'LOCAL_API_BASE_URL',
  defaultValue: 'http://192.168.2.9:4000/api',
);

String resolveApiBaseUrl({
  required bool isWeb,
  required Uri currentUri,
  String override = '',
  bool debugBuild = kDebugMode,
}) {
  if (override.isNotEmpty) {
    if (!debugBuild && Uri.tryParse(override)?.scheme != 'https') return '';
    return override;
  }
  if (isWeb) {
    if (!debugBuild) return '';
    final scheme = currentUri.scheme == 'https' ? 'https' : 'http';
    return Uri(
            scheme: scheme,
            host: currentUri.host.isEmpty ? 'localhost' : currentUri.host,
            port: 4000,
            path: '/api')
        .toString();
  }
  return debugBuild ? localDevelopmentApiBaseUrl : '';
}

String get apiBaseUrl => resolveApiBaseUrl(
      isWeb: kIsWeb,
      currentUri: Uri.base,
      override: configuredApiBaseUrl,
    );

const green = Color(0xFF2F7141);
const canvasColor = Color(0xFFF4F7F3);
const surfaceColor = Color(0xFFFFFFFF);
const inkColor = Color(0xFF20342A);
const mutedColor = Color(0xFF5F7064);
const outlineColor = Color(0xFFDCE6DC);
const softGreenColor = Color(0xFFEAF4E9);
const warningColor = Color(0xFF8A5C00);
const warningSurfaceColor = Color(0xFFFFF4D8);
const errorColor = Color(0xFFA83D35);
const errorSurfaceColor = Color(0xFFFBECEB);

num? readNum(Object? value) =>
    value is num ? value : num.tryParse(value?.toString() ?? '');

int? readInt(Object? value) =>
    value is int ? value : int.tryParse(value?.toString() ?? '');

double? readDouble(Object? value) =>
    value is double ? value : double.tryParse(value?.toString() ?? '');

String? readString(Object? value) => value?.toString();

const crops = <String, Map<String, num>>{
  'Rice': {'maturity': 120, 'yield': 4500, 'perCapita': 115},
  'Corn': {'maturity': 110, 'yield': 4200, 'perCapita': 18},
  'Mongo': {'maturity': 90, 'yield': 950, 'perCapita': 1.2},
  'Tomato': {'maturity': 75, 'yield': 18000, 'perCapita': 9},
};

List<Map<String, Object?>> defaultCropCatalog() => crops.entries
    .map((entry) => <String, Object?>{
          'name': entry.key,
          'average_yield_kg_ha': entry.value['yield'],
          'maturity_days': entry.value['maturity'],
          'per_capita_kg_year': entry.value['perCapita'],
        })
    .toList();

List<Map<String, Object?>> mergeCropCatalog(
    List<List<Map<String, Object?>>> catalogGroups) {
  final merged = <String, Map<String, Object?>>{};
  for (final group in catalogGroups) {
    for (final item in group) {
      final name = readString(item['name'])?.trim();
      if (name == null || name.isEmpty) continue;
      merged[name] = <String, Object?>{
        'name': name,
        'average_yield_kg_ha': readNum(item['average_yield_kg_ha']) ?? 0,
        'maturity_days': readInt(item['maturity_days']) ?? 0,
        'per_capita_kg_year': readNum(item['per_capita_kg_year']) ?? 0,
      };
    }
  }
  final result = merged.values.toList();
  result.sort((left, right) => (readString(left['name']) ?? '')
      .compareTo(readString(right['name']) ?? ''));
  return result;
}

const barangays = [
  'Agot',
  'Agumaymayan',
  'Amoingon',
  'Apitong',
  'Balagasan',
  'Balaring',
  'Balimbing',
  'Balogo',
  'Bamban',
  'Bangbangalon',
  'Bantad',
  'Bantay',
  'Bayuti',
  'Binunga',
  'Boi',
  'Boton',
  'Buliasnin',
  'Bunganay',
  'Caganhao',
  'Canat',
  'Catubugan',
  'Cawit',
  'Daig',
  'Daypay',
  'Duyay',
  'Hinapulan',
  'Ihatub',
  'Isok 1 (Poblacion)',
  'Isok 2 (Poblacion)',
  'Laylay',
  'Lupac',
  'Mahinhin',
  'Mainit',
  'Malbog',
  'Maligaya',
  'Malusak (Poblacion)',
  'Mansiwat',
  'Mataas na Bayan (Poblacion)',
  'Maybo',
  'Mercado (Poblacion)',
  'Murallon (Poblacion)',
  'Ogbac',
  'Pawa',
  'Pili',
  'Poctoy',
  'Poras',
  'Putting Buhangin',
  'Puyog',
  'Sabong',
  'San Miguel (Poblacion)',
  'Santol',
  'Sawi',
  'Tabi',
  'Tabigue',
  'Tagwak',
  'Tambunan',
  'Tampus (Poblacion)',
  'Tanza',
  'Tugos',
  'Tumagabok',
  'Tumapon',
];

Future<void> createLocalCropCatalog(DatabaseExecutor db) async {
  await db.execute('''
    CREATE TABLE crop_catalog (
      name TEXT PRIMARY KEY,
      average_yield_kg_ha REAL NOT NULL,
      maturity_days INTEGER NOT NULL,
      per_capita_kg_year REAL NOT NULL DEFAULT 0
    )
  ''');
  for (final crop in defaultCropCatalog()) {
    await db.insert('crop_catalog', crop,
        conflictAlgorithm: ConflictAlgorithm.ignore);
  }
}

Future<void> migrateLocalCropCatalog(DatabaseExecutor db) async {
  final tables = await db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crop_catalog'");
  if (tables.isEmpty) {
    await createLocalCropCatalog(db);
    return;
  }

  final columns = await db.rawQuery('PRAGMA table_info(crop_catalog)');
  if (columns.any((column) => column['name'] == 'maturity_days')) return;

  await db.execute(
      'ALTER TABLE crop_catalog ADD COLUMN maturity_days INTEGER NOT NULL DEFAULT 0');
  for (final crop in defaultCropCatalog()) {
    await db.update(
      'crop_catalog',
      {'maturity_days': crop['maturity_days']},
      where: 'name = ? AND maturity_days = 0',
      whereArgs: [crop['name']],
    );
  }
}

Future<void> upgradeLocalDatabase(DatabaseExecutor db, int oldVersion) async {
  if (oldVersion < 2) await createLocalCropCatalog(db);
  if (oldVersion < 3) {
    await db.execute('ALTER TABLE reports ADD COLUMN maturity_days INTEGER');
  }
  if (oldVersion < 4) await migrateLocalCropCatalog(db);
}

Future<Database> openLocalDatabase() async {
  final String path;
  if (kIsWeb) {
    databaseFactory = databaseFactoryFfiWeb;
    path = 'agriflow_field.db';
  } else {
    path = p.join(await getDatabasesPath(), 'agriflow.db');
  }
  return openDatabase(path,
      version: 4,
      onCreate: (db, _) async {
        await db.execute('''
      CREATE TABLE reports (
        id TEXT PRIMARY KEY, farmer_name TEXT NOT NULL, barangay_name TEXT NOT NULL,
        crop_name TEXT NOT NULL, area_ha REAL NOT NULL, planting_date TEXT NOT NULL,
        planting_method TEXT NOT NULL, latitude REAL, longitude REAL, maturity_days INTEGER,
        status TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL
      )
    ''');
        await createLocalCropCatalog(db);
      },
      onUpgrade: (db, oldVersion, _) => upgradeLocalDatabase(db, oldVersion));
}

class FieldApi {
  final http.Client client;
  final FlutterSecureStorage storage;
  final String baseUrl;

  FieldApi(this.client, this.storage, {String? baseUrl})
      : baseUrl = baseUrl ?? apiBaseUrl;

  Future<void> checkHealth() async {
    if (baseUrl.isEmpty) {
      throw Exception(
          'The API server is not configured for this build. Please contact your administrator.');
    }
    final response = await _send(
      client.get(Uri.parse('$baseUrl/health')),
      'API connection check',
    );
    if (response.statusCode != 200) {
      throw Exception(
          'The API server is unavailable. Please check your connection and try again.');
    }
  }

  Future<bool> validateSession(String token) async {
    final response = await _send(
      client.get(
        Uri.parse('$baseUrl/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ),
      'Session check',
    );
    if (response.statusCode == 401) return false;
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Session check failed'));
    }
    return true;
  }

  void _throwIfSessionExpired(http.Response response) {
    if (response.statusCode == 401) {
      throw const SessionExpiredException();
    }
  }

  Future<http.Response> _send(
      Future<http.Response> request, String operation) async {
    try {
      return await request.timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw Exception(
          '$operation timed out. Check your connection and try again.');
    } on http.ClientException {
      throw Exception(
          'Cannot reach the API server. Check your connection and try again.');
    }
  }

  String _responseError(http.Response response, String fallback) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic> &&
          body['error'] is String &&
          (body['error'] as String).isNotEmpty) {
        final requestId = body['requestId'] ?? response.headers['x-request-id'];
        final message = body['error'] as String;
        return requestId is String
            ? '$message (request ID: $requestId)'
            : message;
      }
    } on FormatException {
      final requestId = response.headers['x-request-id'];
      return requestId == null
          ? fallback
          : '$fallback (request ID: $requestId)';
    }
    final requestId = response.headers['x-request-id'];
    return requestId == null ? fallback : '$fallback (request ID: $requestId)';
  }

  Future<String> login(String email, String password) async {
    final response = await _send(
      client.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      ),
      'Login',
    );
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Sign in failed'));
    }
    late final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw Exception('The login API returned invalid JSON.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw Exception('The login API returned an invalid response.');
    }
    final result = decoded;
    if (result['user']?['role'] != 'field_officer') {
      throw Exception('This application is for Field Officer accounts.');
    }
    final token = result['token'];
    if (token is! String || token.isEmpty) {
      throw Exception('The login API did not return a valid session token.');
    }
    await storage.write(key: 'jwt', value: token);
    return token;
  }

  Future<void> sync(Map<String, Object?> report) async {
    final token = await storage.read(key: 'jwt');
    if (token == null) throw Exception('Please sign in again before syncing.');
    final response = await _send(
      client.post(
        Uri.parse('$baseUrl/reports'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        },
        body:
            jsonEncode(_reportBody(report)..['clientReportId'] = report['id']),
      ),
      'Report sync',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception(_responseError(response, 'Report sync failed'));
    }
  }

  Future<List<Map<String, Object?>>> fetchCrops() async {
    final token = await storage.read(key: 'jwt');
    if (token == null) {
      throw Exception('Please sign in again before loading crops.');
    }
    final response = await _send(
      client.get(
        Uri.parse('$baseUrl/crops'),
        headers: {'Authorization': 'Bearer $token'},
      ),
      'Crop catalog download',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Crop catalog download failed'));
    }

    late final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw Exception('The crop catalog API returned invalid JSON.');
    }
    if (decoded is! List) {
      throw Exception('The crop catalog API returned an invalid response.');
    }
    return decoded.map((item) {
      if (item is! Map<String, dynamic>) {
        throw Exception('The crop catalog contains an invalid crop.');
      }
      final yield = readNum(item['average_yield_kg_ha']);
      final maturity = readInt(item['maturity_days']);
      final perCapita = readNum(item['per_capita_kg_year']);
      if (item['name'] is! String || yield == null || maturity == null) {
        throw Exception('The crop catalog contains an incomplete crop.');
      }
      return <String, Object?>{
        'name': item['name'],
        'average_yield_kg_ha': yield,
        'maturity_days': maturity,
        'per_capita_kg_year': perCapita ?? 0,
      };
    }).toList();
  }

  Future<Map<String, Object?>> createCrop({
    required String name,
    required double averageYieldKgHa,
    required int maturityDays,
    required double perCapitaKgYear,
  }) async {
    final token = await storage.read(key: 'jwt');
    if (token == null) {
      throw Exception('Please sign in again before adding crops.');
    }
    final response = await _send(
      client.post(
        Uri.parse('$baseUrl/crops'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'name': name.trim(),
          'averageYieldKgHa': averageYieldKgHa,
          'maturityDays': maturityDays,
          'perCapitaKgYear': perCapitaKgYear,
        }),
      ),
      'Crop creation',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 201) {
      throw Exception(_responseError(response, 'Could not add crop type'));
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw Exception('The crop API returned an invalid response.');
    }
    return <String, Object?>{
      'name': decoded['name'],
      'average_yield_kg_ha': readNum(decoded['average_yield_kg_ha']),
      'maturity_days': readInt(decoded['maturity_days']),
      'per_capita_kg_year': readNum(decoded['per_capita_kg_year']) ?? 0,
    };
  }

  Future<List<Map<String, Object?>>> fetchReports() async {
    final token = await storage.read(key: 'jwt');
    if (token == null) throw Exception('Please sign in again before syncing.');
    final response = await _send(
      client.get(
        Uri.parse('$baseUrl/reports'),
        headers: {'Authorization': 'Bearer $token'},
      ),
      'Report download',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Report download failed'));
    }

    late final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw Exception('The reports API returned invalid JSON.');
    }
    if (decoded is! List) {
      throw Exception('The reports API returned an invalid response.');
    }
    return decoded.map((item) {
      if (item is! Map<String, dynamic>) {
        throw Exception('The reports API returned an invalid report.');
      }
      return <String, Object?>{
        'id': item['id'],
        'farmer_name': item['farmer_name'],
        'barangay_name': item['barangay_name'],
        'crop_name': item['crop_name'],
        'area_ha': readNum(item['area_ha']),
        'planting_date': readString(item['planting_date']),
        'planting_method': item['planting_method'],
        'maturity_days': readInt(item['maturity_days']),
        'latitude': readNum(item['latitude']),
        'longitude': readNum(item['longitude']),
        'status': item['status'],
        'sync_state': 'synced',
        'created_at':
            readString(item['created_at']) ?? DateTime.now().toIso8601String(),
      };
    }).toList();
  }

  Future<void> updateReport(Map<String, Object?> report) async {
    final token = await storage.read(key: 'jwt');
    if (token == null) throw Exception('Please sign in again before syncing.');
    final response = await _send(
      client.put(
        Uri.parse('$baseUrl/reports/${report['id']}'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode(_reportBody(report)),
      ),
      'Report update',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Report update failed'));
    }
  }

  Future<void> deleteReport(String reportId) async {
    final token = await storage.read(key: 'jwt');
    if (token == null) throw Exception('Please sign in again before syncing.');
    final response = await _send(
      client.delete(
        Uri.parse('$baseUrl/reports/$reportId'),
        headers: {'Authorization': 'Bearer $token'},
      ),
      'Report deletion',
    );
    _throwIfSessionExpired(response);
    if (response.statusCode != 200) {
      throw Exception(_responseError(response, 'Report deletion failed'));
    }
  }

  Map<String, Object?> _reportBody(Map<String, Object?> report) => {
        'barangayName': report['barangay_name'],
        'cropName': report['crop_name'],
        'farmerName': report['farmer_name'],
        'areaHa': report['area_ha'],
        'plantingDate': report['planting_date'],
        'plantingMethod': report['planting_method'],
        'latitude': report['latitude'],
        'longitude': report['longitude'],
        'status': report['status'],
      };
}

class SessionExpiredException implements Exception {
  const SessionExpiredException();

  @override
  String toString() =>
      'Your session expired. Sign in again to sync pending reports.';
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AgriFlowApp());
}

class AgriFlowApp extends StatefulWidget {
  const AgriFlowApp({super.key});
  @override
  State<AgriFlowApp> createState() => _AgriFlowAppState();
}

class _AgriFlowAppState extends State<AgriFlowApp> {
  final storage = const FlutterSecureStorage();
  final client = http.Client();
  late final Future<Database> database = openLocalDatabase();
  late final FieldApi api = FieldApi(client, storage);
  String? token;
  String? startupError;
  String? loginMessage;
  bool checkingSession = true;

  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    await storage.delete(key: 'api_base_url');
    var storedToken = await storage.read(key: 'jwt');
    try {
      await api.checkHealth();
      if (storedToken != null && !await api.validateSession(storedToken)) {
        await storage.delete(key: 'jwt');
        storedToken = null;
        loginMessage =
            'Your session expired. Sign in again to sync pending reports.';
      }
      if (mounted) {
        setState(() {
          token = storedToken;
          startupError = null;
          checkingSession = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          token = storedToken;
          startupError = storedToken == null
              ? error.toString().replaceFirst('Exception: ', '')
              : null;
          checkingSession = false;
        });
      }
    }
  }

  void signedIn(String value) => setState(() {
        token = value;
        loginMessage = null;
      });

  Future<void> signOut() async {
    await storage.delete(key: 'jwt');
    if (mounted) {
      setState(() {
        token = null;
        loginMessage = null;
      });
    }
  }

  Future<void> sessionExpired() async {
    await storage.delete(key: 'jwt');
    if (mounted) {
      setState(() {
        token = null;
        loginMessage =
            'Your session expired. Sign in again to sync pending reports.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'AgriCast Field',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: green,
            surface: surfaceColor,
          ).copyWith(
            primary: green,
            onPrimary: Colors.white,
            onSurface: inkColor,
            error: errorColor,
            onError: Colors.white,
          ),
          scaffoldBackgroundColor: canvasColor,
          textTheme: const TextTheme(
            titleLarge: TextStyle(
              color: inkColor,
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
            titleMedium: TextStyle(
              color: inkColor,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
            bodyLarge: TextStyle(color: inkColor, fontSize: 16),
            bodyMedium: TextStyle(color: inkColor, fontSize: 14),
            bodySmall: TextStyle(color: mutedColor, fontSize: 12),
            labelLarge: TextStyle(
              color: inkColor,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: canvasColor,
            foregroundColor: inkColor,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 1,
            titleTextStyle: TextStyle(
              color: inkColor,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          cardTheme: CardThemeData(
            color: surfaceColor,
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: outlineColor),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: surfaceColor,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
            labelStyle: const TextStyle(color: mutedColor, fontSize: 14),
            floatingLabelStyle: const TextStyle(
              color: green,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            hintStyle: const TextStyle(color: mutedColor, fontSize: 14),
            errorStyle: const TextStyle(color: errorColor, fontSize: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: outlineColor),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: outlineColor),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: green, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: errorColor),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: errorColor, width: 1.5),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            ),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              foregroundColor: green,
              side: const BorderSide(color: outlineColor),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 44),
              foregroundColor: green,
              textStyle:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          iconButtonTheme: IconButtonThemeData(
            style: IconButton.styleFrom(
              minimumSize: const Size(48, 48),
              foregroundColor: mutedColor,
            ),
          ),
          floatingActionButtonTheme: FloatingActionButtonThemeData(
            backgroundColor: green,
            foregroundColor: Colors.white,
            elevation: 3,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          snackBarTheme: SnackBarThemeData(
            behavior: SnackBarBehavior.floating,
            backgroundColor: inkColor,
            contentTextStyle:
                const TextStyle(color: Colors.white, fontSize: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          progressIndicatorTheme: const ProgressIndicatorThemeData(
            color: green,
            linearTrackColor: softGreenColor,
          ),
        ),
        home: checkingSession
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : startupError != null
                ? ApiUnavailablePage(
                    message: startupError!, onRetry: initialize)
                : token == null
                    ? LoginPage(
                        api: api,
                        onSignedIn: signedIn,
                        initialMessage: loginMessage,
                      )
                    : FieldHome(
                        database: database,
                        api: api,
                        onSignOut: signOut,
                        onSessionExpired: sessionExpired,
                      ),
      );
}

class ApiUnavailablePage extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const ApiUnavailablePage(
      {super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _BrandMark(),
                  const SizedBox(height: 24),
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: warningSurfaceColor,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.cloud_off_outlined,
                      color: warningColor,
                      size: 30,
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text('Unable to connect',
                      style: TextStyle(
                          color: inkColor,
                          fontSize: 24,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: mutedColor, fontSize: 14),
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                        onPressed: onRetry, child: const Text('Retry')),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class LoginPage extends StatefulWidget {
  final FieldApi api;
  final ValueChanged<String> onSignedIn;
  final String? initialMessage;

  const LoginPage({
    super.key,
    required this.api,
    required this.onSignedIn,
    this.initialMessage,
  });
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    error = widget.initialMessage;
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.api.login(email.text.trim(), password.text);
      widget.onSignedIn(result);
    } catch (e) {
      setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: surfaceColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: outlineColor),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0F20342A),
                    blurRadius: 28,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _BrandMark(),
                  const SizedBox(height: 34),
                  const Text('Field officer sign in',
                      style:
                          TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 24),
                  AutofillGroup(
                    child: Column(
                      children: [
                        TextField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.username],
                          decoration: const InputDecoration(
                            labelText: 'Email address',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: password,
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) {
                            if (!busy) unawaited(submit());
                          },
                          decoration: const InputDecoration(
                            labelText: 'Password',
                            prefixIcon: Icon(Icons.lock_outline),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: Semantics(
                        liveRegion: true,
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: errorSurfaceColor,
                            border: Border.all(color: const Color(0xFFF1D8D5)),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.error_outline,
                                  color: errorColor, size: 20),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(error!,
                                    style: const TextStyle(
                                        color: errorColor, fontSize: 13)),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: busy ? null : submit,
                      child: busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Sign in'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ))),
      );
}

class FieldHome extends StatefulWidget {
  final Future<Database> database;
  final FieldApi api;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onSessionExpired;

  const FieldHome(
      {super.key,
      required this.database,
      required this.api,
      required this.onSignOut,
      required this.onSessionExpired});
  @override
  State<FieldHome> createState() => _FieldHomeState();
}

class _FieldHomeState extends State<FieldHome> {
  StreamSubscription<List<ConnectivityResult>>? subscription;
  List<Map<String, Object?>> reports = [];
  bool loadingReports = true;
  String? reportLoadError;
  bool online = false;
  bool syncing = false;
  String? syncError;

  @override
  void initState() {
    super.initState();
    refresh();
    subscription = Connectivity().onConnectivityChanged.listen((results) {
      final connected = results.any((item) => item != ConnectivityResult.none);
      if (mounted) setState(() => online = connected);
      if (connected && mounted) syncQueued();
    });
    Connectivity().checkConnectivity().then((results) {
      final connected = results.any((item) => item != ConnectivityResult.none);
      if (mounted) {
        setState(() => online = connected);
      }
      if (connected) syncQueued();
    });
  }

  @override
  void dispose() {
    subscription?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    try {
      final db = await widget.database;
      final rows = await db.query('reports', orderBy: 'created_at DESC');
      if (mounted) {
        setState(() {
          reports = rows;
          reportLoadError = null;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          reportLoadError = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) setState(() => loadingReports = false);
    }
  }

  Future<void> saveReport(Map<String, Object?> report) async {
    final db = await widget.database;
    await db.insert('reports', report,
        conflictAlgorithm: ConflictAlgorithm.replace);
    await refresh();
    if (online && report['status'] == 'submitted') await syncQueued();
  }

  Future<void> syncQueued() async {
    if (syncing || !mounted) return;
    setState(() => syncing = true);
    syncError = null;
    var sessionExpired = false;
    try {
      final db = await widget.database;
      final queued = await db.query('reports',
          where: "sync_state = 'queued' AND status = 'submitted'");
      for (final report in queued) {
        try {
          await widget.api.sync(report);
          await db.update('reports', {'sync_state': 'synced'},
              where: 'id = ?', whereArgs: [report['id']]);
          syncError = null;
        } catch (error) {
          if (error is SessionExpiredException) {
            sessionExpired = true;
            await widget.onSessionExpired();
            return;
          }
          syncError = error.toString().replaceFirst('Exception: ', '');
          break;
        }
      }
      if (syncError == null) {
        try {
          final serverReports = await widget.api.fetchReports();
          for (final report in serverReports) {
            await db.insert('reports', report,
                conflictAlgorithm: ConflictAlgorithm.replace);
          }
        } catch (error) {
          if (error is SessionExpiredException) {
            sessionExpired = true;
            await widget.onSessionExpired();
            return;
          }
          syncError = error.toString().replaceFirst('Exception: ', '');
        }
      }
    } catch (error) {
      syncError = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => syncing = false);
      if (mounted && !sessionExpired) await refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final queued = reports
        .where((item) =>
            item['sync_state'] == 'queued' && item['status'] == 'submitted')
        .length;
    final submitted =
        reports.where((item) => item['status'] == 'submitted').length;
    final syncTitle = syncError != null
        ? 'Sync failed'
        : syncing
            ? 'Syncing reports'
            : !online
                ? 'Offline mode'
                : queued > 0
                    ? 'Ready to sync'
                    : 'Synced';
    final syncDetail = syncError ??
        (syncing
            ? 'Sending reports securely…'
            : !online
                ? '$queued report${queued == 1 ? '' : 's'} saved on this device'
                : queued > 0
                    ? '$queued report${queued == 1 ? '' : 's'} waiting to sync'
                    : 'All submitted reports are up to date');
    final syncTone = syncError != null
        ? errorColor
        : !online || queued > 0
            ? warningColor
            : green;
    final syncSurface = syncError != null
        ? errorSurfaceColor
        : !online || queued > 0
            ? warningSurfaceColor
            : softGreenColor;
    return Scaffold(
      appBar: AppBar(
        title: const _BrandMark(),
        actions: [
          IconButton(
              onPressed: widget.onSignOut,
              icon: const Icon(Icons.logout),
              tooltip: 'Sign out')
        ],
      ),
      body: RefreshIndicator(
          onRefresh: () async {
            await refresh();
            if (online) await syncQueued();
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 112),
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: syncSurface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: syncError != null
                        ? const Color(0xFFF1D8D5)
                        : !online || queued > 0
                            ? const Color(0xFFE9D9B6)
                            : const Color(0xFFD8E8D8),
                  ),
                ),
                child: Row(children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: surfaceColor.withValues(alpha: 0.75),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      syncError != null
                          ? Icons.cloud_off_outlined
                          : syncing
                              ? Icons.sync
                              : !online
                                  ? Icons.cloud_off_outlined
                                  : queued > 0
                                      ? Icons.cloud_upload_outlined
                                      : Icons.cloud_done_outlined,
                      color: syncTone,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(syncTitle,
                            style: TextStyle(
                              color: syncTone,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            )),
                        const SizedBox(height: 3),
                        Text(syncDetail,
                            style: TextStyle(
                              color:
                                  syncError != null ? errorColor : mutedColor,
                              fontSize: 12,
                            )),
                      ])),
                  if (online && (queued > 0 || syncError != null))
                    IconButton(
                      onPressed: syncing ? null : syncQueued,
                      icon: const Icon(Icons.sync),
                      tooltip: syncError != null ? 'Retry sync' : 'Sync now',
                    ),
                ]),
              ),
              const SizedBox(height: 24),
              const Text('Good day, Field Officer',
                  style: TextStyle(
                      color: inkColor,
                      fontSize: 24,
                      height: 1.2,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 5),
              const Text(
                  'Capture a farm visit. Your reports are stored securely on this device.',
                  style: TextStyle(color: mutedColor, fontSize: 14)),
              const SizedBox(height: 20),
              Row(children: [
                Expanded(
                    child: _SummaryCard(
                        label: 'VISITS SAVED',
                        value: '${reports.length}',
                        icon: Icons.agriculture_outlined)),
                const SizedBox(width: 10),
                Expanded(
                    child: _SummaryCard(
                        label: 'SUBMITTED',
                        value: '$submitted',
                        icon: Icons.task_alt_outlined)),
              ]),
              const SizedBox(height: 23),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Recent field reports',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                TextButton(onPressed: refresh, child: const Text('Refresh')),
              ]),
              if (loadingReports)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 28),
                  child: Semantics(
                    liveRegion: true,
                    label: 'Loading field reports',
                    child: const Center(child: CircularProgressIndicator()),
                  ),
                )
              else if (reportLoadError != null)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: errorSurfaceColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFF1D8D5)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(reportLoadError!,
                          style:
                              const TextStyle(color: errorColor, fontSize: 13)),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: refresh,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Try again'),
                      ),
                    ],
                  ),
                )
              else if (reports.isEmpty)
                const _EmptyReports()
              else
                ...reports.map((report) => _ReportTile(report: report)),
            ],
          )),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final report = await Navigator.of(context).push<Map<String, Object?>>(
            MaterialPageRoute(
              builder: (_) =>
                  ReportForm(api: widget.api, database: widget.database),
            ),
          );
          if (report != null) await saveReport(report);
        },
        icon: const Icon(Icons.add),
        label: const Text('New farm report'),
      ),
    );
  }
}

class ReportForm extends StatefulWidget {
  final FieldApi api;
  final Future<Database> database;

  const ReportForm({super.key, required this.api, required this.database});

  @override
  State<ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<ReportForm> {
  final formKey = GlobalKey<FormState>();
  final farmer = TextEditingController();
  final area = TextEditingController();
  List<Map<String, Object?>> cropCatalog = defaultCropCatalog();
  String barangay = barangays[1];
  String crop = 'Rice';
  String method = 'Transplanting';
  DateTime plantingDate = DateTime.now();
  Position? position;
  bool locating = false;
  bool saving = false;
  bool loadingCrops = false;
  String? locationError;
  String? cropMessage;

  Map<String, Object?> get selectedCrop => cropCatalog.firstWhere(
        (item) => item['name'] == crop,
        orElse: () => defaultCropCatalog().firstWhere(
          (item) => item['name'] == crop,
        ),
      );

  int get maturityDays => (readNum(selectedCrop['maturity_days']) ?? 0).toInt();
  num get averageYield => readNum(selectedCrop['average_yield_kg_ha']) ?? 0;
  DateTime get harvestDate => plantingDate.add(Duration(days: maturityDays));
  double get expectedKg =>
      (double.tryParse(area.text) ?? 0) * averageYield.toDouble();
  bool get cropMessageIsWarning =>
      cropMessage?.startsWith('Offline:') == true ||
      cropMessage?.startsWith('All crop types loaded') == true;

  @override
  void initState() {
    super.initState();
    loadCropCatalog();
  }

  Future<void> loadCropCatalog() async {
    setState(() => loadingCrops = true);
    try {
      Database? db;
      List<Map<String, Object?>> cached = [];
      Object? cacheReadError;
      try {
        db = await widget.database;
        cached = await db.query('crop_catalog', orderBy: 'name');
      } catch (error) {
        cacheReadError = error;
      }
      final fallbackCatalog = mergeCropCatalog([
        defaultCropCatalog(),
        cached,
      ]);
      if (mounted) {
        setState(() {
          cropCatalog = fallbackCatalog;
          if (!cropCatalog.any((item) => readString(item['name']) == crop)) {
            final firstName = readString(cropCatalog.first['name']) ?? 'Rice';
            crop = firstName;
          }
        });
      }

      late final List<Map<String, Object?>> remote;
      try {
        remote = await widget.api.fetchCrops();
      } catch (error) {
        if (mounted) {
          setState(() {
            final details = error.toString().replaceFirst('Exception: ', '');
            cropMessage = cached.isEmpty
                ? 'Could not load crop types: $details'
                : 'Offline: using saved crop types. $details';
          });
        }
        return;
      }

      final mergedCatalog = mergeCropCatalog([
        defaultCropCatalog(),
        cached,
        remote,
      ]);
      if (mounted) {
        setState(() {
          cropCatalog = mergedCatalog;
          if (!cropCatalog.any((item) => readString(item['name']) == crop)) {
            final firstName = readString(cropCatalog.first['name']) ?? 'Rice';
            crop = firstName;
          }
          cropMessage = null;
        });
      }

      if (db == null) {
        if (kDebugMode && cacheReadError != null) {
          debugPrint('Could not read the local crop catalog: $cacheReadError');
        }
        if (mounted) {
          setState(() {
            cropMessage =
                'All crop types loaded. Offline saving is temporarily unavailable.';
          });
        }
        return;
      }

      try {
        await db.transaction((transaction) async {
          for (final item in remote) {
            await transaction.insert('crop_catalog', item,
                conflictAlgorithm: ConflictAlgorithm.replace);
          }
        });
      } catch (error) {
        if (kDebugMode) {
          debugPrint('Could not save the local crop catalog: $error');
        }
        if (mounted) {
          setState(() {
            cropMessage =
                'All crop types loaded. Offline saving is temporarily unavailable.';
          });
        }
      }
    } finally {
      if (mounted) setState(() => loadingCrops = false);
    }
  }

  Future<void> captureLocation() async {
    setState(() {
      locating = true;
      locationError = null;
    });
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception(
            'Turn on location services to capture farm coordinates.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission was not granted.');
      }
      position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 12)));
    } catch (error) {
      locationError = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => locating = false);
    }
  }

  Future<void> chooseDate() async {
    final date = await showDatePicker(
        context: context,
        initialDate: plantingDate,
        firstDate: DateTime(2020),
        lastDate: DateTime.now().add(const Duration(days: 30)));
    if (date != null) setState(() => plantingDate = date);
  }

  Future<void> save(String status) async {
    if (!formKey.currentState!.validate()) return;
    setState(() => saving = true);
    final report = <String, Object?>{
      'id': const Uuid().v4(),
      'farmer_name': farmer.text.trim(),
      'barangay_name': barangay,
      'crop_name': crop,
      'area_ha': double.parse(area.text),
      'maturity_days': maturityDays,
      'planting_date': DateFormat('yyyy-MM-dd').format(plantingDate),
      'planting_method': method,
      'latitude': position?.latitude,
      'longitude': position?.longitude,
      'status': status,
      'sync_state': status == 'draft' ? 'local' : 'queued',
      'created_at': DateTime.now().toIso8601String(),
    };
    if (mounted) Navigator.of(context).pop(report);
  }

  @override
  void dispose() {
    farmer.dispose();
    area.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Farm data collection')),
        body: Form(
            key: formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                const Text('Farm visit details',
                    style: TextStyle(
                        color: inkColor,
                        fontSize: 24,
                        height: 1.2,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 5),
                const Text('Fields marked with * are required.',
                    style: TextStyle(color: mutedColor, fontSize: 13)),
                const SizedBox(height: 19),
                _PickerField(
                  label: 'Barangay *',
                  value: barangay,
                  icon: Icons.location_city_outlined,
                  options: barangays,
                  searchHint: 'Search barangays',
                  onSelected: (value) => setState(() => barangay = value),
                ),
                const SizedBox(height: 13),
                TextFormField(
                    controller: farmer,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                        labelText: 'Farmer name *',
                        prefixIcon: Icon(Icons.person_outline)),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter the farmer name'
                        : null),
                const SizedBox(height: 13),
                _PickerField(
                  key: ValueKey(crop),
                  label: 'Crop type *',
                  value: crop,
                  icon: Icons.grass_outlined,
                  enabled: !loadingCrops,
                  options: cropCatalog
                      .map((item) => readString(item['name']) ?? '')
                      .where((name) => name.isNotEmpty)
                      .toList(),
                  searchHint: 'Search crop types',
                  optionSubtitle: (name) {
                    final item = cropCatalog.firstWhere(
                      (item) => readString(item['name']) == name,
                    );
                    final maturity = readInt(item['maturity_days']);
                    final yield = readNum(item['average_yield_kg_ha']);
                    return [
                      if (maturity != null) '$maturity days',
                      if (yield != null)
                        '${NumberFormat('#,##0').format(yield)} kg/ha',
                    ].join(' · ');
                  },
                  onSelected: (value) => setState(() => crop = value),
                ),
                if (loadingCrops)
                  Semantics(
                    liveRegion: true,
                    label: 'Loading crop types',
                    child: const LinearProgressIndicator(minHeight: 3),
                  ),
                if (cropMessage != null)
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: cropMessageIsWarning
                            ? warningSurfaceColor
                            : errorSurfaceColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: cropMessageIsWarning
                              ? const Color(0xFFE9D9B6)
                              : const Color(0xFFF1D8D5),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            cropMessageIsWarning
                                ? Icons.cloud_off_outlined
                                : Icons.error_outline,
                            color: cropMessageIsWarning
                                ? warningColor
                                : errorColor,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              cropMessage!,
                              style: TextStyle(
                                color: cropMessageIsWarning
                                    ? warningColor
                                    : errorColor,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 13),
                TextFormField(
                  controller: area,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                      labelText: 'Planted area (hectares) *', suffixText: 'ha'),
                  onChanged: (_) => setState(() {}),
                  validator: (value) {
                    final parsed = double.tryParse(value ?? '');
                    return parsed == null || parsed <= 0
                        ? 'Enter an area greater than 0'
                        : null;
                  },
                ),
                const SizedBox(height: 13),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: chooseDate,
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text(
                      'Planting date · ${DateFormat('MMM d, yyyy').format(plantingDate)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(height: 13),
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Planting method *',
                    style: TextStyle(
                      color: inkColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: _PlantingMethodOption(
                        title: 'Direct Seeding',
                        subtitle: 'Seed in the field',
                        icon: Icons.grain,
                        selected: method == 'Direct Seeding',
                        onTap: () => setState(() => method = 'Direct Seeding'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _PlantingMethodOption(
                        title: 'Transplanting',
                        subtitle: 'Move young seedlings',
                        icon: Icons.energy_savings_leaf_outlined,
                        selected: method == 'Transplanting',
                        onTap: () => setState(() => method = 'Transplanting'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: locating ? null : captureLocation,
                    icon: Icon(position == null
                        ? Icons.my_location
                        : Icons.location_on_outlined),
                    label: Flexible(
                      child: Text(
                        locating
                            ? 'Getting GPS location…'
                            : position == null
                                ? 'Capture farm GPS location'
                                : 'GPS captured · ${position!.latitude.toStringAsFixed(5)}, ${position!.longitude.toStringAsFixed(5)}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
                if (locationError != null)
                  Semantics(
                    liveRegion: true,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(locationError!,
                          style: const TextStyle(
                              color: warningColor, fontSize: 13)),
                    ),
                  ),
                const SizedBox(height: 16),
                Container(
                  decoration: BoxDecoration(
                    color: softGreenColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: outlineColor),
                  ),
                  padding: const EdgeInsets.all(15),
                  child: Column(children: [
                    _CalculationLine(
                        label: 'Expected harvest',
                        value: '${NumberFormat('#,##0').format(expectedKg)} kg',
                        hint:
                            '${area.text.isEmpty ? '0' : area.text} ha × ${NumberFormat('#,##0').format(averageYield)} kg/ha'),
                    const Divider(height: 22),
                    _CalculationLine(
                        label: 'Estimated harvest date',
                        value: DateFormat('MMM d, yyyy').format(harvestDate),
                        hint: '$maturityDays days after planting'),
                  ]),
                ),
                const SizedBox(height: 20),
                Row(children: [
                  Expanded(
                      child: OutlinedButton(
                          onPressed: saving ? null : () => save('draft'),
                          child: const Text('Save draft'))),
                  const SizedBox(width: 10),
                  Expanded(
                      child: FilledButton.icon(
                          onPressed: saving ? null : () => save('submitted'),
                          icon: const Icon(Icons.send_outlined),
                          label: const Text('Submit report'))),
                ]),
              ],
            )),
      );
}

class _PickerField extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final List<String> options;
  final String searchHint;
  final bool enabled;
  final String? Function(String value)? optionSubtitle;
  final ValueChanged<String> onSelected;

  const _PickerField({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.options,
    required this.searchHint,
    this.enabled = true,
    required this.onSelected,
    this.optionSubtitle,
  });

  Future<void> _openPicker(BuildContext context) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _PickerSheet(
        label: label,
        value: value,
        options: options,
        searchHint: searchHint,
        optionSubtitle: optionSubtitle,
      ),
    );
    if (selected != null && context.mounted) onSelected(selected);
  }

  @override
  Widget build(BuildContext context) => Material(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: enabled ? () => _openPicker(context) : null,
          child: Container(
            constraints: const BoxConstraints(minHeight: 72),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: outlineColor),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: softGreenColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: green, size: 21),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          color: mutedColor,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: inkColor,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.expand_more, color: mutedColor),
              ],
            ),
          ),
        ),
      );
}

class _PickerSheet extends StatefulWidget {
  final String label;
  final String value;
  final List<String> options;
  final String searchHint;
  final String? Function(String value)? optionSubtitle;

  const _PickerSheet({
    required this.label,
    required this.value,
    required this.options,
    required this.searchHint,
    this.optionSubtitle,
  });

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  final search = TextEditingController();

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = widget.options
        .where((option) =>
            option.toLowerCase().contains(search.text.trim().toLowerCase()))
        .toList();

    return FractionallySizedBox(
      heightFactor: 0.86,
      child: Container(
        decoration: const BoxDecoration(
          color: canvasColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD8E1D8),
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 17, 12, 14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Choose ${widget.label.replaceAll(' *', '').toLowerCase()}',
                            style: const TextStyle(
                              color: inkColor,
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${widget.options.length} options available',
                            style: const TextStyle(
                              color: mutedColor,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: search,
                  onChanged: (_) => setState(() {}),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: widget.searchHint,
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: search.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            onPressed: () {
                              search.clear();
                              setState(() {});
                            },
                            icon: const Icon(Icons.close),
                          ),
                    filled: true,
                    fillColor: surfaceColor,
                  ),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? const Center(
                        child: Text(
                          'No matching options',
                          style: TextStyle(color: mutedColor, fontSize: 14),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 4),
                        itemBuilder: (context, index) {
                          final option = filtered[index];
                          final selected = option == widget.value;
                          final subtitle = widget.optionSubtitle?.call(option);
                          return Material(
                            color: selected ? softGreenColor : surfaceColor,
                            borderRadius: BorderRadius.circular(14),
                            child: ListTile(
                              minVerticalPadding: 12,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                                side: BorderSide(
                                  color: selected
                                      ? const Color(0xFFB7D5B8)
                                      : outlineColor,
                                ),
                              ),
                              title: Text(
                                option,
                                style: TextStyle(
                                  fontWeight: selected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  fontSize: 16,
                                  color: inkColor,
                                ),
                              ),
                              subtitleTextStyle: const TextStyle(
                                color: mutedColor,
                                fontSize: 13,
                              ),
                              subtitle: subtitle == null || subtitle.isEmpty
                                  ? null
                                  : Text(subtitle),
                              trailing: selected
                                  ? const Icon(Icons.check_circle, color: green)
                                  : null,
                              onTap: () => Navigator.pop(context, option),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlantingMethodOption extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _PlantingMethodOption({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? softGreenColor : surfaceColor,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 112),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? const Color(0xFF91BD94) : outlineColor,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, color: green, size: 20),
                    const Spacer(),
                    Icon(
                      selected
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                      color: selected ? green : const Color(0xFFB0BBB1),
                      size: 19,
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: inkColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: mutedColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();
  @override
  Widget build(BuildContext context) => Image.asset(
        'assets/agricast-logo.png',
        width: 160,
        height: 32,
        fit: BoxFit.contain,
        semanticLabel: 'AgriCast',
      );
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _SummaryCard(
      {required this.label, required this.value, required this.icon});
  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 82),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: outlineColor),
        ),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: softGreenColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: green, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: mutedColor,
                      fontWeight: FontWeight.w600,
                    )),
                const SizedBox(height: 2),
                Text(value,
                    style: const TextStyle(
                      color: inkColor,
                      fontSize: 24,
                      height: 1.1,
                      fontWeight: FontWeight.w800,
                    )),
              ],
            ),
          ),
        ]),
      );
}

class _ReportTile extends StatelessWidget {
  final Map<String, Object?> report;
  const _ReportTile({required this.report});
  @override
  Widget build(BuildContext context) {
    final synced = report['sync_state'] == 'synced';
    final isDraft = report['status'] == 'draft';
    final cropName = readString(report['crop_name']) ?? '';
    final maturityDays = readInt(report['maturity_days']) ??
        crops[cropName]?['maturity']?.toInt() ??
        0;
    final plantingDate = readString(report['planting_date']);
    final harvest = (plantingDate == null || plantingDate.isEmpty)
        ? DateTime.now()
        : DateTime.parse(plantingDate).add(Duration(days: maturityDays));
    return Card(
      color: surfaceColor,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: outlineColor)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
            backgroundColor: softGreenColor,
            child: const Icon(Icons.grass, color: green)),
        title: Text('${report['crop_name']} · ${report['barangay_name']}',
            style: const TextStyle(
                color: inkColor, fontSize: 15, fontWeight: FontWeight.w700)),
        subtitle: Text(
          '${report['farmer_name']} · Harvest ${DateFormat('MMM d').format(harvest)}\n${report['area_ha']} ha · ${report['status']}\n${isDraft ? 'Saved on this device' : synced ? 'Synced' : 'Waiting to sync'}',
          style: const TextStyle(height: 1.5, fontSize: 12, color: mutedColor),
        ),
        trailing: Tooltip(
          message: isDraft
              ? 'Draft saved on this device'
              : synced
                  ? 'Report synced'
                  : 'Report waiting to sync',
          child: Icon(
            isDraft
                ? Icons.edit_note_outlined
                : synced
                    ? Icons.cloud_done_outlined
                    : Icons.cloud_upload_outlined,
            size: 22,
            color: isDraft
                ? mutedColor
                : synced
                    ? green
                    : warningColor,
          ),
        ),
        isThreeLine: true,
      ),
    );
  }
}

class _CalculationLine extends StatelessWidget {
  final String label;
  final String value;
  final String hint;
  const _CalculationLine(
      {required this.label, required this.value, required this.hint});
  @override
  Widget build(BuildContext context) =>
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: const TextStyle(
                  color: inkColor, fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(hint, style: const TextStyle(fontSize: 12, color: mutedColor)),
        ]),
        const SizedBox(width: 8),
        Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                style: const TextStyle(
                    color: green, fontSize: 15, fontWeight: FontWeight.w800))),
      ]);
}

class _EmptyReports extends StatelessWidget {
  const _EmptyReports();
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(children: const [
          Icon(Icons.agriculture_outlined, size: 38, color: mutedColor),
          SizedBox(height: 10),
          Text('No farm reports yet',
              style: TextStyle(
                  color: inkColor, fontSize: 16, fontWeight: FontWeight.w700)),
          SizedBox(height: 4),
          Text('Tap “New farm report” to record a visit.',
              style: TextStyle(fontSize: 14, color: mutedColor)),
        ]),
      );
}
