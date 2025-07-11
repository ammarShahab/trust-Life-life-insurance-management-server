const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

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

    // save policies data to the db
    app.post("/policies", async (req, res) => {
      try {
        const newPolicy = req.body;
        console.log(newPolicy);

        const result = await policiesCollection.insertOne(newPolicy);
        res.send(result);
      } catch (error) {
        console.error("Error creating policy:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // get all the policies to show in Ui
    app.get("/policies", async (req, res) => {
      try {
        const policies = await policiesCollection.find().toArray();
        res.send(policies);
      } catch (error) {
        console.error("❌ Error fetching policies:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // update policies
    app.patch("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedPolicy = req.body;

        // 🛡️ Prevent MongoDB _id mutation error
        console.log("Updating Policy ID:", id, updatedPolicy);
        delete updatedPolicy._id;

        // Check for valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid policy ID" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedPolicy,
        };

        const result = await policiesCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Policy not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("❌ Error updating policy:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Delete policies
    app.delete("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid policy ID" });
        }

        const filter = { _id: new ObjectId(id) };
        const result = await policiesCollection.deleteOne(filter);

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ message: "Policy not found or already deleted" });
        }

        res.send(result);
      } catch (error) {
        console.error("❌ Error deleting policy:", error);
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
