const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('./pgService');
const { config } = require('../config');

const BCRYPT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * JWT payload shape depends on role:
 *   company:     { role:'company',     company_id, email, company_name }
 *   super_admin: { role:'super_admin', super_admin_id, email }
 */
function generateToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function generateConfirmationToken() {
  return randomUUID();
}

function generatePasswordResetToken() {
  return randomUUID();
}

function confirmationExpiryDate() {
  const d = new Date();
  d.setHours(d.getHours() + config.confirmationTokenHours);
  return d;
}

function passwordResetExpiryDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + config.passwordResetMinutes);
  return d;
}

async function findCompanyByEmail(email) {
  if (!email) return null;
  return db.getOne(
    'SELECT * FROM companies WHERE email = $1',
    [String(email).trim().toLowerCase()]
  );
}

async function findCompanyById(id) {
  if (!id) return null;
  return db.getOne('SELECT * FROM companies WHERE id = $1', [id]);
}

async function findCompanyByConfirmationToken(token) {
  if (!token) return null;
  return db.getOne(
    'SELECT * FROM companies WHERE confirmation_token = $1',
    [token]
  );
}

async function findCompanyByPasswordResetToken(token) {
  if (!token) return null;
  return db.getOne(
    'SELECT * FROM companies WHERE password_reset_token = $1',
    [token]
  );
}

async function findSuperAdminByEmail(email) {
  if (!email) return null;
  return db.getOne(
    'SELECT * FROM super_admins WHERE email = $1',
    [String(email).trim().toLowerCase()]
  );
}

async function findSuperAdminById(id) {
  if (!id) return null;
  return db.getOne('SELECT * FROM super_admins WHERE id = $1', [id]);
}

async function touchCompanyLogin(companyId) {
  await db.execute(
    'UPDATE companies SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
    [companyId]
  );
}

async function touchSuperAdminLogin(superAdminId) {
  await db.execute(
    'UPDATE super_admins SET last_login_at = NOW() WHERE id = $1',
    [superAdminId]
  );
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateConfirmationToken,
  generatePasswordResetToken,
  confirmationExpiryDate,
  passwordResetExpiryDate,
  findCompanyByEmail,
  findCompanyById,
  findCompanyByConfirmationToken,
  findCompanyByPasswordResetToken,
  findSuperAdminByEmail,
  findSuperAdminById,
  touchCompanyLogin,
  touchSuperAdminLogin,
};
