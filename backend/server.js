const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');
const { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const normalizeEnv = (value) => (typeof value === 'string' ? value.trim() : '');
const stripWrappingQuotes = (value) => String(value || '').replace(/^['"]|['"]$/g, '');
const parseCloudinaryConfig = () => {
  const cloudinaryUrl = normalizeEnv(process.env.CLOUDINARY_URL);
  if (cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const cloudName = normalizeEnv(parsed.hostname);
      const apiKey = normalizeEnv(decodeURIComponent(parsed.username));
      const apiSecret = normalizeEnv(decodeURIComponent(parsed.password));
      if (cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret };
      }
    } catch (err) {
      console.warn('Invalid CLOUDINARY_URL. Falling back to explicit Cloudinary env vars.', err.message);
    }
  }

  const cloudName = normalizeEnv(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeEnv(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeEnv(process.env.CLOUDINARY_API_SECRET);
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }
  return null;
};

const dbHost = normalizeEnv(process.env.DB_HOST);
const dbPort = Number.parseInt(normalizeEnv(process.env.DB_PORT), 10);
const databaseUrl = normalizeEnv(process.env.DATABASE_URL);
const dbCaPath = stripWrappingQuotes(normalizeEnv(process.env.DB_CA_PATH));
const sslDefault = dbHost.includes('tidbcloud.com') ? 'true' : 'false';
const dbSslEnabled = String(process.env.DB_SSL || sslDefault).toLowerCase() === 'true';

const dbConfig = databaseUrl
  ? {
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: Number.parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      queueLimit: 0,
    }
  : {
      host: dbHost,
      port: Number.isFinite(dbPort) ? dbPort : 3306,
      user: normalizeEnv(process.env.DB_USER),
      password: normalizeEnv(process.env.DB_PASSWORD),
      database: normalizeEnv(process.env.DB_NAME),
      waitForConnections: true,
      connectionLimit: Number.parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      queueLimit: 0,
    };

if (dbSslEnabled) {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  };
  if (dbCaPath) {
    try {
      dbConfig.ssl.ca = fsSync.readFileSync(dbCaPath, 'utf8');
    } catch (err) {
      console.warn(`Could not read DB_CA_PATH at "${dbCaPath}". Falling back to system CA store.`, err.message);
    }
  }
}

const pool = mysql.createPool(dbConfig);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETHIOPIAN_PHONE_REGEX = /^(?:\+251|0)?9\d{8}$/;
const OTP_TTL_MINUTES = 5;
const SESSION_TTL_DAYS = 30;
const DEFAULT_SELLER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const CHAPA_API_BASE_URL = process.env.CHAPA_API_BASE_URL || 'https://api.chapa.co/v1';
const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY || '';
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROMO_BANNER_SETTING_KEY = 'PROMO_BANNER_IMAGE';
const DEV_ALLOW_SELF_ADMIN = String(process.env.DEV_ALLOW_SELF_ADMIN || 'true').toLowerCase() === 'true';
const ALLOWED_IMAGE_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const CLOUDINARY_CONFIG = parseCloudinaryConfig();

pool
  .getConnection()
  .then((connection) => {
    console.log('Connected to the MySQL database.');
    connection.release();
  })
  .catch((err) => {
    console.error('Error connecting to the database:', err);
  });

ensureAuthTables().catch((err) => {
  console.error('Error ensuring auth tables:', err);
});

ensureVariantTrackingSchema().catch((err) => {
  console.error('Error ensuring variant tracking schema:', err);
});

const queryHandler = async (res, query, params = []) => {
  try {
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

const hashValue = (value) => createHash('sha256').update(String(value)).digest('hex');
const toPublicImageUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('/uploads/')) {
    return `${BACKEND_BASE_URL}${normalized}`;
  }
  return normalized;
};

const parseImageArray = (value) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => toPublicImageUrl(item.trim()));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => toPublicImageUrl(item.trim()));
      }
    } catch {
      return [];
    }
  }
  return [];
};

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeVariantGroupsInput = (input, fallbackPrice, fallbackDiscountPrice, fallbackStock) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((group) => {
      const type = String(group?.type || '').trim();
      const values = Array.isArray(group?.values) ? group.values : [];
      if (!type || !values.length) return null;

      const normalizedValues = values
        .map((valueRow) => {
          const value = String(valueRow?.value || valueRow?.title || '').trim();
          if (!value) return null;
          const priceRaw = Number(valueRow?.price);
          const discountRaw = valueRow?.discountPrice;
          const stockRaw = Number(valueRow?.stock);
          const price = Number.isFinite(priceRaw) ? priceRaw : Number(fallbackPrice || 0);
          const discountPrice =
            discountRaw === '' || discountRaw === null || discountRaw === undefined
              ? (fallbackDiscountPrice ?? null)
              : Number(discountRaw);
          const stock = Number.isFinite(stockRaw) ? stockRaw : Number(fallbackStock || 0);

          return {
            value,
            title: String(valueRow?.title || `${type}: ${value}`).trim(),
            sku: String(valueRow?.sku || '').trim(),
            price,
            discountPrice: Number.isFinite(discountPrice) ? discountPrice : null,
            stock,
            images: Array.isArray(valueRow?.images) ? valueRow.images.filter((img) => typeof img === 'string') : [],
          };
        })
        .filter(Boolean);

      if (!normalizedValues.length) return null;
      return {
        type,
        values: normalizedValues,
      };
    })
    .filter(Boolean);
};

const groupVariantRows = (variantRows) => {
  const byProductId = new Map();
  for (const row of variantRows) {
    const productId = String(row.productId || '');
    if (!productId) continue;
    const attributes = parseJsonObject(row.attributes) || {};
    const variant = {
      id: String(row.id || ''),
      sku: String(row.sku || ''),
      title: String(row.title || ''),
      price: Number(row.price || 0),
      discountPrice: row.discount_price === null || row.discount_price === undefined ? null : Number(row.discount_price),
      stock: Number(row.stock || 0),
      attributes,
      images: parseImageArray(row.images),
    };
    const list = byProductId.get(productId) || [];
    list.push(variant);
    byProductId.set(productId, list);
  }

  const groupedByType = new Map();
  for (const [productId, variants] of byProductId.entries()) {
    const groupsMap = new Map();
    for (const variant of variants) {
      const type = String(variant.attributes?.type || 'Variant').trim() || 'Variant';
      const value = String(variant.attributes?.value || variant.title || variant.sku || '').trim();
      if (!value) continue;
      const values = groupsMap.get(type) || [];
      values.push({
        id: variant.id,
        value,
        title: variant.title || `${type}: ${value}`,
        sku: variant.sku,
        price: variant.price,
        discountPrice: variant.discountPrice,
        stock: variant.stock,
        images: variant.images,
      });
      groupsMap.set(type, values);
    }
    groupedByType.set(
      productId,
      Array.from(groupsMap.entries()).map(([type, values]) => ({ type, values })),
    );
  }

  return { byProductId, groupedByType };
};

const fetchProductVariantsByProductIds = async (productIds) => {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return { byProductId: new Map(), groupedByType: new Map() };

  const placeholders = ids.map(() => 'UUID_TO_BIN(?)').join(',');
  const [variantRows] = await pool.execute(
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(product_id) AS productId,
      sku,
      title,
      price,
      discount_price,
      stock,
      attributes,
      images
    FROM ProductVariant
    WHERE product_id IN (${placeholders})
    `,
    ids,
  );
  return groupVariantRows(variantRows);
};

const replaceProductVariants = async ({
  productId,
  variantGroups,
  fallbackPrice,
  fallbackDiscountPrice,
  fallbackStock,
}) => {
  const normalized = normalizeVariantGroupsInput(
    variantGroups,
    fallbackPrice,
    fallbackDiscountPrice,
    fallbackStock,
  );

  await pool.execute(`DELETE FROM ProductVariant WHERE product_id = UUID_TO_BIN(?)`, [productId]);
  if (!normalized.length) return;

  for (const group of normalized) {
    for (const valueRow of group.values) {
      const resolvedImages = await resolveImagesInput(valueRow.images, 'products');
      const variantId = randomUUID();
      const attributes = {
        type: group.type,
        value: valueRow.value,
      };
      await pool.execute(
        `
        INSERT INTO ProductVariant (
          id, product_id, sku, title, price, discount_price, stock, attributes, images
        )
        VALUES (
          UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?
        )
        `,
        [
          variantId,
          productId,
          valueRow.sku || `VAR-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          valueRow.title,
          Number(valueRow.price || 0),
          valueRow.discountPrice === null ? null : Number(valueRow.discountPrice),
          Number(valueRow.stock || 0),
          JSON.stringify(attributes),
          JSON.stringify(resolvedImages),
        ],
      );
    }
  }
};

const saveImageDataUrl = async (dataUrl, folder) => {
  if (!CLOUDINARY_CONFIG) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.');
  }

  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data format');
  }

  const mimeType = String(match[1] || '').toLowerCase();
  const base64Data = String(match[2] || '');
  const extension = ALLOWED_IMAGE_MIME_EXT[mimeType];
  if (!extension) {
    throw new Error('Unsupported image type');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length) {
    throw new Error('Image payload is empty');
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image exceeds 5MB limit');
  }

  const safeFolder = String(folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `folder=${safeFolder}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`;
  const signature = createHash('sha1').update(signaturePayload).digest('hex');

  const payload = new URLSearchParams({
    file: normalized,
    api_key: CLOUDINARY_CONFIG.apiKey,
    timestamp: String(timestamp),
    folder: safeFolder,
    signature,
  });

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.secure_url) {
    throw new Error(body?.error?.message || 'Cloudinary upload failed');
  }

  return String(body.secure_url);
};

const resolveImageInput = async (value, folder) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.startsWith('data:image/')) {
    return saveImageDataUrl(normalized, folder);
  }
  return toPublicImageUrl(normalized);
};

const resolveImagesInput = async (value, folder) => {
  if (!Array.isArray(value)) return [];
  const results = [];
  for (const item of value) {
    const resolved = await resolveImageInput(item, folder);
    if (resolved) {
      results.push(resolved);
    }
  }
  return results;
};

