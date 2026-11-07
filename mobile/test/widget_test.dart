import 'package:flutter_test/flutter_test.dart';

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
        currentUri: Uri.parse('https://field.example.gov.ph/'),
      ),
      'https://field.example.gov.ph:4000/api',
    );
    expect(
      resolveApiBaseUrl(
        isWeb: false,
        currentUri: Uri.parse('file:///app'),
      ),
      'http://10.0.2.2:4000/api',
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
