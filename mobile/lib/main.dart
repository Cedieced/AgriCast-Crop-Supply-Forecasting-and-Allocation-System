import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
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
String resolveApiBaseUrl({
  required bool isWeb,
  required Uri currentUri,
  String override = '',
}) {
  if (override.isNotEmpty) return override;
  if (isWeb) {
    final scheme = currentUri.scheme == 'https' ? 'https' : 'http';
    return Uri(
            scheme: scheme,
            host: currentUri.host.isEmpty ? 'localhost' : currentUri.host,
            port: 4000,
            path: '/api')
        .toString();
  }
  return 'http://10.0.2.2:4000/api';
}

String get apiBaseUrl => resolveApiBaseUrl(
      isWeb: kIsWeb,
      currentUri: Uri.base,
      override: configuredApiBaseUrl,
    );
const green = Color(0xFF34764A);
const crops = <String, Map<String, num>>{
  'Rice': {'maturity': 120, 'yield': 4500},
  'Corn': {'maturity': 110, 'yield': 4200},
  'Mongo': {'maturity': 90, 'yield': 950},
  'Tomato': {'maturity': 75, 'yield': 18000},
};
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

Future<Database> openLocalDatabase() async {
  final String path;
  if (kIsWeb) {
    databaseFactory = databaseFactoryFfiWeb;
    path = 'agriflow_field.db';
  } else {
    path = p.join(await getDatabasesPath(), 'agriflow.db');
  }
  return openDatabase(path, version: 1, onCreate: (db, _) async {
    await db.execute('''
      CREATE TABLE reports (
        id TEXT PRIMARY KEY, farmer_name TEXT NOT NULL, barangay_name TEXT NOT NULL,
        crop_name TEXT NOT NULL, area_ha REAL NOT NULL, planting_date TEXT NOT NULL,
        planting_method TEXT NOT NULL, latitude REAL, longitude REAL, status TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL
      )
    ''');
  });
}

class FieldApi {
  final http.Client client;
  final FlutterSecureStorage storage;
  FieldApi(this.client, this.storage);

  Future<String> login(String email, String password) async {
    late final http.Response response;
    try {
      response = await client
          .post(
            Uri.parse('$apiBaseUrl/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 10));
    } on TimeoutException {
      throw Exception(
          'Login timed out. Check that the API is running at $apiBaseUrl.');
    } on http.ClientException {
      throw Exception(
          'Cannot reach the login API at $apiBaseUrl. Start the API and PostgreSQL, then try again.');
    }
    if (response.statusCode != 200) {
      final body = jsonDecode(response.body);
      throw Exception(body is Map<String, dynamic>
          ? body['error'] ?? 'Sign in failed'
          : 'Sign in failed');
    }
    final result = jsonDecode(response.body);
    if (result['user']?['role'] != 'field_officer') {
      throw Exception('This application is for Field Officer accounts.');
    }
    final token = result['token'] as String;
    await storage.write(key: 'jwt', value: token);
    return token;
  }

  Future<void> sync(Map<String, Object?> report) async {
    final token = await storage.read(key: 'jwt');
    if (token == null) throw Exception('Please sign in again before syncing.');
    final response = await client.post(
      Uri.parse('$apiBaseUrl/reports'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token'
      },
      body: jsonEncode({
        'clientReportId': report['id'],
        'barangayName': report['barangay_name'],
        'cropName': report['crop_name'],
        'farmerName': report['farmer_name'],
        'areaHa': report['area_ha'],
        'plantingDate': report['planting_date'],
        'plantingMethod': report['planting_method'],
        'latitude': report['latitude'],
        'longitude': report['longitude'],
        'status': report['status'],
      }),
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception(
          jsonDecode(response.body)['error'] ?? 'Report sync failed');
    }
  }
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
  bool checkingSession = true;

  @override
  void initState() {
    super.initState();
    storage.read(key: 'jwt').then((value) {
      if (mounted) {
        setState(() {
          token = value;
          checkingSession = false;
        });
      }
    });
  }

  void signedIn(String value) => setState(() {
        token = value;
      });
  Future<void> signOut() async {
    await storage.delete(key: 'jwt');
    if (mounted) setState(() => token = null);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'AgriCast Field',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
              seedColor: green, surface: const Color(0xFFF7F9F5)),
          scaffoldBackgroundColor: const Color(0xFFF7F9F5),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFE2E9E0))),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFE2E9E0))),
          ),
        ),
        home: checkingSession
            ? const Scaffold(body: Center(child: CircularProgressIndicator()))
            : token == null
                ? LoginPage(api: api, onSignedIn: signedIn)
                : FieldHome(database: database, api: api, onSignOut: signOut),
      );
}

