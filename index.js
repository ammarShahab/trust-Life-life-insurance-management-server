const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
require("dotenv").config();
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// MongoDB URI from .env
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bmunlsr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("trustLife_db");
    const policiesCollection = db.collection("policies");

    app.post("/policies", async (req, res) => {
      try {
        const newPolicy = req.body;
        console.log(newPolicy);

        /*  if (!newPolicy.policyName || !newPolicy.premium) {
          return res.status(400).json({ message: "Missing required fields" });
        } */

        const result = await policiesCollection.insertOne(newPolicy);
        res.send(result);
      } catch (error) {
        console.error("Error creating policy:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Optional: Test ping
    await db.command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run();

// Base route
app.get("/", (req, res) => {
  res.send("🚀 TrustLife server is running!");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
