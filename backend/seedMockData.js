require('dotenv').config();
const mysql = require('mysql2/promise');
const { randomBytes, scryptSync } = require('crypto');

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const IDs = {
  admin: '00000000-0000-0000-0000-000000000001',
  customerJohn: '11111111-1111-1111-1111-111111111111',
  sellerTech: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
};

const categories = [
  { id: 'c0000000-0000-0000-0000-000000000001', name: 'Electronics', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400' },
  { id: 'c0000000-0000-0000-0000-000000000002', name: 'Fashion', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400' },
  { id: 'c0000000-0000-0000-0000-000000000003', name: 'Sports', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400' },
];

const users = [
  {
    id: IDs.admin,
    name: 'MarketHub Admin',
    email: 'admin@markethub.local',
    password: 'Admin@12345',
    role: 'ADMIN',
    phone: '+251900000000',
    image: null,
    isApproved: 1,
  },
  { id: IDs.customerJohn, name: 'John Doe', email: 'john@example.com', password: 'John@12345', role: 'CUSTOMER', phone: '+251911111111', image: null, isApproved: 1 },
  { id: IDs.sellerTech, name: 'TechStore', email: 'contact@techstore.com', password: 'Seller@12345', role: 'SELLER', phone: '+251955555551', image: null, isApproved: 1 },
];

const hashPassword = (plainPassword) => {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
};

const categoryByName = Object.fromEntries(categories.map((c) => [c.name, c.id]));

const products = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Wireless Bluetooth Headphones',
    description: 'Premium wireless headphones with active noise cancellation and long battery life.',
    price: 7800,
    discountPrice: 4500,
    stock: 45,
    sku: 'SKU-HP-001',
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500'],
    brand: 'TechPro',
    sellerId: IDs.sellerTech,
    categoryId: categoryByName.Electronics,
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Premium Leather Backpack',
    description: 'Durable leather backpack with padded laptop compartment.',
    price: 8500,
    discountPrice: 5100,
    stock: 30,
    sku: 'SKU-BP-002',
    images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500'],
    brand: 'LeatherCraft',
    sellerId: IDs.sellerTech,
    categoryId: categoryByName.Fashion,
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Stainless Steel Water Bottle',
    description: 'Insulated bottle keeps drinks cold for 24 hours.',
    price: 2000,
    discountPrice: 1150,
    stock: 80,
    sku: 'SKU-WB-003',
    images: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500'],
    brand: 'HydroFlask',
    sellerId: IDs.sellerTech,
    categoryId: categoryByName.Sports,
  },
];

const orders = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    userId: IDs.customerJohn,
    totalAmount: 4500,
    status: 'DELIVERED',
    trackingNumber: 'TRK-001',
    itemId: '30000000-0000-0000-0000-000000000001',
    itemProductId: '10000000-0000-0000-0000-000000000001',
    quantity: 1,
    itemPrice: 4500,
    paymentId: '40000000-0000-0000-0000-000000000001',
    transactionId: 'TXN-001',
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    userId: IDs.customerJohn,
    totalAmount: 1150,
    status: 'PROCESSING',
    trackingNumber: 'TRK-002',
    itemId: '30000000-0000-0000-0000-000000000002',
    itemProductId: '10000000-0000-0000-0000-000000000003',
    quantity: 1,
    itemPrice: 1150,
    paymentId: '40000000-0000-0000-0000-000000000002',
    transactionId: 'TXN-002',
  },
];

const cartItems = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    userId: IDs.customerJohn,
    productId: '10000000-0000-0000-0000-000000000001',
    quantity: 1,
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    userId: IDs.customerJohn,
    productId: '10000000-0000-0000-0000-000000000003',
    quantity: 2,
  },
];

async function seed() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.beginTransaction();

    for (const user of users) {
      const passwordHash = hashPassword(user.password);
      await connection.execute(
        `
        INSERT INTO User (id, name, email, password, role, phone, image, isApproved)
        VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          password = VALUES(password),
          role = VALUES(role),
          phone = VALUES(phone),
          image = VALUES(image),
          isApproved = VALUES(isApproved)
        `,
        [user.id, user.name, user.email, passwordHash, user.role, user.phone, user.image, user.isApproved],
      );
    }

    for (const category of categories) {
      await connection.execute(
        `
        INSERT INTO Category (id, name, parentId, image)
        VALUES (UUID_TO_BIN(?), ?, NULL, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          image = VALUES(image)
        `,
        [category.id, category.name, category.image],
      );
    }

    for (const product of products) {
      await connection.execute(
        `
        INSERT INTO Product (id, name, description, price, discountPrice, stock, sku, images, brand, weight, sellerId, categoryId)
        VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, NULL, UUID_TO_BIN(?), UUID_TO_BIN(?))
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          price = VALUES(price),
          discountPrice = VALUES(discountPrice),
          stock = VALUES(stock),
          sku = VALUES(sku),
          images = VALUES(images),
          brand = VALUES(brand),
          sellerId = VALUES(sellerId),
          categoryId = VALUES(categoryId)
        `,
        [
          product.id,
          product.name,
          product.description,
          product.price,
          product.discountPrice,
          product.stock,
          product.sku,
          JSON.stringify(product.images),
          product.brand,
          product.sellerId,
          product.categoryId,
        ],
      );
    }

    for (const order of orders) {
      await connection.execute(
        `
        INSERT INTO \`Order\` (id, userId, totalAmount, status, shippingCost, trackingNumber)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 0, ?)
        ON DUPLICATE KEY UPDATE
          userId = VALUES(userId),
          totalAmount = VALUES(totalAmount),
          status = VALUES(status),
          trackingNumber = VALUES(trackingNumber)
        `,
        [order.id, order.userId, order.totalAmount, order.status, order.trackingNumber],
      );

      await connection.execute(
        `
        INSERT INTO OrderItem (id, orderId, productId, quantity, price)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)
        ON DUPLICATE KEY UPDATE
          quantity = VALUES(quantity),
          price = VALUES(price)
        `,
        [order.itemId, order.id, order.itemProductId, order.quantity, order.itemPrice],
      );

      await connection.execute(
        `
        INSERT INTO Payment (id, orderId, amount, method, status, transactionId)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'CHAPA', 'SUCCESS', ?)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          method = VALUES(method),
          status = VALUES(status),
          transactionId = VALUES(transactionId)
        `,
        [order.paymentId, order.id, order.totalAmount, order.transactionId],
      );
    }

    for (const item of cartItems) {
      await connection.execute(
        `
        INSERT INTO CartItem (id, userId, productId, quantity)
        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?)
        ON DUPLICATE KEY UPDATE
          quantity = VALUES(quantity)
        `,
        [item.id, item.userId, item.productId, item.quantity],
      );
    }

    await connection.commit();

    console.log('Minimal sample data migration complete.');
    console.log(`Users: ${users.length}`);
    console.log(`Categories: ${categories.length}`);
    console.log(`Products: ${products.length}`);
    console.log(`Orders: ${orders.length}`);
    console.log(`Cart items: ${cartItems.length}`);
  } catch (error) {
    await connection.rollback();
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

seed();