const hashPassword = (plainPassword) => {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
};
const verifyPasswordHash = (plainPassword, storedHash) => {
  const normalizedStored = String(storedHash || '');
  if (!normalizedStored.startsWith('scrypt$')) return false;

  const [, salt, digestHex] = normalizedStored.split('$');
  if (!salt || !digestHex) return false;

  const calculated = scryptSync(String(plainPassword), salt, 64);
  const expected = Buffer.from(digestHex, 'hex');
  return expected.length === calculated.length && timingSafeEqual(expected, calculated);
};

const getSessionTokenFromRequest = (req) => {
  const token = req.headers['x-session-token'];
  return typeof token === 'string' ? token.trim() : '';
};

const createSessionToken = () => {
  return `${randomUUID()}.${randomBytes(24).toString('hex')}`;
};

const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const fetchUserById = async (userId) => {
  const [rows] = await pool.execute(
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      name,
      email,
      phone,
      image,
      role,
      isApproved
    FROM User
    WHERE id = UUID_TO_BIN(?)
    LIMIT 1
    `,
    [userId],
  );

  return rows.length
    ? {
        ...rows[0],
        image: toPublicImageUrl(rows[0].image),
      }
    : null;
};

const resolveSessionUserId = async (req) => {
  const sessionToken = getSessionTokenFromRequest(req);
  if (!sessionToken) return null;

  const [rows] = await pool.execute(
    `
    SELECT BIN_TO_UUID(userId) AS userId
    FROM AuthSession
    WHERE tokenHash = ?
      AND expiresAt > NOW()
    LIMIT 1
    `,
    [hashValue(sessionToken)],
  );

  return rows.length ? String(rows[0].userId) : null;
};

const createSession = async (userId) => {
  const sessionId = randomUUID();
  const sessionToken = createSessionToken();
  const tokenHash = hashValue(sessionToken);

  await pool.execute(
    `
    INSERT INTO AuthSession (id, userId, tokenHash, expiresAt)
    VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, DATE_ADD(NOW(), INTERVAL ? DAY))
    `,
    [sessionId, userId, tokenHash, SESSION_TTL_DAYS],
  );

  return sessionToken;
};

async function ensureAuthTables() {
  await pool.execute(
    `
    CREATE TABLE IF NOT EXISTS AuthSession (
      id BINARY(16) PRIMARY KEY,
      userId BINARY(16) NOT NULL,
      tokenHash VARCHAR(128) NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,
  );

  await pool.execute(
    `
    CREATE TABLE IF NOT EXISTS AuthOtpChallenge (
      id BINARY(16) PRIMARY KEY,
      userId BINARY(16) NULL,
      name VARCHAR(191) NULL,
      email VARCHAR(191) NULL,
      phone VARCHAR(32) NULL,
      passwordHash VARCHAR(255) NULL,
      purpose VARCHAR(16) NOT NULL,
      codeHash VARCHAR(128) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expiresAt DATETIME NOT NULL,
      verifiedAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `,
  );

  await pool.execute(
    `
    CREATE TABLE IF NOT EXISTS SellerUpgradeRequest (
      id BINARY(16) PRIMARY KEY,
      userId BINARY(16) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      message TEXT NULL,
      reviewedBy BINARY(16) NULL,
      reviewNote TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewedAt DATETIME NULL
    )
    `,
  );

  await pool.execute(
    `
    CREATE TABLE IF NOT EXISTS AppSetting (
      \`key\` VARCHAR(128) PRIMARY KEY,
      value LONGTEXT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    `,
  );
}

async function ensureVariantTrackingSchema() {
  const execSafe = async (sql) => {
    try {
      await pool.execute(sql);
    } catch (err) {
      const code = Number(err?.errno || 0);
      if ([1060, 1061, 1091, 1553].includes(code)) return;
      throw err;
    }
  };

  await execSafe(`
    ALTER TABLE CartItem
    ADD COLUMN variantSignature VARCHAR(191) NOT NULL DEFAULT ''
  `);
  await execSafe(`
    ALTER TABLE CartItem
    ADD COLUMN variantSnapshot JSON NULL
  `);

  await execSafe(`
    ALTER TABLE OrderItem
    ADD COLUMN variantSignature VARCHAR(191) NOT NULL DEFAULT ''
  `);
  await execSafe(`
    ALTER TABLE OrderItem
    ADD COLUMN variantSnapshot JSON NULL
  `);

  const [indexes] = await pool.execute(
    `
    SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'CartItem'
    GROUP BY INDEX_NAME, NON_UNIQUE
    `,
  );

  for (const indexRow of indexes) {
    if (Number(indexRow.NON_UNIQUE) !== 0) continue;
    const cols = String(indexRow.cols || '');
    if (cols === 'userId,productId') {
      await execSafe(`ALTER TABLE CartItem DROP INDEX \`${String(indexRow.INDEX_NAME)}\``);
    }
  }

  await execSafe(`
    CREATE UNIQUE INDEX ux_cart_user_product_variant
    ON CartItem (userId, productId, variantSignature)
  `);
}

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeEthiopianPhone = (value) => {
  if (typeof value !== 'string') return '';
  const compact = value.replace(/[^\d+]/g, '');

  if (!compact) return '';
  if (compact.startsWith('+251')) return compact;
  if (compact.startsWith('251')) return `+${compact}`;
  if (compact.startsWith('0')) return `+251${compact.slice(1)}`;
  if (compact.startsWith('9')) return `+251${compact}`;
  return compact;
};

const isValidEmail = (value) => EMAIL_REGEX.test(value);
const isValidEthiopianPhone = (value) => ETHIOPIAN_PHONE_REGEX.test(value);

const sendOtpByEmail = async (email, code) => {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.OTP_EMAIL_FROM;

  if (!resendApiKey || !emailFrom) {
    throw new Error('Email OTP provider is not configured');
  }

  await require('axios').post(
    'https://api.resend.com/emails',
    {
      from: emailFrom,
      to: [email],
      subject: 'Your MarketHub OTP code',
      html: `<p>Your OTP code is <strong>${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>`,
    },
    {
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );
};

const sendOtpByPhone = async (phone, code) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error('SMS OTP provider is not configured');
  }

  const payload = new URLSearchParams({
    Body: `Your MarketHub OTP code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    From: fromPhone,
    To: phone,
  });

  await require('axios').post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    payload.toString(),
    {
      auth: {
        username: accountSid,
        password: authToken,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
};

const requireAdmin = async (req, res) => {
  const userId = await resolveSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const user = await fetchUserById(userId);
  if (!user || String(user.role).toUpperCase() !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return user;
};

const requireApprovedSeller = async (req, res) => {
  const userId = await resolveSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const user = await fetchUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }

  if (String(user.role).toUpperCase() !== 'SELLER' || Number(user.isApproved || 0) !== 1) {
    res.status(403).json({ error: 'Approved seller access required' });
    return null;
  }

  return user;
};

const splitFullName = (fullName) => {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstName: 'Customer', lastName: 'User' };

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const initializeChapaTransaction = async ({
  txRef,
  amount,
  email,
  phone,
  fullName,
  orderId,
}) => {
  if (!CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY is not configured');
  }

  const { firstName, lastName } = splitFullName(fullName);
  const normalizedEmail = String(email || '').trim();
  // Chapa rejects some non-standard emails (e.g. .local); ensure a safe fallback.
  const safeEmail =
    EMAIL_REGEX.test(normalizedEmail) && !normalizedEmail.toLowerCase().endsWith('.local')
      ? normalizedEmail
      : `customer.${Date.now()}@example.com`;
  const callbackUrl = `${BACKEND_BASE_URL}/payments/chapa/callback`;
  const returnUrl = `${BACKEND_BASE_URL}/payments/chapa/return?tx_ref=${encodeURIComponent(txRef)}&order_id=${encodeURIComponent(orderId)}`;

  let response;
  try {
    response = await axios.post(
      `${CHAPA_API_BASE_URL}/transaction/initialize`,
      {
        amount: Number(amount).toFixed(2),
        currency: 'ETB',
        email: safeEmail,
        first_name: firstName,
        last_name: lastName,
        phone_number: phone ? String(phone) : undefined,
        tx_ref: txRef,
        callback_url: callbackUrl,
        return_url: returnUrl,
      customization: {
        // Chapa constraints: title <= 16 chars, description <= 50 chars
        title: 'MarketHub Pay',
        description: `Order ${String(orderId).slice(0, 8)}`,
      },
      },
      {
        headers: {
          Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (err) {
    const apiPayload = err?.response?.data;
    const reason =
      (typeof apiPayload?.message === 'string' && apiPayload.message) ||
      (typeof apiPayload?.error === 'string' && apiPayload.error) ||
      (typeof err?.message === 'string' && err.message) ||
      'Chapa initialization failed';
    const details = apiPayload
      ? ` ${JSON.stringify(apiPayload)}`
      : '';
    throw new Error(`Chapa init failed: ${reason}${details}`);
  }

  if (
    String(response.data?.status || '').toLowerCase() !== 'success' ||
    !response.data?.data?.checkout_url
  ) {
    throw new Error('Failed to initialize Chapa transaction');
  }

  return response.data.data.checkout_url;
};

const verifyChapaTransaction = async (txRef) => {
  if (!CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY is not configured');
  }

  const response = await axios.get(
    `${CHAPA_API_BASE_URL}/transaction/verify/${encodeURIComponent(txRef)}`,
    {
      headers: {
        Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
      },
    },
  );

  return response.data;
};

const syncPaymentFromChapa = async (txRef) => {
  const verification = await verifyChapaTransaction(txRef);
  const apiStatus = String(verification?.status || '').toUpperCase();
  const trxStatus = String(verification?.data?.status || '').toUpperCase();
  const isSuccess = apiStatus === 'SUCCESS' && ['SUCCESS', 'SUCCESSFUL'].includes(trxStatus);
  const nextPaymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';
  const nextOrderStatus = isSuccess ? 'CONFIRMED' : 'FAILED';

  const [payments] = await pool.execute(
    `
    SELECT BIN_TO_UUID(orderId) AS orderId
    FROM Payment
    WHERE transactionId = ?
    LIMIT 1
    `,
    [txRef],
  );

  if (payments.length) {
    const orderId = String(payments[0].orderId);
    await pool.execute(
      `
      UPDATE Payment
      SET status = ?
      WHERE transactionId = ?
      `,
      [nextPaymentStatus, txRef],
    );
    await pool.execute(
      `
      UPDATE \`Order\`
      SET status = ?
      WHERE id = UUID_TO_BIN(?)
      `,
      [nextOrderStatus, orderId],
    );
  }

  return {
    txRef,
    paymentStatus: nextPaymentStatus,
    orderStatus: nextOrderStatus,
    verification,
  };
};

