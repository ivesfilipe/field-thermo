const path = require('path');
const dotenv = (() => { try { return require('dotenv'); } catch { return { config: () => {} }; } })();

dotenv.config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: process.env.JWT_SECRET || 'field20_secret_desenvolvimento_local',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'data', 'field.db'),
  UPLOADS_DIR: process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'),
  TOKEN_EXPIRES_IN: process.env.TOKEN_EXPIRES_IN || '365d',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  GOOGLE_REVIEW_URL: process.env.GOOGLE_REVIEW_URL || 'https://search.google.com/local/writereview?placeid=ChIJZe9bdx-VpgAR3EwV7DUft7A&source=g.page.m._&utm_source=gbp&laa=merchant-review-solicitation',
  SMTP_HOST: process.env.SMTP_HOST || 'mail.medicalthermo.com',
  SMTP_PORT: Number(process.env.SMTP_PORT || 465),
  SMTP_USER: process.env.SMTP_USER || 'thermocontrol@medicalthermo.com',
  SMTP_PASS: process.env.SMTP_PASS || 'Acesso@thermo26',
  SMTP_FROM: process.env.SMTP_FROM || 'thermocontrol@medicalthermo.com',
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'MedicalThermo Herzog'
};
