const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

const serviceAccount = require("./firbase_admin_key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    const customersCollection = db.collection("customers");
    const applicationsCollection = db.collection("applications");

    // create custom middleware to verify fb token
    const verifyFBToken = async (req, res, next) => {
      console.log("headers in middleware", req.headers);

      // check headers
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // check tokens
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
      // todo: in server side all the get operation using email will also verified by this decoded like following from 25.12
      /* console.log("decoded", req.decoded);
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      } */
    };

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

    // get all the policies to show in Ui for protected admin route
    app.get("/policies", verifyFBToken, async (req, res) => {
      try {
        // for checking the decoded data in server
        console.log("decoded", req.decoded);
        const policies = await policiesCollection.find().toArray();
        res.send(policies);
        /*  const { category } = req.query;
        const query = category ? { category } : {};
        const policies = await policiesCollection.find(query).toArray(); */
        // res.send(policies);
        res.json(policies);
      } catch (error) {
        console.error("❌ Error fetching policies:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // all policies for public route
    app.get("/all-policies", async (req, res) => {
      try {
        const { category } = req.query;
        const query = category ? { category } : {};
        const policies = await policiesCollection.find(query).toArray();
        res.send(policies);
      } catch (error) {
        console.error("❌ Error fetching policies:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // get each policies details
    app.get("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        const policy = await policiesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!policy) {
          return res.status(404).json({ message: "Policy not found" });
        }

        res.status(200).json(policy);
      } catch (error) {
        console.error("❌ Error fetching policy by ID:", error);
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

    // save application to db
    app.post("/policy-applications", verifyFBToken, async (req, res) => {
      try {
        const applicationData = req.body;
        console.log(applicationData);

        const { email, policyId } = applicationData;

        const alreadyExists = await applicationsCollection.findOne({
          email,
          policyId,
        });

        if (alreadyExists) {
          return res
            .status(409)
            .json({ message: "You already applied for this policy." });
        }
        // Insert into DB
        const result = await applicationsCollection.insertOne(applicationData);

        res.send(result);
      } catch (error) {
        console.error("❌ Error saving policy application:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // save customers data in the db in customersCollection during registration
    app.post("/customers", async (req, res) => {
      try {
        const newCustomer = req.body;
        const email = newCustomer.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // Check if customer already exists
        const existingCustomer = await customersCollection.findOne({ email });

        if (existingCustomer) {
          return res.status(200).json({
            message: "Customer already exists",
            inserted: false,
            existingCustomer,
          });
        }

        // Insert new customer
        const result = await customersCollection.insertOne(newCustomer);

        res.send(result);
      } catch (error) {
        console.error("❌ Error saving customer:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // api for get the role from the db for differentiate the dashboard home
    app.get("/customers/role/:email", async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const customer = await customersCollection.findOne({ email });

        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        res.send({
          role: customer.role || "customer",
        });
      } catch (error) {
        console.error("❌ Error fetching customer role:", error);
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