class LoginPage extends StatefulWidget {
  final FieldApi api;
  final ValueChanged<String> onSignedIn;
  const LoginPage({super.key, required this.api, required this.onSignedIn});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email =
      TextEditingController(text: 'field_officer@boac.gov.ph');
  final password = TextEditingController(text: 'BoacDemo123!');
  bool busy = false;
  String? error;

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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _BrandMark(),
                  const SizedBox(height: 34),
                  const Text('Field officer sign in',
                      style:
                          TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  const Text(
                      'Sign in while connected. Your active session lets you record farm visits offline.',
                      style: TextStyle(color: Color(0xFF748177), height: 1.5)),
                  const SizedBox(height: 8),
                  const Text(
                      'Demo account: field_officer@boac.gov.ph · BoacDemo123!',
                      style: TextStyle(fontSize: 11, color: Color(0xFF748177)),
                  ),
                  const SizedBox(height: 24),
                  TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration:
                          const InputDecoration(labelText: 'Email address')),
                  const SizedBox(height: 14),
                  TextField(
                      controller: password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password')),
                  if (error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(error!,
                            style: const TextStyle(color: Colors.red))),
                  const SizedBox(height: 20),
                  SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton(
                          onPressed: busy ? null : submit,
                          child: Text(busy ? 'Signing in…' : 'Sign in'))),
                  const SizedBox(height: 18),
                  const Center(
                      child: Text(
                          'Municipal Agriculture Office · Boac, Marinduque',
                          style: TextStyle(
                              fontSize: 11, color: Color(0xFF859087)))),
                ],
              )),
        ))),
      );
}

class FieldHome extends StatefulWidget {
  final Future<Database> database;
  final FieldApi api;
  final Future<void> Function() onSignOut;
  const FieldHome(
      {super.key,
      required this.database,
      required this.api,
      required this.onSignOut});
  @override
  State<FieldHome> createState() => _FieldHomeState();
}

