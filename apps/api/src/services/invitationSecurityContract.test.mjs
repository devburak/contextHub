import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serviceSource = readFileSync(fileURLToPath(new URL('./authService.js', import.meta.url)), 'utf8');
const routeSource = readFileSync(fileURLToPath(new URL('../routes/users.js', import.meta.url)), 'utf8');
const adminSource = readFileSync(fileURLToPath(new URL('../../../admin/src/pages/users/CreateUser.jsx', import.meta.url)), 'utf8');

describe('invitation security contract', () => {
  it('does not expose a global email existence endpoint', () => {
    expect(routeSource).not.toContain('/users/check-email');
    expect(adminSource).not.toContain('checkEmail');
    expect(adminSource).not.toContain('userExists');
  });

  it('does not accept or render an administrator-defined password', () => {
    expect(adminSource).not.toMatch(/type=["']password["']/);
    expect(routeSource).not.toContain('providedPassword');
    expect(serviceSource).not.toContain('tempPassword');
    expect(serviceSource).toContain("crypto.randomBytes(32).toString('base64url')");
  });

  it('uses one privacy-preserving accepted response for invitation requests', () => {
    expect(routeSource.match(/Invitation request accepted/g)?.length).toBeGreaterThanOrEqual(2);
    expect(routeSource).not.toContain('Invitation sent to existing user');
  });

  it('does not treat an existing-user invitation token as a global magic login', () => {
    expect(serviceSource).toContain('InvitationAuthenticationRequired');
    expect(serviceSource).toContain('InvitationAccountMismatch');
    expect(serviceSource).toContain('request.user._id.toString() !== user._id.toString()');
  });
});
