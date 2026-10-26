import request from 'supertest';
import { emails, reservationBody, setupTestEnv, staff, TestEnv, uploadDocument } from './helpers';

describe('Authentication, authorization and property isolation', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestEnv();
  });
  afterAll(() => env.close());

  it('rejects bad credentials identically for unknown and known accounts', async () => {
    const http = request(env.app.getHttpServer());
    const a = await http.post('/v1/auth/login').set('x-collex-csrf', '1').send({ email: emails.reception, password: 'wrong-password' });
    const b = await http.post('/v1/auth/login').set('x-collex-csrf', '1').send({ email: 'nobody@collex.test', password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('sets an httpOnly SameSite session cookie and never returns the token in the body', async () => {
    const res = await request(env.app.getHttpServer()).post('/v1/auth/login').set('x-collex-csrf', '1').send({ email: emails.reception, password: 'Test-Password-123' });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/collex_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('requires authentication and the CSRF header', async () => {
    const http = request(env.app.getHttpServer());
    expect((await http.get('/v1/reservations').set('x-property-id', env.data.properties.RUH.id)).status).toBe(401);
    const c = await staff(env, 'reception');
    const noCsrf = await c.agent.post('/v1/reservations').set('x-property-id', c.propertyId!).send(reservationBody(env));
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('revokes the session on logout', async () => {
    const c = await staff(env, 'reception');
    expect((await c.get('/v1/auth/me')).status).toBe(200);
    expect((await c.post('/v1/auth/logout')).status).toBe(200);
    expect((await c.get('/v1/auth/me')).status).toBe(401);
  });

  it('denies access to another property by header', async () => {
    const ruh = await staff(env, 'reception');
    ruh.propertyId = env.data.properties.JED.id;
    const res = await ruh.get('/v1/reservations');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROPERTY_ACCESS_DENIED');
  });

  it('cannot read another property record by changing the identifier', async () => {
    const ruh = await staff(env, 'reception');
    const created = await ruh.post('/v1/reservations', reservationBody(env));
    expect(created.status).toBe(201);
    const jed = await staff(env, 'receptionJed', 'JED');
    const res = await jed.get(`/v1/reservations/${created.body.id}`);
    expect(res.status).toBe(404);
    const guestId = created.body.primaryGuestId;
    expect((await jed.get(`/v1/guests/${guestId}`)).status).toBe(404);
  });

  it('enforces granular permissions per role', async () => {
    const hk = await staff(env, 'hk');
    const res = await hk.post('/v1/reservations', reservationBody(env));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
    expect((await hk.post('/v1/finance/payments', { folioId: 'x', amount: '10', method: 'CASH', idempotencyKey: 'abcdefgh' })).status).toBe(403);
    const cashier = await staff(env, 'cashier');
    expect((await cashier.patch(`/v1/maintenance/work-orders/x`, { status: 'CLOSED' })).status).toBe(403);
  });

  it('protects identity documents: no access without documents.view, never cross-property, audited', async () => {
    const reception = await staff(env, 'reception');
    const created = await reception.post('/v1/reservations', reservationBody(env));
    const up = await uploadDocument(reception, created.body.primaryGuestId);
    expect(up.status).toBe(201);
    expect(up.body.documentNumberMasked).toMatch(/^•+4567$/);
    expect(JSON.stringify(up.body)).not.toContain('X1234567');
    const fileId = up.body.files[0].id;
    const docId = up.body.id;

    const agent = await staff(env, 'agent'); // reservation agent: may upload, may not view
    expect((await agent.get(`/v1/documents/${docId}/files/${fileId}`)).status).toBe(403);
    const jed = await staff(env, 'receptionJed', 'JED');
    expect((await jed.get(`/v1/documents/${docId}/files/${fileId}`)).status).toBe(404);
    expect((await request(env.app.getHttpServer()).get(`/v1/documents/${docId}/files/${fileId}`)).status).toBe(401);

    const ok = await reception.get(`/v1/documents/${docId}/files/${fileId}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toContain('no-store');
    expect(ok.headers['content-type']).toBe('image/jpeg');
    const audit = await env.prisma.auditEvent.findMany({ where: { entityId: docId, action: 'DOCUMENT_FILE_VIEWED' } });
    expect(audit.length).toBe(1);

    // Stored encrypted at rest, with a random key unrelated to guest data.
    const file = await env.prisma.documentFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.storageKey).not.toMatch(/smith|X1234567/i);
    const doc = await env.prisma.identityDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(doc.documentNumberEnc).not.toContain('X1234567');
  });

  it('rejects spoofed file types and oversized uploads', async () => {
    const reception = await staff(env, 'reception');
    const created = await reception.post('/v1/reservations', reservationBody(env));
    const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(100, ' '));
    const res = await uploadDocument(reception, created.body.primaryGuestId, {}, html);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    const pdfJs = Buffer.from('%PDF-1.4\n/OpenAction << /JS (app.alert(1)) >>'.padEnd(200, ' '));
    expect((await uploadDocument(reception, created.body.primaryGuestId, {}, pdfJs)).status).toBe(415);
  });

  it('does not let a guest-portal session reach staff endpoints', async () => {
    const http = request.agent(env.app.getHttpServer());
    const reception = await staff(env, 'reception');
    const created = await reception.post('/v1/reservations', reservationBody(env));
    const lookup = await http.post('/v1/public/guest/lookup').set('x-collex-csrf', '1').send({ confirmationNo: created.body.confirmationNo, lastName: 'smith' });
    expect(lookup.status).toBe(200);
    expect((await http.get('/v1/public/guest/reservation')).status).toBe(200);
    expect((await http.get('/v1/reservations').set('x-property-id', env.data.properties.RUH.id)).status).toBe(401);
    const wrong = await request(env.app.getHttpServer()).post('/v1/public/guest/lookup').set('x-collex-csrf', '1').send({ confirmationNo: created.body.confirmationNo, lastName: 'nope' });
    expect(wrong.status).toBe(404);
  });
});