class _FieldHomeState extends State<FieldHome> {
  StreamSubscription<List<ConnectivityResult>>? subscription;
  List<Map<String, Object?>> reports = [];
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
      if (connected) syncQueued();
    });
    Connectivity().checkConnectivity().then((results) {
      if (mounted) {
        setState(() =>
            online = results.any((item) => item != ConnectivityResult.none));
      }
    });
  }

  @override
  void dispose() {
    subscription?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    final db = await widget.database;
    final rows = await db.query('reports', orderBy: 'created_at DESC');
    if (mounted) setState(() => reports = rows);
  }

  Future<void> saveReport(Map<String, Object?> report) async {
    final db = await widget.database;
    await db.insert('reports', report,
        conflictAlgorithm: ConflictAlgorithm.replace);
    await refresh();
    if (online && report['status'] == 'submitted') await syncQueued();
  }

  Future<void> syncQueued() async {
    if (syncing) return;
    setState(() => syncing = true);
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
        syncError = error.toString().replaceFirst('Exception: ', '');
        break;
      }
    }
    if (mounted) {
      setState(() => syncing = false);
      await refresh();
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
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 100),
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: online
                        ? const Color(0xFFEAF4E9)
                        : const Color(0xFFFFF3E2),
                    borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  Icon(
                      online
                          ? Icons.cloud_done_outlined
                          : Icons.cloud_off_outlined,
                      color: online ? green : Colors.orange.shade800),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(online ? 'You’re online' : 'Offline mode',
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        Text(
                            syncError ??
                                (syncing
                                    ? 'Syncing field reports…'
                                    : '$queued report${queued == 1 ? '' : 's'} waiting to sync'),
                            style: TextStyle(
                                fontSize: 12,
                                color: syncError == null
                                    ? const Color(0xFF748177)
                                    : Colors.red.shade700)),
                      ])),
                  if (online && queued > 0)
                    IconButton(
                        onPressed: syncQueued,
                        icon: const Icon(Icons.sync),
                        tooltip: 'Sync now'),
                ]),
              ),
              const SizedBox(height: 22),
              const Text('Good day, Field Officer',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 5),
              const Text(
                  'Capture a farm visit. Your reports are stored securely on this device.',
                  style: TextStyle(color: Color(0xFF748177))),
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
              if (reports.isEmpty)
                const _EmptyReports()
              else
                ...reports.map((report) => _ReportTile(report: report)),
            ],
          )),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final report = await Navigator.of(context).push<Map<String, Object?>>(
            MaterialPageRoute(builder: (_) => const ReportForm()),
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
  const ReportForm({super.key});
  @override
  State<ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<ReportForm> {
  final formKey = GlobalKey<FormState>();
  final farmer = TextEditingController();
  final area = TextEditingController();
  String barangay = barangays[1];
  String crop = 'Rice';
  String method = 'Transplanting';
  DateTime plantingDate = DateTime.now();
  Position? position;
  bool locating = false;
  bool saving = false;
  String? locationError;

  DateTime get harvestDate =>
      plantingDate.add(Duration(days: crops[crop]!['maturity']!.toInt()));
  double get expectedKg =>
      (double.tryParse(area.text) ?? 0) * crops[crop]!['yield']!.toDouble();

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
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 30),
              children: [
                const Text('Farm visit details',
                    style:
                        TextStyle(fontSize: 21, fontWeight: FontWeight.w800)),
                const SizedBox(height: 5),
                const Text('Fields marked with * are required.',
                    style: TextStyle(color: Color(0xFF748177), fontSize: 12)),
                const SizedBox(height: 19),
                DropdownButtonFormField<String>(
                  initialValue: barangay,
                  decoration: const InputDecoration(labelText: 'Barangay *'),
                  items: barangays
                      .map((name) =>
                          DropdownMenuItem(value: name, child: Text(name)))
                      .toList(),
                  onChanged: (value) => setState(() => barangay = value!),
                ),
                const SizedBox(height: 13),
                TextFormField(
                    controller: farmer,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                        labelText: 'Farmer name *',
                        prefixIcon: Icon(Icons.person_outline)),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Enter the farmer name'
                        : null),
                const SizedBox(height: 13),
                DropdownButtonFormField<String>(
                  initialValue: crop,
                  decoration: const InputDecoration(labelText: 'Crop type *'),
                  items: crops.keys
                      .map((name) =>
                          DropdownMenuItem(value: name, child: Text(name)))
                      .toList(),
                  onChanged: (value) => setState(() => crop = value!),
                ),
                const SizedBox(height: 13),
                TextFormField(
                  controller: area,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
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
                OutlinedButton.icon(
                    onPressed: chooseDate,
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text(
                        'Planting date · ${DateFormat('MMM d, yyyy').format(plantingDate)}')),
                const SizedBox(height: 13),
                DropdownButtonFormField<String>(
                  initialValue: method,
                  decoration:
                      const InputDecoration(labelText: 'Planting method *'),
                  items: const ['Direct Seeding', 'Transplanting']
                      .map((name) =>
                          DropdownMenuItem(value: name, child: Text(name)))
                      .toList(),
                  onChanged: (value) => setState(() => method = value!),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                    onPressed: locating ? null : captureLocation,
                    icon: Icon(position == null
                        ? Icons.my_location
                        : Icons.location_on_outlined),
                    label: Text(locating
                        ? 'Getting GPS location…'
                        : position == null
                            ? 'Capture farm GPS location'
                            : 'GPS captured · ${position!.latitude.toStringAsFixed(5)}, ${position!.longitude.toStringAsFixed(5)}')),
                if (locationError != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(locationError!,
                          style: TextStyle(
                              color: Colors.orange.shade800, fontSize: 11))),
                const SizedBox(height: 16),
                Container(
                  decoration: BoxDecoration(
                      color: const Color(0xFFEAF4E9),
                      borderRadius: BorderRadius.circular(13)),
                  padding: const EdgeInsets.all(15),
                  child: Column(children: [
                    _CalculationLine(
                        label: 'Expected harvest',
                        value: '${NumberFormat('#,##0').format(expectedKg)} kg',
                        hint:
                            '${area.text.isEmpty ? '0' : area.text} ha × ${NumberFormat('#,##0').format(crops[crop]!['yield'])} kg/ha'),
                    const Divider(height: 22),
                    _CalculationLine(
                        label: 'Estimated harvest date',
                        value: DateFormat('MMM d, yyyy').format(harvestDate),
                        hint:
                            '${crops[crop]!['maturity']} days after planting'),
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

class _BrandMark extends StatelessWidget {
  const _BrandMark();
  @override
  Widget build(BuildContext context) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
                color: const Color(0xFFE7F2E7),
                borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.spa_outlined, color: green)),
        const SizedBox(width: 9),
        const Text('AgriCast',
            style: TextStyle(
                fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -1)),
      ]);
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _SummaryCard(
      {required this.label, required this.value, required this.icon});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(13),
            border: Border.all(color: const Color(0xFFE9EDE7))),
        child: Row(children: [
          Icon(icon, color: green),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 9, color: Color(0xFF829087), letterSpacing: .5)),
            Text(value,
                style:
                    const TextStyle(fontSize: 21, fontWeight: FontWeight.w800)),
          ]),
        ]),
      );
}