// Auth
app.post('/auth/signup', async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeEthiopianPhone(phone);
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';
  const normalizedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword.trim() : '';

  if (!normalizedName) return res.status(400).json({ error: 'name is required' });
  if (!normalizedPassword) return res.status(400).json({ error: 'password is required' });
  if (normalizedConfirmPassword && normalizedConfirmPassword !== normalizedPassword) {
    return res.status(400).json({ error: 'password confirmation does not match' });
  }
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({ error: 'email or Ethiopian phone number is required' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (normalizedPhone && !isValidEthiopianPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
  }

  try {
    const [existingRows] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [normalizedEmail || '__no_email__', normalizedPhone || '__no_phone__'],
    );
    if (existingRows.length) {
      return res.status(409).json({ error: 'User already exists with this email or phone' });
    }

    const userId = randomUUID();
    const emailForInsert =
      normalizedEmail || `phone.${String(normalizedPhone).replace('+', '')}.${Date.now()}@markethub.local`;
    const passwordHash = hashPassword(normalizedPassword);

    await pool.execute(
      `
      INSERT INTO User (id, name, email, password, role, phone, image, isApproved)
      VALUES (UUID_TO_BIN(?), ?, ?, ?, 'CUSTOMER', ?, NULL, 1)
      `,
      [userId, normalizedName, emailForInsert, passwordHash, normalizedPhone || null],
    );

    const sessionToken = await createSession(userId);
    const user = await fetchUserById(userId);

    res.status(201).json({
      ok: true,
      sessionToken,
      user,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, phone, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeEthiopianPhone(phone);
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';

  if (!normalizedPassword) return res.status(400).json({ error: 'password is required' });
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({ error: 'email or Ethiopian phone number is required' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (normalizedPhone && !isValidEthiopianPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
  }

  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        password
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [normalizedEmail || '__no_email__', normalizedPhone || '__no_phone__'],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const storedPassword = String(user.password || '');
    let validPassword = false;
    let shouldUpgradePassword = false;

    if (storedPassword.startsWith('scrypt$')) {
      validPassword = verifyPasswordHash(normalizedPassword, storedPassword);
    } else {
      validPassword = storedPassword.length > 0 && normalizedPassword === storedPassword;
      shouldUpgradePassword = validPassword;
    }

    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    if (shouldUpgradePassword) {
      const upgradedHash = hashPassword(normalizedPassword);
      await pool.execute(
        `UPDATE User SET password = ? WHERE id = UUID_TO_BIN(?)`,
        [upgradedHash, String(user.id)],
      );
    }

    const sessionToken = await createSession(String(user.id));
    const safeUser = await fetchUserById(String(user.id));

    res.json({
      ok: true,
      sessionToken,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/signup/start', async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeEthiopianPhone(phone);
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';
  const normalizedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword.trim() : '';

  if (!normalizedName) return res.status(400).json({ error: 'name is required' });
  if (!normalizedPassword) return res.status(400).json({ error: 'password is required' });
  if (normalizedConfirmPassword && normalizedConfirmPassword !== normalizedPassword) {
    return res.status(400).json({ error: 'password confirmation does not match' });
  }
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({ error: 'email or Ethiopian phone number is required' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (normalizedPhone && !isValidEthiopianPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
  }

  try {
    const [existingRows] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [normalizedEmail || '__no_email__', normalizedPhone || '__no_phone__'],
    );

    if (existingRows.length) {
      return res.status(409).json({ error: 'User already exists with this email or phone' });
    }

    const challengeId = randomUUID();
    const otpCode = generateOtpCode();
    const codeHash = hashValue(otpCode);
    const passwordHash = hashPassword(normalizedPassword);

    await pool.execute(
      `
      INSERT INTO AuthOtpChallenge (
        id, userId, name, email, phone, passwordHash, purpose, codeHash, attempts, expiresAt, verifiedAt
      )
      VALUES (
        UUID_TO_BIN(?), NULL, ?, ?, ?, ?, 'SIGNUP', ?, 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL
      )
      `,
      [challengeId, normalizedName, normalizedEmail || null, normalizedPhone || null, passwordHash, codeHash, OTP_TTL_MINUTES],
    );

    if (normalizedPhone) {
      await sendOtpByPhone(normalizedPhone, otpCode);
    } else {
      await sendOtpByEmail(normalizedEmail, otpCode);
    }

    res.status(201).json({
      ok: true,
      challengeId,
      notification: normalizedPhone
        ? `OTP sent to ${normalizedPhone}`
        : `OTP sent to ${normalizedEmail}`,
    });
  } catch (err) {
    console.error('Signup start error:', err);
    res.status(500).json({ error: 'Could not send OTP for signup' });
  }
});

app.post('/auth/signup/verify', async (req, res) => {
  const { challengeId, otp } = req.body || {};
  const normalizedOtp = typeof otp === 'string' ? otp.trim() : '';

  if (!challengeId || !normalizedOtp) {
    return res.status(400).json({ error: 'challengeId and otp are required' });
  }

  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        email,
        phone,
        passwordHash,
        codeHash,
        attempts,
        expiresAt,
        verifiedAt
      FROM AuthOtpChallenge
      WHERE id = UUID_TO_BIN(?) AND purpose = 'SIGNUP'
      LIMIT 1
      `,
      [challengeId],
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'OTP challenge not found' });
    }

    const challenge = rows[0];
    if (challenge.verifiedAt) return res.status(400).json({ error: 'OTP already used' });
    if (new Date(challenge.expiresAt) < new Date()) return res.status(400).json({ error: 'OTP expired' });
    if (Number(challenge.attempts || 0) >= 5) return res.status(429).json({ error: 'Too many OTP attempts' });

    if (challenge.codeHash !== hashValue(normalizedOtp)) {
      await pool.execute(
        `UPDATE AuthOtpChallenge SET attempts = attempts + 1 WHERE id = UUID_TO_BIN(?)`,
        [challengeId],
      );
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    const [existingRows] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [challenge.email || '__no_email__', challenge.phone || '__no_phone__'],
    );
    if (existingRows.length) return res.status(409).json({ error: 'User already exists' });

    const userId = randomUUID();
    const emailForInsert = challenge.email || `phone.${String(challenge.phone || '').replace('+', '')}.${Date.now()}@markethub.local`;
    await pool.execute(
      `
      INSERT INTO User (id, name, email, password, role, phone, image, isApproved)
      VALUES (UUID_TO_BIN(?), ?, ?, ?, 'CUSTOMER', ?, NULL, 1)
      `,
      [userId, String(challenge.name || ''), emailForInsert, challenge.passwordHash, challenge.phone || null],
    );

    await pool.execute(
      `UPDATE AuthOtpChallenge SET verifiedAt = NOW() WHERE id = UUID_TO_BIN(?)`,
      [challengeId],
    );

    const sessionToken = await createSession(userId);
    const user = await fetchUserById(userId);

    res.json({
      ok: true,
      sessionToken,
      user,
      notification: challenge.phone
        ? `Signup completed. Notification sent to ${challenge.phone}`
        : `Signup completed. Notification sent to ${challenge.email}`,
    });
  } catch (err) {
    console.error('Signup verify error:', err);
    res.status(500).json({ error: 'Could not verify signup OTP' });
  }
});

app.post('/auth/login/start', async (req, res) => {
  const { email, phone, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeEthiopianPhone(phone);
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';

  if (!normalizedPassword) return res.status(400).json({ error: 'password is required' });
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({ error: 'email or Ethiopian phone number is required' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (normalizedPhone && !isValidEthiopianPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
  }

  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        email,
        phone,
        password
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [normalizedEmail || '__no_email__', normalizedPhone || '__no_phone__'],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    const storedPassword = String(user.password || '');
    let validPassword = false;
    let shouldUpgradePassword = false;

    if (storedPassword.startsWith('scrypt$')) {
      validPassword = verifyPasswordHash(normalizedPassword, storedPassword);
    } else {
      validPassword = storedPassword.length > 0 && normalizedPassword === storedPassword;
      shouldUpgradePassword = validPassword;
    }

    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    if (shouldUpgradePassword) {
      const upgradedHash = hashPassword(normalizedPassword);
      await pool.execute(
        `UPDATE User SET password = ? WHERE id = UUID_TO_BIN(?)`,
        [upgradedHash, String(user.id)],
      );
    }

    const challengeId = randomUUID();
    const otpCode = generateOtpCode();
    const codeHash = hashValue(otpCode);
    await pool.execute(
      `
      INSERT INTO AuthOtpChallenge (
        id, userId, name, email, phone, passwordHash, purpose, codeHash, attempts, expiresAt, verifiedAt
      )
      VALUES (
        UUID_TO_BIN(?), UUID_TO_BIN(?), NULL, ?, ?, NULL, 'LOGIN', ?, 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL
      )
      `,
      [challengeId, String(user.id), user.email || null, user.phone || null, codeHash, OTP_TTL_MINUTES],
    );

    if (user.phone) {
      await sendOtpByPhone(String(user.phone), otpCode);
    } else {
      await sendOtpByEmail(String(user.email), otpCode);
    }

    res.json({
      ok: true,
      challengeId,
      notification: user.phone
        ? `OTP sent to ${user.phone}`
        : `OTP sent to ${user.email}`,
    });
  } catch (err) {
    console.error('Login start error:', err);
    res.status(500).json({ error: 'Could not send OTP for login' });
  }
});

app.post('/auth/login/verify', async (req, res) => {
  const { challengeId, otp } = req.body || {};
  const normalizedOtp = typeof otp === 'string' ? otp.trim() : '';

  if (!challengeId || !normalizedOtp) {
    return res.status(400).json({ error: 'challengeId and otp are required' });
  }

  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        BIN_TO_UUID(userId) AS userId,
        email,
        phone,
        codeHash,
        attempts,
        expiresAt,
        verifiedAt
      FROM AuthOtpChallenge
      WHERE id = UUID_TO_BIN(?) AND purpose = 'LOGIN'
      LIMIT 1
      `,
      [challengeId],
    );
    if (!rows.length) return res.status(404).json({ error: 'OTP challenge not found' });

    const challenge = rows[0];
    if (challenge.verifiedAt) return res.status(400).json({ error: 'OTP already used' });
    if (new Date(challenge.expiresAt) < new Date()) return res.status(400).json({ error: 'OTP expired' });
    if (Number(challenge.attempts || 0) >= 5) return res.status(429).json({ error: 'Too many OTP attempts' });

    if (challenge.codeHash !== hashValue(normalizedOtp)) {
      await pool.execute(
        `UPDATE AuthOtpChallenge SET attempts = attempts + 1 WHERE id = UUID_TO_BIN(?)`,
        [challengeId],
      );
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    await pool.execute(
      `UPDATE AuthOtpChallenge SET verifiedAt = NOW() WHERE id = UUID_TO_BIN(?)`,
      [challengeId],
    );

    const sessionToken = await createSession(String(challenge.userId));
    const user = await fetchUserById(String(challenge.userId));

    res.json({
      ok: true,
      sessionToken,
      user,
      notification: challenge.phone
        ? `Login successful. Notification sent to ${challenge.phone}`
        : `Login successful. Notification sent to ${challenge.email}`,
    });
  } catch (err) {
    console.error('Login verify error:', err);
    res.status(500).json({ error: 'Could not verify login OTP' });
  }
});

app.get('/auth/me', async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await fetchUserById(userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to fetch session user' });
  }
});

app.post('/auth/dev/promote-admin', async (req, res) => {
  try {
    if (!DEV_ALLOW_SELF_ADMIN) {
      return res.status(403).json({ error: 'Dev self-promotion is disabled' });
    }

    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await pool.execute(
      `
      UPDATE User
      SET role = 'ADMIN', isApproved = 1
      WHERE id = UUID_TO_BIN(?)
      `,
      [userId],
    );

    const user = await fetchUserById(userId);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Dev admin promotion error:', err);
    res.status(500).json({ error: 'Could not promote current user to admin' });
  }
});

app.patch('/auth/profile', async (req, res) => {
  const { name, phone, image } = req.body || {};

  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedPhoneInput = typeof phone === 'string' ? phone.trim() : '';
    const normalizedPhone = normalizedPhoneInput ? normalizeEthiopianPhone(normalizedPhoneInput) : null;
    if (normalizedPhoneInput && !isValidEthiopianPhone(normalizedPhone || '')) {
      return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
    }

    const normalizedImage = image !== undefined ? await resolveImageInput(image, 'profiles') : null;

    await pool.execute(
      `
      UPDATE User
      SET
        name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(?, phone),
        image = COALESCE(?, image)
      WHERE id = UUID_TO_BIN(?)
      `,
      [
        normalizedName,
        normalizedPhone,
        normalizedImage,
        userId,
      ],
    );

    const user = await fetchUserById(userId);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Auth profile update error:', err);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

app.post('/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const normalizedCurrentPassword = typeof currentPassword === 'string' ? currentPassword.trim() : '';
  const normalizedNewPassword = typeof newPassword === 'string' ? newPassword.trim() : '';
  const normalizedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword.trim() : '';

  if (!normalizedCurrentPassword || !normalizedNewPassword || !normalizedConfirmPassword) {
    return res.status(400).json({ error: 'currentPassword, newPassword and confirmPassword are required' });
  }
  if (normalizedNewPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  if (normalizedNewPassword !== normalizedConfirmPassword) {
    return res.status(400).json({ error: 'Password confirmation does not match' });
  }

  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const [rows] = await pool.execute(
      `
      SELECT password
      FROM User
      WHERE id = UUID_TO_BIN(?)
      LIMIT 1
      `,
      [userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const storedPassword = String(rows[0].password || '');
    const validCurrentPassword = storedPassword.startsWith('scrypt$')
      ? verifyPasswordHash(normalizedCurrentPassword, storedPassword)
      : storedPassword.length > 0 && normalizedCurrentPassword === storedPassword;

    if (!validCurrentPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (normalizedCurrentPassword === normalizedNewPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const nextPasswordHash = hashPassword(normalizedNewPassword);
    await pool.execute(
      `
      UPDATE User
      SET password = ?
      WHERE id = UUID_TO_BIN(?)
      `,
      [nextPasswordHash, userId],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Could not update password' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) return res.json({ ok: true });
    await pool.execute(
      `DELETE FROM AuthSession WHERE tokenHash = ?`,
      [hashValue(sessionToken)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Users
app.get('/users', (req, res) => {
  const query = `
    SELECT
      BIN_TO_UUID(id) AS id,
      name, email, role, phone, image, isApproved, createdAt, updatedAt
    FROM User
  `;
  queryHandler(res, query);
});

app.get('/users/:id', (req, res) => {
  const query = `
    SELECT
      BIN_TO_UUID(id) AS id,
      name, email, role, phone, image, isApproved, createdAt, updatedAt
    FROM User
    WHERE id = UUID_TO_BIN(?)
  `;
  queryHandler(res, query, [req.params.id]);
});

// Categories
app.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        BIN_TO_UUID(parentId) AS parentId,
        image
      FROM Category
      `,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        image: toPublicImageUrl(row.image),
      })),
    );
  } catch (err) {
    console.error('Categories query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Products
app.get('/products', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        p.description,
        p.price,
        p.discountPrice,
        p.stock,
        p.sku,
        p.images,
        p.brand,
        p.weight,
        BIN_TO_UUID(p.sellerId) AS sellerId,
        BIN_TO_UUID(p.categoryId) AS categoryId,
        p.createdAt,
        p.updatedAt,
        c.name AS categoryName,
        u.name AS sellerName
      FROM Product p
      LEFT JOIN Category c ON c.id = p.categoryId
      LEFT JOIN User u ON u.id = p.sellerId
      ORDER BY p.createdAt DESC
      `,
    );

    const productIds = rows.map((row) => String(row.id));
    const { byProductId, groupedByType } = await fetchProductVariantsByProductIds(productIds);

    const parsed = rows.map((row) => {
      const productId = String(row.id || '');
      return {
        ...row,
        images: parseImageArray(row.images),
        variants: byProductId.get(productId) || [],
        variantGroups: groupedByType.get(productId) || [],
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        p.description,
        p.price,
        p.discountPrice,
        p.stock,
        p.sku,
        p.images,
        p.brand,
        p.weight,
        BIN_TO_UUID(p.sellerId) AS sellerId,
        BIN_TO_UUID(p.categoryId) AS categoryId,
        p.createdAt,
        p.updatedAt,
        c.name AS categoryName,
        u.name AS sellerName
      FROM Product p
      LEFT JOIN Category c ON c.id = p.categoryId
      LEFT JOIN User u ON u.id = p.sellerId
      WHERE p.id = UUID_TO_BIN(?)
      LIMIT 1
      `,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const row = rows[0];
    const { byProductId, groupedByType } = await fetchProductVariantsByProductIds([String(row.id)]);
    const productId = String(row.id || '');
    const parsed = {
      ...row,
      images: parseImageArray(row.images),
      variants: byProductId.get(productId) || [],
      variantGroups: groupedByType.get(productId) || [],
    };

    res.json(parsed);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/product-variants', (req, res) => {
  queryHandler(
    res,
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(product_id) AS product_id,
      sku,
      title,
      price,
      discount_price,
      stock,
      attributes,
      images,
      created_at
    FROM ProductVariant
    `,
  );
});

// Cart
app.get('/cart-items', async (req, res) => {
  const { userId } = req.query;

  try {
    let targetUserId = userId;
    if (!targetUserId) {
      targetUserId = await resolveSessionUserId(req);
    }

    if (!targetUserId) {
      const [users] = await pool.execute(
        `SELECT BIN_TO_UUID(id) AS id FROM User WHERE role = 'CUSTOMER' ORDER BY createdAt ASC LIMIT 1`,
      );

      if (!users.length) {
        return res.json([]);
      }

      targetUserId = users[0].id;
    }

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(ci.id) AS id,
        BIN_TO_UUID(ci.userId) AS userId,
        BIN_TO_UUID(ci.productId) AS productId,
        ci.quantity,
        ci.variantSignature,
        ci.variantSnapshot,
        p.name,
        p.price,
        p.discountPrice,
        p.stock,
        p.images
      FROM CartItem ci
      JOIN Product p ON p.id = ci.productId
      WHERE ci.userId = UUID_TO_BIN(?)
      ORDER BY ci.createdAt DESC
      `,
      [targetUserId],
    );

    const parsed = rows.map((row) => {
      const images = parseImageArray(row.images);
      const variantSnapshot = parseJsonObject(row.variantSnapshot) || null;
      const unitPrice = Number(variantSnapshot?.unitPrice ?? row.discountPrice ?? row.price ?? 0);
      return {
        ...row,
        price: unitPrice,
        selectedVariant: variantSnapshot,
        image: images[0] || '',
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.post('/cart-items', async (req, res) => {
  const { userId, productId, quantity = 1, selectedVariant } = req.body || {};
  let targetUserId = userId || (await resolveSessionUserId(req));

  if (!targetUserId) {
    const [users] = await pool.execute(
      `SELECT BIN_TO_UUID(id) AS id FROM User WHERE role = 'CUSTOMER' ORDER BY createdAt ASC LIMIT 1`,
    );
    if (users.length) {
      targetUserId = users[0].id;
    }
  }

  if (!targetUserId || !productId) {
    return res.status(400).json({ error: 'userId/session and productId are required' });
  }

  const parsedQuantity = Number(quantity);
  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
    return res.status(400).json({ error: 'quantity must be at least 1' });
  }

  try {
    let variantSignature = '';
    let variantSnapshot = null;

    if (selectedVariant && typeof selectedVariant === 'object') {
      const variantId = String(selectedVariant.id || '').trim();
      if (variantId) {
        const [variantRows] = await pool.execute(
          `
          SELECT
            BIN_TO_UUID(v.id) AS id,
            BIN_TO_UUID(v.product_id) AS productId,
            v.sku,
            v.title,
            v.price,
            v.discount_price,
            v.stock,
            v.attributes
          FROM ProductVariant v
          WHERE v.id = UUID_TO_BIN(?) AND v.product_id = UUID_TO_BIN(?)
          LIMIT 1
          `,
          [variantId, productId],
        );

        if (!variantRows.length) {
          return res.status(400).json({ error: 'Selected variant is invalid for this product' });
        }

        const variantRow = variantRows[0];
        const attributes = parseJsonObject(variantRow.attributes) || {};
        variantSignature = `id:${String(variantRow.id)}`;
        variantSnapshot = {
          id: String(variantRow.id),
          sku: String(variantRow.sku || ''),
          title: String(variantRow.title || ''),
          type: String(attributes.type || 'Variant'),
          value: String(attributes.value || variantRow.title || ''),
          price: Number(variantRow.price || 0),
          discountPrice: variantRow.discount_price === null || variantRow.discount_price === undefined ? null : Number(variantRow.discount_price),
          unitPrice: Number(variantRow.discount_price ?? variantRow.price ?? 0),
          attributes,
        };
      } else {
        const type = String(selectedVariant.type || 'Variant').trim();
        const value = String(selectedVariant.value || selectedVariant.title || '').trim();
        const price = Number(selectedVariant.price);
        const discountPrice =
          selectedVariant.discountPrice === null || selectedVariant.discountPrice === undefined || selectedVariant.discountPrice === ''
            ? null
            : Number(selectedVariant.discountPrice);
        if (value && Number.isFinite(price)) {
          variantSnapshot = {
            id: '',
            sku: String(selectedVariant.sku || '').trim(),
            title: String(selectedVariant.title || `${type}: ${value}`).trim(),
            type,
            value,
            price,
            discountPrice: Number.isFinite(discountPrice) ? discountPrice : null,
            unitPrice: Number.isFinite(discountPrice) ? discountPrice : price,
            attributes: { type, value },
          };
          variantSignature = `custom:${hashValue(JSON.stringify(variantSnapshot)).slice(0, 32)}`;
        }
      }
    }

    const [[existing]] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id, quantity
      FROM CartItem
      WHERE userId = UUID_TO_BIN(?)
        AND productId = UUID_TO_BIN(?)
        AND variantSignature = ?
      LIMIT 1
      `,
      [targetUserId, productId, variantSignature],
    );

    if (existing) {
      await pool.execute(
        `
        UPDATE CartItem
        SET quantity = quantity + ?,
            variantSnapshot = ?
        WHERE id = UUID_TO_BIN(?)
        `,
        [parsedQuantity, variantSnapshot ? JSON.stringify(variantSnapshot) : null, existing.id],
      );
    } else {
      const id = randomUUID();
      await pool.execute(
        `
        INSERT INTO CartItem (id, userId, productId, quantity, variantSignature, variantSnapshot)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?)
        `,
        [
          id,
          targetUserId,
          productId,
          parsedQuantity,
          variantSignature,
          variantSnapshot ? JSON.stringify(variantSnapshot) : null,
        ],
      );
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

app.patch('/cart-items/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body || {};
  const parsedQuantity = Number(quantity);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
    return res.status(400).json({ error: 'quantity must be at least 1' });
  }

  try {
    const [result] = await pool.execute(
      `
      UPDATE CartItem
      SET quantity = ?
      WHERE id = UUID_TO_BIN(?)
      `,
      [parsedQuantity, id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Cart update error:', err);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

app.delete('/cart-items/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      `
      DELETE FROM CartItem
      WHERE id = UUID_TO_BIN(?)
      `,
      [id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Cart delete error:', err);
    res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

app.post('/checkout', async (req, res) => {
  const {
    userId,
    shippingAddress,
    shippingMethod = 'standard',
    paymentMethod = 'chapa',
  } = req.body || {};

  const targetUserId = userId || (await resolveSessionUserId(req));

  if (!targetUserId) {
    return res.status(400).json({ error: 'userId/session is required' });
  }

    if (!shippingAddress?.fullName || !shippingAddress?.phone || !shippingAddress?.city || !shippingAddress?.details) {
      return res.status(400).json({ error: 'shippingAddress is incomplete' });
    }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [cartRows] = await connection.execute(
      `
      SELECT
        BIN_TO_UUID(ci.id) AS id,
        BIN_TO_UUID(ci.productId) AS productId,
        ci.quantity,
        ci.variantSignature,
        ci.variantSnapshot,
        p.price AS productPrice,
        p.discountPrice AS productDiscountPrice,
        p.name AS productName
      FROM CartItem ci
      JOIN Product p ON p.id = ci.productId
      WHERE ci.userId = UUID_TO_BIN(?)
      `,
      [targetUserId],
    );

    if (!cartRows.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const cartItems = cartRows.map((item) => {
      const variantSnapshot = parseJsonObject(item.variantSnapshot) || null;
      const fallbackPrice = Number(item.productDiscountPrice ?? item.productPrice ?? 0);
      const unitPrice = Number(variantSnapshot?.unitPrice ?? fallbackPrice);
      return {
        ...item,
        variantSnapshot,
        unitPrice,
      };
    });

    const quantitiesByProduct = cartItems.reduce((acc, item) => {
      const productId = String(item.productId);
      const quantity = Number(item.quantity || 0);
      const productName = String(item.productName || 'product');

      if (!acc[productId]) {
        acc[productId] = { quantity: 0, productName };
      }

      acc[productId].quantity += quantity;
      return acc;
    }, {});

    const quantitiesByVariant = cartItems.reduce((acc, item) => {
      const variantId = String(item.variantSnapshot?.id || '').trim();
      if (!variantId) return acc;
      const quantity = Number(item.quantity || 0);
      if (!acc[variantId]) acc[variantId] = 0;
      acc[variantId] += quantity;
      return acc;
    }, {});

    for (const [variantId, quantity] of Object.entries(quantitiesByVariant)) {
      if (!Number.isFinite(quantity) || quantity < 1) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid cart quantity' });
      }

      const [variantStockResult] = await connection.execute(
        `
        UPDATE ProductVariant
        SET stock = stock - ?
        WHERE id = UUID_TO_BIN(?) AND stock >= ?
        `,
        [quantity, variantId, quantity],
      );

      if (!variantStockResult.affectedRows) {
        await connection.rollback();
        return res.status(400).json({ error: 'Insufficient stock for selected variant' });
      }
    }

    for (const [productId, info] of Object.entries(quantitiesByProduct)) {
      if (!Number.isFinite(info.quantity) || info.quantity < 1) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid cart quantity' });
      }

      const [stockResult] = await connection.execute(
        `
        UPDATE Product
        SET stock = stock - ?
        WHERE id = UUID_TO_BIN(?) AND stock >= ?
        `,
        [info.quantity, productId, info.quantity],
      );

      if (!stockResult.affectedRows) {
        await connection.rollback();
        return res.status(400).json({ error: `Insufficient stock for ${info.productName}` });
      }
    }

    const subtotal = cartItems.reduce(
      (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0,
    );
    const shippingCost = shippingMethod === 'express' ? 250 : 150;
    const totalAmount = subtotal + shippingCost;

    const addressId = randomUUID();
    await connection.execute(
      `
      INSERT INTO Address (id, userId, fullName, phone, city, subCity, region, details)
      VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?)
      `,
      [
        addressId,
        targetUserId,
        shippingAddress.fullName,
        shippingAddress.phone,
        shippingAddress.city,
        shippingAddress.subCity || null,
        shippingAddress.region || null,
        shippingAddress.details,
      ],
    );

    const orderId = randomUUID();
    await connection.execute(
      `
      INSERT INTO \`Order\` (id, userId, totalAmount, status, shippingCost, trackingNumber)
      VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'PENDING', ?, NULL)
      `,
      [orderId, targetUserId, totalAmount, shippingCost],
    );

    for (const item of cartItems) {
      await connection.execute(
        `
        INSERT INTO OrderItem (id, orderId, productId, quantity, price, variantSignature, variantSnapshot)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?)
        `,
        [
          randomUUID(),
          orderId,
          item.productId,
          Number(item.quantity || 0),
          Number(item.unitPrice || 0),
          String(item.variantSignature || ''),
          item.variantSnapshot ? JSON.stringify(item.variantSnapshot) : null,
        ],
      );
    }

    const normalizedMethod = String(paymentMethod || 'chapa').toUpperCase();
    const txRef =
      normalizedMethod === 'CHAPA'
        ? `CHAPA-${Date.now()}-${orderId.slice(0, 8)}`
        : `TXN-${Date.now()}`;
    const paymentId = randomUUID();
    await connection.execute(
      `
      INSERT INTO Payment (id, orderId, amount, method, status, transactionId)
      VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'PENDING', ?)
      `,
      [paymentId, orderId, totalAmount, normalizedMethod, txRef],
    );

    let paymentCheckoutUrl = null;
    if (normalizedMethod === 'CHAPA') {
      const user = await fetchUserById(targetUserId);
      const payerEmail =
        String(shippingAddress.email || '').trim() ||
        String(user?.email || '').trim() ||
        `customer.${Date.now()}@markethub.local`;

      paymentCheckoutUrl = await initializeChapaTransaction({
        txRef,
        amount: totalAmount,
        email: payerEmail,
        phone: String(shippingAddress.phone || ''),
        fullName: String(shippingAddress.fullName || ''),
        orderId,
      });
    }

    await connection.execute(
      `
      DELETE FROM CartItem
      WHERE userId = UUID_TO_BIN(?)
      `,
      [targetUserId],
    );

    await connection.commit();

    res.status(201).json({
      ok: true,
      orderId,
      totalAmount,
      shippingCost,
      status: 'PENDING',
      payment: {
        provider: normalizedMethod,
        txRef,
        checkoutUrl: paymentCheckoutUrl,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('Checkout error:', err);
    res.status(500).json({ error: err?.message || 'Checkout failed' });
  } finally {
    connection.release();
  }
});

app.get('/payments/chapa/callback', async (req, res) => {
  const txRef = String(req.query.tx_ref || req.query.trx_ref || '').trim();
  if (!txRef) {
    return res.status(400).json({ error: 'tx_ref is required' });
  }

  try {
    const synced = await syncPaymentFromChapa(txRef);
    res.json({ ok: true, ...synced });
  } catch (err) {
    console.error('Chapa callback error:', err);
    res.status(500).json({ error: 'Could not verify Chapa payment callback' });
  }
});

app.get('/payments/chapa/return', async (req, res) => {
  const txRef = String(req.query.tx_ref || req.query.trx_ref || '').trim();
  if (!txRef) {
    return res.redirect(`${FRONTEND_BASE_URL}/?payment_provider=chapa&payment_sync=failed`);
  }

  try {
    const synced = await syncPaymentFromChapa(txRef);
    const query = new URLSearchParams({
      payment_provider: 'chapa',
      tx_ref: txRef,
      payment_status: String(synced.paymentStatus || ''),
      order_status: String(synced.orderStatus || ''),
    });
    res.redirect(`${FRONTEND_BASE_URL}/?${query.toString()}`);
  } catch (err) {
    console.error('Chapa return error:', err);
    res.redirect(`${FRONTEND_BASE_URL}/?payment_provider=chapa&payment_sync=failed&tx_ref=${encodeURIComponent(txRef)}`);
  }
});

app.get('/payments/chapa/verify/:txRef', async (req, res) => {
  const { txRef } = req.params;
  if (!txRef) return res.status(400).json({ error: 'txRef is required' });

  try {
    const synced = await syncPaymentFromChapa(String(txRef));
    res.json({ ok: true, ...synced });
  } catch (err) {
    console.error('Chapa verify error:', err);
    res.status(500).json({ error: 'Could not verify Chapa payment' });
  }
});

// Orders
app.get('/orders', async (req, res) => {
  const { userId } = req.query;

  try {
    const sessionUserId = await resolveSessionUserId(req);
    const targetUserId = userId || sessionUserId;
    let query = `
      SELECT
        BIN_TO_UUID(id) AS id,
        BIN_TO_UUID(userId) AS userId,
        totalAmount,
        status,
        shippingCost,
        trackingNumber,
        createdAt
      FROM \`Order\`
    `;
    const params = [];

    if (targetUserId) {
      query += ' WHERE userId = UUID_TO_BIN(?)';
      params.push(targetUserId);
    }

    query += ' ORDER BY createdAt DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Orders query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/order-items', (req, res) => {
  queryHandler(
    res,
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(orderId) AS orderId,
      BIN_TO_UUID(productId) AS productId,
      quantity,
      price
    FROM OrderItem
    `,
  );
});

app.get('/payments', (req, res) => {
  queryHandler(
    res,
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(orderId) AS orderId,
      amount,
      method,
      status,
      transactionId,
      createdAt
    FROM Payment
    `,
  );
});

app.get('/addresses', (req, res) => {
  queryHandler(
    res,
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(userId) AS userId,
      fullName,
      phone,
      city,
      subCity,
      region,
      details,
      createdAt
    FROM Address
    `,
  );
});

app.get('/reviews', (req, res) => {
  queryHandler(
    res,
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(userId) AS userId,
      BIN_TO_UUID(productId) AS productId,
      rating,
      comment,
      createdAt
    FROM Review
    `,
  );
});

// Seller dashboard summary
app.get('/dashboard/seller/:sellerId', async (req, res) => {
  const { sellerId } = req.params;

  try {
    const [[productCountRow]] = await pool.execute(
      'SELECT COUNT(*) AS totalProducts FROM Product WHERE sellerId = UUID_TO_BIN(?)',
      [sellerId],
    );

    const [[stockRow]] = await pool.execute(
      'SELECT COALESCE(SUM(stock), 0) AS totalStock FROM Product WHERE sellerId = UUID_TO_BIN(?)',
      [sellerId],
    );

    const [[pendingOrdersRow]] = await pool.execute(
      `
      SELECT COUNT(DISTINCT o.id) AS pendingOrders
      FROM \`Order\` o
      JOIN OrderItem oi ON oi.orderId = o.id
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?) AND o.status IN ('PENDING','CONFIRMED','PROCESSING')
      `,
      [sellerId],
    );

    const [[salesRow]] = await pool.execute(
      `
      SELECT COALESCE(SUM(oi.quantity * oi.price), 0) AS totalSales
      FROM OrderItem oi
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?)
      `,
      [sellerId],
    );

    const [recentProducts] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        price,
        discountPrice,
        stock,
        images
      FROM Product
      WHERE sellerId = UUID_TO_BIN(?)
      ORDER BY createdAt DESC
      LIMIT 5
      `,
      [sellerId],
    );

    const [recentOrders] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(o.id) AS id,
        o.status,
        o.totalAmount,
        o.createdAt,
        u.name AS customer
      FROM \`Order\` o
      JOIN User u ON u.id = o.userId
      JOIN OrderItem oi ON oi.orderId = o.id
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?)
      GROUP BY o.id, o.status, o.totalAmount, o.createdAt, u.name
      ORDER BY o.createdAt DESC
      LIMIT 10
      `,
      [sellerId],
    );

    const mappedProducts = recentProducts.map((p) => {
      const images = parseImageArray(p.images);
      return {
        ...p,
        image: images[0] || '',
      };
    });

    res.json({
      stats: {
        totalSales: Number(salesRow.totalSales || 0),
        totalOrders: recentOrders.length,
        totalProducts: Number(productCountRow.totalProducts || 0),
        pendingOrders: Number(pendingOrdersRow.pendingOrders || 0),
        totalStock: Number(stockRow.totalStock || 0),
      },
      recentProducts: mappedProducts,
      recentOrders,
    });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Admin dashboard summary
app.get('/dashboard/admin', async (req, res) => {
  try {
    const [[usersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM User');
    const [[sellersCount]] = await pool.execute("SELECT COUNT(*) AS count FROM User WHERE role = 'SELLER'");
    const [[productsCount]] = await pool.execute('SELECT COUNT(*) AS count FROM Product');
    const [[ordersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM `Order`');
    const [[revenue]] = await pool.execute('SELECT COALESCE(SUM(totalAmount), 0) AS total FROM `Order`');

    const [sellers] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(u.id) AS id,
        u.name,
        u.email,
        u.isApproved,
        COUNT(DISTINCT p.id) AS products,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS sales
      FROM User u
      LEFT JOIN Product p ON p.sellerId = u.id
      LEFT JOIN OrderItem oi ON oi.productId = p.id
      WHERE u.role = 'SELLER'
      GROUP BY u.id, u.name, u.email, u.isApproved
      ORDER BY u.createdAt DESC
      `,
    );

    const [pendingSellers] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        email,
        createdAt
      FROM User
      WHERE role = 'SELLER' AND isApproved = 0
      ORDER BY createdAt DESC
      LIMIT 10
      `,
    );

    res.json({
      stats: {
        totalUsers: Number(usersCount.count || 0),
        totalSellers: Number(sellersCount.count || 0),
        totalProducts: Number(productsCount.count || 0),
        totalOrders: Number(ordersCount.count || 0),
        totalRevenue: Number(revenue.total || 0),
      },
      sellers,
      pendingSellers,
    });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Customer -> Seller request
app.post('/seller-requests', async (req, res) => {
  const {
    businessName,
    businessType,
    tinNumber,
    contactPhone,
    city,
    address,
    idDocumentUrl,
    message,
  } = req.body || {};

  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await fetchUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (String(user.role).toUpperCase() === 'SELLER' && Number(user.isApproved || 0) === 1) {
      return res.status(400).json({ error: 'User is already an approved seller' });
    }

    const [existing] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id
      FROM SellerUpgradeRequest
      WHERE userId = UUID_TO_BIN(?) AND status = 'PENDING'
      LIMIT 1
      `,
      [userId],
    );
    if (existing.length) {
      return res.status(409).json({ error: 'A pending seller request already exists' });
    }

    const normalizedBusinessName = typeof businessName === 'string' ? businessName.trim() : '';
    const normalizedContactPhone = normalizeEthiopianPhone(contactPhone);
    const normalizedCity = typeof city === 'string' ? city.trim() : '';
    const normalizedAddress = typeof address === 'string' ? address.trim() : '';
    if (!normalizedBusinessName || !normalizedContactPhone || !normalizedCity || !normalizedAddress) {
      return res.status(400).json({
        error: 'businessName, contactPhone, city, and address are required',
      });
    }
    if (!isValidEthiopianPhone(normalizedContactPhone)) {
      return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
    }

    const payload = {
      businessName: normalizedBusinessName,
      businessType: typeof businessType === 'string' ? businessType.trim() : '',
      tinNumber: typeof tinNumber === 'string' ? tinNumber.trim() : '',
      contactPhone: normalizedContactPhone,
      city: normalizedCity,
      address: normalizedAddress,
      idDocumentUrl: typeof idDocumentUrl === 'string' ? idDocumentUrl.trim() : '',
      message: typeof message === 'string' ? message.trim() : '',
    };

    const requestId = randomUUID();
    await pool.execute(
      `
      INSERT INTO SellerUpgradeRequest (id, userId, status, message)
      VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'PENDING', ?)
      `,
      [requestId, userId, JSON.stringify(payload)],
    );

    res.status(201).json({ ok: true, requestId });
  } catch (err) {
    console.error('Seller request error:', err);
    res.status(500).json({ error: 'Could not create seller request' });
  }
});

app.get('/seller-requests/me', async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const user = await fetchUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        status,
        message,
        reviewNote,
        createdAt,
        reviewedAt
      FROM SellerUpgradeRequest
      WHERE userId = UUID_TO_BIN(?)
      ORDER BY createdAt DESC
      LIMIT 1
      `,
      [userId],
    );

    let latestRequest = rows[0] || null;
    if (latestRequest && typeof latestRequest.message === 'string') {
      try {
        latestRequest = {
          ...latestRequest,
          payload: JSON.parse(latestRequest.message),
        };
      } catch {
        latestRequest = {
          ...latestRequest,
          payload: null,
        };
      }
    }

    res.json({
      ok: true,
      user,
      latestRequest,
    });
  } catch (err) {
    console.error('Seller request status error:', err);
    res.status(500).json({ error: 'Could not load seller request status' });
  }
});

app.get('/dashboard/seller-self', async (req, res) => {
  try {
    const seller = await requireApprovedSeller(req, res);
    if (!seller) return;

    const [recentProducts] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        price,
        discountPrice,
        stock,
        images
      FROM Product
      WHERE sellerId = UUID_TO_BIN(?)
      ORDER BY createdAt DESC
      LIMIT 5
      `,
      [seller.id],
    );

    const [recentOrders] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(o.id) AS id,
        o.status,
        o.totalAmount,
        o.createdAt,
        u.name AS customer
      FROM \`Order\` o
      JOIN User u ON u.id = o.userId
      JOIN OrderItem oi ON oi.orderId = o.id
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?)
      GROUP BY o.id, o.status, o.totalAmount, o.createdAt, u.name
      ORDER BY o.createdAt DESC
      LIMIT 10
      `,
      [seller.id],
    );

    const [[productCountRow]] = await pool.execute(
      'SELECT COUNT(*) AS totalProducts FROM Product WHERE sellerId = UUID_TO_BIN(?)',
      [seller.id],
    );
    const [[stockRow]] = await pool.execute(
      'SELECT COALESCE(SUM(stock), 0) AS totalStock FROM Product WHERE sellerId = UUID_TO_BIN(?)',
      [seller.id],
    );
    const [[pendingOrdersRow]] = await pool.execute(
      `
      SELECT COUNT(DISTINCT o.id) AS pendingOrders
      FROM \`Order\` o
      JOIN OrderItem oi ON oi.orderId = o.id
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?) AND o.status IN ('PENDING','CONFIRMED','PROCESSING')
      `,
      [seller.id],
    );
    const [[salesRow]] = await pool.execute(
      `
      SELECT COALESCE(SUM(oi.quantity * oi.price), 0) AS totalSales
      FROM OrderItem oi
      JOIN Product p ON p.id = oi.productId
      WHERE p.sellerId = UUID_TO_BIN(?)
      `,
      [seller.id],
    );

    const mappedProducts = recentProducts.map((p) => {
      const images = parseImageArray(p.images);
      return {
        ...p,
        image: images[0] || '',
      };
    });

    res.json({
      stats: {
        totalSales: Number(salesRow.totalSales || 0),
        totalOrders: recentOrders.length,
        totalProducts: Number(productCountRow.totalProducts || 0),
        pendingOrders: Number(pendingOrdersRow.pendingOrders || 0),
        totalStock: Number(stockRow.totalStock || 0),
      },
      recentProducts: mappedProducts,
      recentOrders,
    });
  } catch (err) {
    console.error('Seller me dashboard error:', err);
    res.status(500).json({ error: 'Could not load seller dashboard' });
  }
});

app.get('/seller/products', async (req, res) => {
  try {
    const seller = await requireApprovedSeller(req, res);
    if (!seller) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        p.description,
        p.price,
        p.discountPrice,
        p.stock,
        p.sku,
        p.images,
        p.brand,
        BIN_TO_UUID(p.categoryId) AS categoryId,
        c.name AS categoryName
      FROM Product p
      LEFT JOIN Category c ON c.id = p.categoryId
      WHERE p.sellerId = UUID_TO_BIN(?)
      ORDER BY p.createdAt DESC
      `,
      [seller.id],
    );

    const productIds = rows.map((row) => String(row.id));
    const { byProductId, groupedByType } = await fetchProductVariantsByProductIds(productIds);
    res.json(
      rows.map((row) => {
        const productId = String(row.id || '');
        return {
          ...row,
          images: parseImageArray(row.images),
          variants: byProductId.get(productId) || [],
          variantGroups: groupedByType.get(productId) || [],
        };
      }),
    );
  } catch (err) {
    console.error('Seller products error:', err);
    res.status(500).json({ error: 'Could not load seller products' });
  }
});

app.post('/seller/products', async (req, res) => {
  const { name, description, price, discountPrice, stock, sku, images, brand, categoryId, variantGroups } = req.body || {};
  if (!name || !categoryId) {
    return res.status(400).json({ error: 'name and categoryId are required' });
  }

  try {
    const seller = await requireApprovedSeller(req, res);
    if (!seller) return;

    const parsedImages = await resolveImagesInput(images, 'products');
    const id = randomUUID();
    await pool.execute(
      `
      INSERT INTO Product (
        id, name, description, price, discountPrice, stock, sku, images, brand, weight, sellerId, categoryId
      )
      VALUES (
        UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, NULL, UUID_TO_BIN(?), UUID_TO_BIN(?)
      )
      `,
      [
        id,
        String(name).trim(),
        typeof description === 'string' ? description.trim() : '',
        Number(price || 0),
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
        Number(stock || 0),
        typeof sku === 'string' && sku.trim() ? sku.trim() : `SKU-${Date.now()}`,
        JSON.stringify(parsedImages),
        typeof brand === 'string' ? brand.trim() : '',
        seller.id,
        categoryId,
      ],
    );

    await replaceProductVariants({
      productId: id,
      variantGroups,
      fallbackPrice: Number(price || 0),
      fallbackDiscountPrice:
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
      fallbackStock: Number(stock || 0),
    });

    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('Create seller product error:', err);
    res.status(500).json({ error: 'Could not create product' });
  }
});

app.patch('/seller/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, discountPrice, stock, sku, images, brand, categoryId, variantGroups } = req.body || {};

  try {
    const seller = await requireApprovedSeller(req, res);
    if (!seller) return;

    const parsedImages = images !== undefined ? await resolveImagesInput(images, 'products') : null;
    const normalizedDiscountPrice =
      discountPrice !== undefined
        ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice))
        : undefined;

    const [result] = await pool.execute(
      `
      UPDATE Product
      SET
        name = COALESCE(NULLIF(?, ''), name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        discountPrice = COALESCE(?, discountPrice),
        stock = COALESCE(?, stock),
        sku = COALESCE(NULLIF(?, ''), sku),
        images = COALESCE(?, images),
        brand = COALESCE(?, brand),
        categoryId = COALESCE(UUID_TO_BIN(?), categoryId)
      WHERE id = UUID_TO_BIN(?) AND sellerId = UUID_TO_BIN(?)
      `,
      [
        typeof name === 'string' ? name.trim() : '',
        description !== undefined ? String(description) : null,
        price !== undefined ? Number(price) : null,
        normalizedDiscountPrice !== undefined ? normalizedDiscountPrice : null,
        stock !== undefined ? Number(stock) : null,
        typeof sku === 'string' ? sku.trim() : '',
        parsedImages !== null ? JSON.stringify(parsedImages) : null,
        brand !== undefined ? String(brand).trim() : null,
        categoryId || null,
        id,
        seller.id,
      ],
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });

    if (variantGroups !== undefined) {
      await replaceProductVariants({
        productId: id,
        variantGroups,
        fallbackPrice: price !== undefined ? Number(price || 0) : 0,
        fallbackDiscountPrice:
          discountPrice !== undefined
            ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice))
            : null,
        fallbackStock: stock !== undefined ? Number(stock || 0) : 0,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Update seller product error:', err);
    res.status(500).json({ error: 'Could not update product' });
  }
});

app.delete('/seller/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const seller = await requireApprovedSeller(req, res);
    if (!seller) return;

    const [result] = await pool.execute(
      `DELETE FROM Product WHERE id = UUID_TO_BIN(?) AND sellerId = UUID_TO_BIN(?)`,
      [id, seller.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete seller product error:', err);
    res.status(500).json({ error: 'Could not delete product' });
  }
});

// Admin APIs
app.get('/admin/reports', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [[usersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM User');
    const [[sellersCount]] = await pool.execute("SELECT COUNT(*) AS count FROM User WHERE role = 'SELLER' AND isApproved = 1");
    const [[productsCount]] = await pool.execute('SELECT COUNT(*) AS count FROM Product');
    const [[ordersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM `Order`');
    const [[revenue]] = await pool.execute('SELECT COALESCE(SUM(totalAmount), 0) AS total FROM `Order`');

    const [topProducts] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        COALESCE(SUM(oi.quantity), 0) AS unitsSold,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
      FROM Product p
      LEFT JOIN OrderItem oi ON oi.productId = p.id
      GROUP BY p.id, p.name
      ORDER BY unitsSold DESC, revenue DESC
      LIMIT 10
      `,
    );

    res.json({
      stats: {
        totalUsers: Number(usersCount.count || 0),
        totalSellers: Number(sellersCount.count || 0),
        totalProducts: Number(productsCount.count || 0),
        totalOrders: Number(ordersCount.count || 0),
        totalRevenue: Number(revenue.total || 0),
      },
      topProducts: topProducts.map((row) => ({
        ...row,
        unitsSold: Number(row.unitsSold || 0),
        revenue: Number(row.revenue || 0),
      })),
    });
  } catch (err) {
    console.error('Admin reports error:', err);
    res.status(500).json({ error: 'Could not load reports' });
  }
});

app.get('/admin/categories', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(c.id) AS id,
        c.name,
        c.image,
        COUNT(p.id) AS productsCount
      FROM Category c
      LEFT JOIN Product p ON p.categoryId = c.id
      GROUP BY c.id, c.name, c.image
      ORDER BY c.name ASC
      `,
    );
    res.json(
      rows.map((row) => ({
        ...row,
        image: toPublicImageUrl(row.image),
        productsCount: Number(row.productsCount || 0),
      })),
    );
  } catch (err) {
    console.error('Admin categories error:', err);
    res.status(500).json({ error: 'Could not load categories' });
  }
});

app.post('/admin/categories', async (req, res) => {
  const { name, image } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedImage = await resolveImageInput(image, 'categories');
    const id = randomUUID();
    await pool.execute(
      `
      INSERT INTO Category (id, name, parentId, image)
      VALUES (UUID_TO_BIN(?), ?, NULL, ?)
      `,
      [id, normalizedName, normalizedImage],
    );
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Could not create category' });
  }
});

app.patch('/admin/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name, image } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedImage = image !== undefined ? await resolveImageInput(image, 'categories') : null;
    const [result] = await pool.execute(
      `
      UPDATE Category
      SET name = COALESCE(NULLIF(?, ''), name),
          image = COALESCE(?, image)
      WHERE id = UUID_TO_BIN(?)
      `,
      [typeof name === 'string' ? name.trim() : '', normalizedImage, id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Could not update category' });
  }
});

app.delete('/admin/categories/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [[used]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM Product WHERE categoryId = UUID_TO_BIN(?)`,
      [id],
    );
    if (Number(used.count || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete category that still has products' });
    }

    const [result] = await pool.execute(`DELETE FROM Category WHERE id = UUID_TO_BIN(?)`, [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Could not delete category' });
  }
});

app.get('/admin/products', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        p.description,
        p.price,
        p.discountPrice,
        p.stock,
        p.sku,
        p.images,
        p.brand,
        BIN_TO_UUID(p.sellerId) AS sellerId,
        BIN_TO_UUID(p.categoryId) AS categoryId,
        c.name AS categoryName,
        u.name AS sellerName
      FROM Product p
      LEFT JOIN Category c ON c.id = p.categoryId
      LEFT JOIN User u ON u.id = p.sellerId
      ORDER BY p.createdAt DESC
      `,
    );
    const productIds = rows.map((row) => String(row.id));
    const { byProductId, groupedByType } = await fetchProductVariantsByProductIds(productIds);
    res.json(
      rows.map((row) => {
        const productId = String(row.id || '');
        return {
          ...row,
          images: parseImageArray(row.images),
          variants: byProductId.get(productId) || [],
          variantGroups: groupedByType.get(productId) || [],
        };
      }),
    );
  } catch (err) {
    console.error('Admin products error:', err);
    res.status(500).json({ error: 'Could not load products' });
  }
});

app.get('/settings/promo-banner', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT value
      FROM AppSetting
      WHERE \`key\` = ?
      LIMIT 1
      `,
      [PROMO_BANNER_SETTING_KEY],
    );

    const image = rows.length ? toPublicImageUrl(rows[0].value) : '';
    res.json({ image });
  } catch (err) {
    console.error('Promo banner settings read error:', err);
    res.status(500).json({ error: 'Could not load promo banner settings' });
  }
});

app.patch('/admin/settings/promo-banner', async (req, res) => {
  const { image } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (image === undefined) {
      return res.status(400).json({ error: 'image is required' });
    }

    const normalizedImage = await resolveImageInput(image, 'banners');
    await pool.execute(
      `
      INSERT INTO AppSetting (\`key\`, value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)
      `,
      [PROMO_BANNER_SETTING_KEY, normalizedImage],
    );

    res.json({ ok: true, image: normalizedImage });
  } catch (err) {
    console.error('Promo banner settings update error:', err);
    res.status(500).json({ error: 'Could not update promo banner settings' });
  }
});

app.post('/admin/products', async (req, res) => {
  const { name, description, price, discountPrice, stock, sku, images, brand, sellerId, categoryId, variantGroups } = req.body || {};
  if (!name || !categoryId) {
    return res.status(400).json({ error: 'name and categoryId are required' });
  }

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedCategoryId = String(categoryId || '').trim();
    const resolvedSellerId = String(sellerId || admin.id || '').trim();
    const [categoryRows] = await pool.execute(
      `SELECT BIN_TO_UUID(id) AS id FROM Category WHERE id = UUID_TO_BIN(?) LIMIT 1`,
      [normalizedCategoryId],
    );
    if (!categoryRows.length) {
      return res.status(400).json({ error: 'Invalid categoryId' });
    }

    const [sellerRows] = await pool.execute(
      `SELECT BIN_TO_UUID(id) AS id FROM User WHERE id = UUID_TO_BIN(?) LIMIT 1`,
      [resolvedSellerId],
    );
    if (!sellerRows.length) {
      return res.status(400).json({ error: 'Invalid sellerId' });
    }

    const parsedImages = await resolveImagesInput(images, 'products');
    const id = randomUUID();
    await pool.execute(
      `
      INSERT INTO Product (
        id, name, description, price, discountPrice, stock, sku, images, brand, weight, sellerId, categoryId
      )
      VALUES (
        UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, NULL, UUID_TO_BIN(?), UUID_TO_BIN(?)
      )
      `,
      [
        id,
        String(name).trim(),
        typeof description === 'string' ? description : '',
        Number(price || 0),
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
        Number(stock || 0),
        typeof sku === 'string' && sku.trim() ? sku.trim() : `SKU-${Date.now()}`,
        JSON.stringify(parsedImages),
        typeof brand === 'string' ? brand.trim() : '',
        resolvedSellerId,
        normalizedCategoryId,
      ],
    );

    await replaceProductVariants({
      productId: id,
      variantGroups,
      fallbackPrice: Number(price || 0),
      fallbackDiscountPrice:
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
      fallbackStock: Number(stock || 0),
    });

    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({
      error: err?.sqlMessage || err?.message || 'Could not create product',
    });
  }
});

app.patch('/admin/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, discountPrice, stock, sku, images, brand, sellerId, categoryId, variantGroups } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const parsedImages = images !== undefined ? await resolveImagesInput(images, 'products') : null;
    const normalizedDiscountPrice =
      discountPrice !== undefined
        ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice))
        : undefined;

    const [result] = await pool.execute(
      `
      UPDATE Product
      SET
        name = COALESCE(NULLIF(?, ''), name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        discountPrice = CASE WHEN ? = 1 THEN ? ELSE discountPrice END,
        stock = COALESCE(?, stock),
        sku = COALESCE(NULLIF(?, ''), sku),
        images = COALESCE(?, images),
        brand = COALESCE(?, brand),
        sellerId = COALESCE(UUID_TO_BIN(?), sellerId),
        categoryId = COALESCE(UUID_TO_BIN(?), categoryId)
      WHERE id = UUID_TO_BIN(?)
      `,
      [
        typeof name === 'string' ? name.trim() : '',
        description !== undefined ? String(description) : null,
        price !== undefined ? Number(price) : null,
        normalizedDiscountPrice !== undefined ? 1 : 0,
        normalizedDiscountPrice !== undefined ? normalizedDiscountPrice : null,
        stock !== undefined ? Number(stock) : null,
        typeof sku === 'string' ? sku.trim() : '',
        parsedImages !== null ? JSON.stringify(parsedImages) : null,
        brand !== undefined ? String(brand).trim() : null,
        sellerId || null,
        categoryId || null,
        id,
      ],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });

    if (variantGroups !== undefined) {
      await replaceProductVariants({
        productId: id,
        variantGroups,
        fallbackPrice: price !== undefined ? Number(price || 0) : 0,
        fallbackDiscountPrice:
          discountPrice !== undefined
            ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice))
            : null,
        fallbackStock: stock !== undefined ? Number(stock || 0) : 0,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Could not update product' });
  }
});

app.delete('/admin/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [result] = await pool.execute(`DELETE FROM Product WHERE id = UUID_TO_BIN(?)`, [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Could not delete product' });
  }
});

app.get('/admin/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        email,
        role,
        phone,
        isApproved,
        createdAt
      FROM User
      ORDER BY createdAt DESC
      `,
    );
    res.json(rows);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Could not load users' });
  }
});

app.patch('/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, isApproved } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [result] = await pool.execute(
      `
      UPDATE User
      SET
        name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email),
        phone = COALESCE(NULLIF(?, ''), phone),
        role = COALESCE(NULLIF(?, ''), role),
        isApproved = COALESCE(?, isApproved)
      WHERE id = UUID_TO_BIN(?)
      `,
      [
        typeof name === 'string' ? name.trim() : '',
        typeof email === 'string' ? email.trim() : '',
        typeof phone === 'string' ? phone.trim() : '',
        typeof role === 'string' ? role.trim().toUpperCase() : '',
        isApproved !== undefined ? Number(isApproved) : null,
        id,
      ],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Could not update user' });
  }
});

app.get('/admin/seller-requests', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(r.id) AS id,
        BIN_TO_UUID(r.userId) AS userId,
        r.status,
        r.message,
        r.reviewNote,
        r.createdAt,
        r.reviewedAt,
        u.name,
        u.email,
        u.phone
      FROM SellerUpgradeRequest r
      JOIN User u ON u.id = r.userId
      ORDER BY r.createdAt DESC
      `,
    );
    res.json(rows);
  } catch (err) {
    console.error('Seller requests error:', err);
    res.status(500).json({ error: 'Could not load seller requests' });
  }
});

app.patch('/admin/seller-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { action, reviewNote } = req.body || {};
  const normalizedAction = String(action || '').toUpperCase();

  if (!['APPROVE', 'REJECT'].includes(normalizedAction)) {
    return res.status(400).json({ error: "action must be 'APPROVE' or 'REJECT'" });
  }

  const connection = await pool.getConnection();
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        BIN_TO_UUID(userId) AS userId,
        status
      FROM SellerUpgradeRequest
      WHERE id = UUID_TO_BIN(?)
      LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Seller request not found' });
    }

    const request = rows[0];
    if (String(request.status).toUpperCase() !== 'PENDING') {
      await connection.rollback();
      return res.status(400).json({ error: 'Seller request is already processed' });
    }

    const nextStatus = normalizedAction === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await connection.execute(
      `
      UPDATE SellerUpgradeRequest
      SET status = ?, reviewNote = ?, reviewedBy = UUID_TO_BIN(?), reviewedAt = NOW()
      WHERE id = UUID_TO_BIN(?)
      `,
      [nextStatus, typeof reviewNote === 'string' ? reviewNote.trim() : null, admin.id, id],
    );

    if (nextStatus === 'APPROVED') {
      await connection.execute(
        `
        UPDATE User
        SET role = 'SELLER', isApproved = 1
        WHERE id = UUID_TO_BIN(?)
        `,
        [request.userId],
      );
    }

    await connection.commit();
    res.json({ ok: true, status: nextStatus });
  } catch (err) {
    await connection.rollback();
    console.error('Review seller request error:', err);
    res.status(500).json({ error: 'Could not review seller request' });
  } finally {
    connection.release();
  }
});

app.get('/', (req, res) => {
  res.send('Server is running and connected to the database!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
