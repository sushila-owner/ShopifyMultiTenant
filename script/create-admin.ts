import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function createOrUpdateAdmin() {
  const email = "business@sushilaapexmart.com";
  const password = "Sushila@1234&?";
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    
    if (existingUser.length > 0) {
      await db.update(users)
        .set({ 
          password: hashedPassword, 
          role: "admin", 
          name: "Sushila Admin",
          isActive: true 
        })
        .where(eq(users.email, email));
      console.log("Updated existing user to admin:", email);
    } else {
      await db.insert(users).values({
        email,
        password: hashedPassword,
        name: "Sushila Admin",
        role: "admin",
        isActive: true,
      });
      console.log("Created new admin user:", email);
    }
    
    const user = await db.select({ id: users.id, email: users.email, role: users.role, name: users.name })
      .from(users)
      .where(eq(users.email, email));
    console.log("Admin user:", user[0]);
    
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

createOrUpdateAdmin();