class _ReportTile extends StatelessWidget {
  final Map<String, Object?> report;
  const _ReportTile({required this.report});
  @override
  Widget build(BuildContext context) {
    final synced = report['sync_state'] == 'synced';
    final harvest = DateTime.parse(report['planting_date'] as String)
        .add(Duration(days: crops[report['crop_name']]!['maturity']!.toInt()));
    return Card(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 9),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(13),
          side: const BorderSide(color: Color(0xFFE9EDE7))),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
            backgroundColor: const Color(0xFFEAF4E9),
            child: const Icon(Icons.grass, color: green)),
        title: Text('${report['crop_name']} · ${report['barangay_name']}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        subtitle: Text(
            '${report['farmer_name']} · Harvest ${DateFormat('MMM d').format(harvest)}\n${report['area_ha']} ha · ${report['status']}',
            style: const TextStyle(height: 1.6, fontSize: 11)),
        trailing: Icon(
            synced ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined,
            size: 19,
            color: synced ? green : Colors.orange.shade700),
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
              style: const TextStyle(fontSize: 11, color: Color(0xFF6D7B70))),
          const SizedBox(height: 4),
          Text(hint,
              style: const TextStyle(fontSize: 10, color: Color(0xFF849087))),
        ]),
        const SizedBox(width: 8),
        Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                style: const TextStyle(
                    fontWeight: FontWeight.w800, color: green))),
      ]);
}

class _EmptyReports extends StatelessWidget {
  const _EmptyReports();
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(children: const [
          Icon(Icons.agriculture_outlined, size: 38, color: Color(0xFF9AAF9C)),
          SizedBox(height: 10),
          Text('No farm reports yet',
              style: TextStyle(fontWeight: FontWeight.w700)),
          SizedBox(height: 4),
          Text('Tap “New farm report” to record a visit.',
              style: TextStyle(fontSize: 12, color: Color(0xFF829087))),
        ]),
      );
}
