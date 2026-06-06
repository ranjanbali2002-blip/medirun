import pool from "./db.js";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'customer',
        address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS otps (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(15) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        brand VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(50),
        icon VARCHAR(10) DEFAULT '💊',
        stock INT DEFAULT 100,
        requires_prescription BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS riders (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        vehicle VARCHAR(100),
        available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS rider_locations (
        rider_id INT REFERENCES riders(id) PRIMARY KEY,
        lat DECIMAL(10,7),
        lon DECIMAL(10,7),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(20) PRIMARY KEY,
        user_id INT REFERENCES users(id),
        status VARCHAR(30) DEFAULT 'pending',
        total DECIMAL(10,2),
        delivery_fee INT DEFAULT 0,
        delivery_address TEXT,
        delivery_lat DECIMAL(10,7),
        delivery_lon DECIMAL(10,7),
        delivery_distance DECIMAL(5,1),
        items INT DEFAULT 1,
        payment_status VARCHAR(30) DEFAULT 'unpaid',
        upi_ref VARCHAR(100),
        rider_id INT REFERENCES riders(id),
        prescription_data TEXT,
        prescription_status VARCHAR(20) DEFAULT 'not_required',
        requires_prescription BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(20) REFERENCES orders(id),
        medicine_name VARCHAR(100),
        quantity INT DEFAULT 1,
        price DECIMAL(10,2) DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS route_groups (
        id SERIAL PRIMARY KEY,
        direction VARCHAR(200),
        distance VARCHAR(20),
        eta VARCHAR(20),
        rider_id INT REFERENCES riders(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS route_group_orders (
        route_group_id INT REFERENCES route_groups(id),
        order_id VARCHAR(20) REFERENCES orders(id),
        PRIMARY KEY (route_group_id, order_id)
      );
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(20) REFERENCES orders(id),
        amount DECIMAL(10,2),
        method VARCHAR(20) DEFAULT 'upi',
        utr_ref VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed demo users
    const adminResult = await client.query(`
      INSERT INTO users (phone, name, role) VALUES
        ('0000000000','Admin User','admin'),
        ('8888888888','Arjun Singh','rider'),
        ('7777777777','Vikram Rao','rider'),
        ('6666666666','Mohit Dev','rider'),
        ('9999999999','Priya Sharma','customer')
      ON CONFLICT (phone) DO NOTHING RETURNING id, phone, role;
    `);

    const userMap = {};
    for (const u of adminResult.rows) userMap[u.phone] = u.id;

    // If we need to fetch existing users
    for (const phone of ['8888888888','7777777777','6666666666']) {
      if (!userMap[phone]) {
        const { rows } = await client.query("SELECT id FROM users WHERE phone=$1", [phone]);
        if (rows[0]) userMap[phone] = rows[0].id;
      }
    }

    // Seed riders
    for (const [phone, vehicle] of [
      ['8888888888','Hero Splendor'],
      ['7777777777','Honda Activa'],
      ['6666666666','TVS Jupiter']
    ]) {
      const uid = userMap[phone];
      if (uid) {
        await client.query(
          "INSERT INTO riders (user_id, vehicle) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [uid, vehicle]
        );
      }
    }

    // Seed medicines
    await client.query(`
      INSERT INTO medicines (name, brand, price, category, icon, stock, requires_prescription) VALUES
        ('Paracetamol 500mg','Crocin',28,'Pain Relief','💊',150,false),
        ('Vitamin C 500mg','Limcee',45,'Vitamins','🍊',200,false),
        ('Cough Syrup','Benadryl',90,'Cold & Flu','🫁',80,false),
        ('Amoxicillin 250mg','Mox',72,'Antibiotic','🔬',60,true),
        ('Antacid Tablet','Digene',35,'Digestion','🫃',120,false),
        ('Ibuprofen 400mg','Brufen',42,'Pain Relief','💊',100,false),
        ('Metformin 500mg','Glycomet',38,'Diabetes','💉',90,true),
        ('Azithromycin 500mg','Azee',95,'Antibiotic','🔬',50,true),
        ('Cetirizine 10mg','Cetzine',22,'Allergy','🌿',110,false),
        ('Omeprazole 20mg','Omez',48,'Digestion','🫃',75,true)
      ON CONFLICT DO NOTHING;
    `);

    await client.query("COMMIT");
    console.log("✅ Database seeded with users, riders, medicines");
    console.log("Demo logins (OTP: 123456):");
    console.log("  Admin:    0000000000");
    console.log("  Rider 1:  8888888888");
    console.log("  Rider 2:  7777777777");
    console.log("  Customer: any other number");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
