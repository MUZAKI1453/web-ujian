import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateStudentPassword, normalizeStudentPassword, openPassword, passwordKey, proctorAccessOpen, sealPassword } from '../src/routes/studentPassword';

test('generated student passwords are six readable characters and never numeric like a NIS', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 500; index++) {
        const value = generateStudentPassword();
        assert.match(value, /^[A-HJKMNP-Z2-9]{6}$/);
        assert.match(value, /[A-Z]/);
        seen.add(value);
    }
    assert.ok(seen.size > 490);
});

test('student input is matched without regard to case or surrounding spaces', () => {
    assert.equal(normalizeStudentPassword(' k7m4px '), 'K7M4PX');
});

test('sealed passwords open only with the same server key', () => {
    const key = passwordKey('rahasia-server-a');
    const sealed = sealPassword('K7M4PX', key);
    assert.notEqual(sealed, sealPassword('K7M4PX', key));
    assert.ok(!sealed.includes('K7M4PX'));
    assert.equal(openPassword(sealed, key), 'K7M4PX');
    assert.equal(openPassword(sealed, passwordKey('rahasia-server-b')), null);
    assert.equal(openPassword(sealed.slice(0, -2) + 'AA', key), null);
    for (const input of [null, undefined, '', 'bukan-data']) assert.equal(openPassword(input, key), null);
});

test('proctors reach student passwords from one hour before a session until it ends', () => {
    const start = new Date('2026-11-12T01:00:00.000Z');
    const sessions = [{ waktuMulai: start, waktuSelesai: new Date(+start + 5400000) }];
    assert.equal(proctorAccessOpen(sessions, +start - 3600001), false);
    assert.equal(proctorAccessOpen(sessions, +start - 3600000), true);
    assert.equal(proctorAccessOpen(sessions, +start + 5400000), true);
    assert.equal(proctorAccessOpen(sessions, +start + 5400001), false);
    const makeup = { waktuMulai: new Date(+start + 86400000), waktuSelesai: new Date(+start + 90000000) };
    assert.equal(proctorAccessOpen([...sessions, makeup], +start + 86400000), true);
    assert.equal(proctorAccessOpen([], +start), false);
});
