import pool from "./db.js";

// ── Read real config from env vars ──────────────────────────────────────────
const ADMIN_PHONE  = process.env.ADMIN_PHONE  || "0000000000";
const ADMIN_NAME   = process.env.ADMIN_NAME   || "Admin";
const RIDER_PHONES = (process.env.RIDER_PHONES || "8888888888:Arjun Singh:Hero Splendor,7777777777:Vikram Rao:Honda Activa")
  .split(",").map(r => { const [phone, name, vehicle] = r.split(":"); return { phone, name, vehicle }; });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Schema ──────────────────────────────────────────────────────────────
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
        delivery_otp VARCHAR(4),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(20) REFERENCES orders(id),
        medicine_name VARCHAR(100),
        quantity INT DEFAULT 1,
        price DECIMAL(10,2) DEFAULT 0
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
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── Admin user ───────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO users (phone, name, role) VALUES ($1,$2,'admin')
      ON CONFLICT (phone) DO UPDATE SET name=$2, role='admin'
    `, [ADMIN_PHONE, ADMIN_NAME]);

    console.log(`✅ Admin: ${ADMIN_PHONE} (${ADMIN_NAME})`);

    // ── Rider users ──────────────────────────────────────────────────────────
    for (const { phone, name, vehicle } of RIDER_PHONES) {
      if (!phone) continue;
      const { rows } = await client.query(`
        INSERT INTO users (phone, name, role) VALUES ($1,$2,'rider')
        ON CONFLICT (phone) DO UPDATE SET name=$2, role='rider'
        RETURNING id
      `, [phone, name || "Rider"]);

      const uid = rows[0]?.id;
      if (uid) {
        await client.query(`
          INSERT INTO riders (user_id, vehicle) VALUES ($1,$2)
          ON CONFLICT DO NOTHING
        `, [uid, vehicle || "Bike"]);
        console.log(`✅ Rider: ${phone} (${name}) — ${vehicle}`);
      }
    }

    // ── Medicines (only if table is empty) ───────────────────────────────────
    const { rows: existingMeds } = await client.query("SELECT COUNT(*) FROM medicines");
    if (+existingMeds[0].count === 0) {
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
          ('Omeprazole 20mg','Omez',48,'Digestion','🫃',75,true),
          ('Atorvastatin 10mg','Lipitor',65,'Cardiac','❤️',80,true),
          ('Amlodipine 5mg','Amlo',55,'Cardiac','❤️',70,true),
          ('Pantoprazole 40mg','Pan',38,'Digestion','🫃',90,true),
          ('Losartan 50mg','Losacar',72,'Cardiac','❤️',60,true),
          ('Glimepiride 1mg','Amaryl',45,'Diabetes','💉',80,true)
      `);
      console.log("✅ Medicines seeded (15 items)");
    } else {
      console.log(`ℹ️  Medicines already exist (${existingMeds[0].count} items) — skipping`);
    }

    // ── App settings defaults ────────────────────────────────────────────────
    const defaults = [
      ["shop_name",     "MediRun Pharmacy"],
      ["shop_address",  "Sri Anandpur Sahib, Punjab"],
      ["shop_phone",    ""],
      ["upi_id",        process.env.UPI_ID || "medirun@ybl"],
      ["max_delivery_km", "5"],
      ["delivery_hours", "9:00 AM - 9:00 PM"],
    ];
    for (const [key, value] of defaults) {
      await client.query(`
        INSERT INTO app_settings (key, value) VALUES ($1,$2)
        ON CONFLICT (key) DO NOTHING
      `, [key, value]);
    }

    await client.query("COMMIT");
    console.log("✅ Database ready for production");
    console.log(`\nAdmin login: +91 ${ADMIN_PHONE}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
