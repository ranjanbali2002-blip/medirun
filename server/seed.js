import pool from "./db.js";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        brand VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(50),
        icon VARCHAR(10),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS riders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        vehicle VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(20) PRIMARY KEY,
        customer_id INT REFERENCES customers(id),
        status VARCHAR(20) DEFAULT 'pending',
        total DECIMAL(10,2),
        distance DECIMAL(5,1),
        items INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(20) REFERENCES orders(id),
        medicine_name VARCHAR(100),
        quantity INT DEFAULT 1
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
    `);

    // Medicines
    await client.query(`
      INSERT INTO medicines (name, brand, price, category, icon) VALUES
        ('Paracetamol 500mg','Crocin',28,'Pain Relief','💊'),
        ('Vitamin C 500mg','Limcee',45,'Vitamins','🍊'),
        ('Cough Syrup','Benadryl',90,'Cold & Flu','🫁'),
        ('Amoxicillin 250mg','Mox',72,'Antibiotic','🔬'),
        ('Antacid Tablet','Digene',35,'Digestion','🫃'),
        ('Ibuprofen 400mg','Brufen',42,'Pain Relief','💊')
      ON CONFLICT DO NOTHING;
    `);

    // Customers
    const custResult = await client.query(`
      INSERT INTO customers (name, address) VALUES
        ('Priya Sharma','Kiratpur Sahib, Sri Anandpur Sahib'),
        ('Rajesh Kumar','Nangal Rd, Sri Anandpur Sahib'),
        ('Anita Verma','Gurdwara Chowk, Sri Anandpur Sahib'),
        ('Sunil Mehta','Keshgarh Sahib Rd, Sri Anandpur Sahib'),
        ('Deepika Singh','Rupnagar Rd, Sri Anandpur Sahib'),
        ('Harpreet Kaur','Bhakra Canal Side, Sri Anandpur Sahib')
      ON CONFLICT DO NOTHING RETURNING id;
    `);

    // Riders
    const riderResult = await client.query(`
      INSERT INTO riders (name, vehicle) VALUES
        ('Arjun Singh','Hero Splendor'),
        ('Vikram Rao','Honda Activa'),
        ('Mohit Dev','TVS Jupiter')
      ON CONFLICT DO NOTHING RETURNING id;
    `);

    // Only seed orders if customers were inserted
    if (custResult.rows.length > 0) {
      const cids = custResult.rows.map(r => r.id);
      const orders = [
        ['ORX-1042', cids[0], 'delivered', 840, 2.4, 3],
        ['ORX-1043', cids[1], 'transit',   1250, 4.1, 5],
        ['ORX-1044', cids[2], 'transit',    420, 3.7, 2],
        ['ORX-1045', cids[3], 'pending',   2100, 5.2, 7],
        ['ORX-1046', cids[4], 'pending',    990, 6.8, 4],
        ['ORX-1047', cids[5], 'delivered',  180, 3.2, 1],
      ];
      for (const [id, cid, status, total, distance, items] of orders) {
        await client.query(
          "INSERT INTO orders (id, customer_id, status, total, distance, items) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [id, cid, status, total, distance, items]
        );
      }

      const itemsData = [
        ['ORX-1042', ['Paracetamol 500mg','Vitamin C 500mg','Cough Syrup']],
        ['ORX-1043', ['Metformin 500mg','BP Tablet','Antacid']],
        ['ORX-1044', ['Amoxicillin 250mg','Ibuprofen 400mg']],
        ['ORX-1045', ['Insulin','Glucometer Strips','Metformin']],
        ['ORX-1046', ['Thyroid Med','Calcium D3','Iron Tablets']],
        ['ORX-1047', ['Azithromycin 500mg']],
      ];
      for (const [oid, meds] of itemsData) {
        for (const med of meds) {
          await client.query(
            "INSERT INTO order_items (order_id, medicine_name) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [oid, med]
          );
        }
      }

      // Route groups
      if (riderResult.rows.length > 0) {
        const rids = riderResult.rows.map(r => r.id);
        const rg1 = await client.query(
          "INSERT INTO route_groups (direction, distance, eta, rider_id) VALUES ($1,$2,$3,$4) RETURNING id",
          ['North (Kiratpur Sahib → Nangal Rd)', '6.5 km', '18 min', rids[0]]
        );
        const rg2 = await client.query(
          "INSERT INTO route_groups (direction, distance, eta, rider_id) VALUES ($1,$2,$3,$4) RETURNING id",
          ['South (Gurdwara Chowk → Rupnagar Rd)', '10.2 km', '28 min', rids[1]]
        );
        const rg3 = await client.query(
          "INSERT INTO route_groups (direction, distance, eta, rider_id) VALUES ($1,$2,$3,$4) RETURNING id",
          ['East (Bhakra Canal Side)', '3.2 km', '9 min', rids[2]]
        );
        for (const oid of ['ORX-1042','ORX-1043']) {
          await client.query("INSERT INTO route_group_orders VALUES ($1,$2)", [rg1.rows[0].id, oid]);
        }
        for (const oid of ['ORX-1044','ORX-1045','ORX-1046']) {
          await client.query("INSERT INTO route_group_orders VALUES ($1,$2)", [rg2.rows[0].id, oid]);
        }
        await client.query("INSERT INTO route_group_orders VALUES ($1,$2)", [rg3.rows[0].id, 'ORX-1047']);
      }
    }

    await client.query("COMMIT");
    console.log("✅ Database seeded successfully");
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
