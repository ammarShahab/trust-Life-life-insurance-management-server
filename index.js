require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");

const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.Stripe_Secret_Key);

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

// const serviceAccount = require("./firbase_admin_key.json");
const serviceAccount = JSON.parse(decodedKey);

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
    // await client.connect();
    const db = client.db("trustLife_db");
    const policiesCollection = db.collection("policies");
    const customersCollection = db.collection("customers");
    const applicationsCollection = db.collection("applications");
    const reviewsCollection = db.collection("reviews");
    const paymentsCollection = db.collection("payments");
    const blogsCollection = db.collection("blogs");
    const newslettersCollection = db.collection("newsletters");

    // create custom middleware to verify fb token
    const verifyFBToken = async (req, res, next) => {
      // console.log("headers in middleware", req.headers);

      // check headers
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res
          .status(401)
          .send({ message: "unauthorized access: No Token" });
      }

      // check tokens
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        // console.log("✅ Firebase decoded token:", decoded);

        next();
      } catch (error) {
        return res.status(403).send({ message: "Forbidden: Invalid token" });
      }
      // todo: in server side all the get operation using email will also verified by this decoded like following from 25.12
      // console.log("decoded", req.decoded);
    };

    // save policies data to the db
    app.post("/policies", async (req, res) => {
      try {
        const newPolicy = req.body;
        // console.log(newPolicy);

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
        // console.log("decoded", req.decoded);
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
    /* app.get("/all-policies", async (req, res) => {
      try {
        const { category, search } = req.query;

        const query = {};

        // Filter by category
        if (category) {
          query.category = category;
        }

        // Search by title using case-insensitive regex
        if (search) {
          query.title = { $regex: search, $options: "i" }; // 'i' = case-insensitive
        }

        const policies = await policiesCollection.find(query).toArray();
        res.send(policies);
      } catch (error) {
        console.error("❌ Error fetching policies:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    }); */

    // Backend route: GET /all-policies
    app.get("/all-policies", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9;
        const skip = (page - 1) * limit;

        const category = req.query.category;
        const search = req.query.search;

        const filter = {};

        if (category && category !== "all") {
          filter.category = category;
        }

        if (search) {
          filter.title = { $regex: search, $options: "i" };
        }

        const total = await policiesCollection.countDocuments(filter);
        const policies = await policiesCollection
          .find(filter)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({ policies, total });
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch policies" });
      }
    });

    // Get popular policies
    // GET top 6 most purchased policies
    app.get("/popular-policies", async (req, res) => {
      try {
        const result = await policiesCollection
          .find({})
          .sort({ purchasedCount: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch popular policies" });
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
    app.patch("/policies/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedPolicy = req.body;

        // 🛡️ Prevent MongoDB _id mutation error
        // console.log("Updating Policy ID:", id, updatedPolicy);
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
    app.delete("/policies/:id", verifyFBToken, async (req, res) => {
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
        // console.log(applicationData);

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

    // get the application that customer applied
    app.get("/my-applications", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).json({ message: "Email query is required" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        // ✅ Security check: ensure the requested email matches the authenticated user
        if (req.decoded.email !== email) {
          return res.status(403).json({ message: "Forbidden access" });
        }

        // ✅ Fetch applications for this email
        const applications = await applicationsCollection
          .find({ email })
          .toArray();

        res.send(applications);
      } catch (error) {
        console.error("❌ Failed to fetch customer applications:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // get the specific application
    app.get(
      "/policy-applications/:applicationId",
      verifyFBToken,
      async (req, res) => {
        try {
          const id = req.params.applicationId;
          // console.log("application id", id);

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid application ID" });
          }

          const application = await applicationsCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!application) {
            return res.status(404).json({ message: "Application not found" });
          }

          res.send(application);
        } catch (error) {
          console.error("❌ Error fetching application:", error);
          res.status(500).json({ message: "Internal Server Error" });
        }
      }
    );

    // ✅ Get all PAID applications (for ManageApplications table)
    app.get("/applications/paid", verifyFBToken, async (req, res) => {
      try {
        const paidApplications = await applicationsCollection
          .find({ status: "paid" })
          .toArray();
        /* console.log(
          "paidApplication from /applications/paid routes",
          paidApplications
        ); */

        res.send(paidApplications);
      } catch (error) {
        console.error("❌ Error fetching paid applications:", error);
        res.status(500).send({ error: "Failed to fetch applications" });
      }
    });

    // Get all agents from customers collection
    app.get("/agents", verifyFBToken, async (req, res) => {
      try {
        const agents = await customersCollection
          .find({ role: "agent" })
          .project({ customerName: 1, email: 1, _id: 0 })
          .toArray();
        res.send(agents);
      } catch (error) {
        console.error("Error fetching agents:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/limited-agents", async (req, res) => {
      try {
        const agents = await customersCollection
          .find({ role: "agent" })
          .project({ customerName: 1, email: 1, photoURL: 1, _id: 0 })
          .limit(3)
          .toArray();
        res.send(agents);
      } catch (error) {
        console.error("Error fetching agents:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Assign an agent and update application status to approved
    app.patch(
      "/policy-applications/:id/assign-agent",
      verifyFBToken,
      async (req, res) => {
        const applicationId = req.params.id;
        const { agentName, agentEmail } = req.body;

        try {
          const result = await applicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            {
              $set: {
                status: "approved",
                agentName,
                agentEmail,
                agent_status: "pending",
              },
            }
          );

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: "Agent assigned successfully.",
            });
          } else {
            res
              .status(404)
              .send({ success: false, message: "Application not found." });
          }
        } catch (error) {
          console.error("❌ Failed to assign agent:", error);
          res.status(500).send({ success: false, message: "Server error" });
        }
      }
    );

    // Reject the application and update status to rejected
    app.patch(
      "/policy-applications/:id/reject",
      verifyFBToken,
      async (req, res) => {
        const applicationId = req.params.id;

        try {
          const result = await applicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            { $set: { status: "rejected" } }
          );

          if (result.modifiedCount > 0) {
            res.send({ success: true, message: "Application rejected." });
          } else {
            res
              .status(404)
              .send({ success: false, message: "Application not found." });
          }
        } catch (error) {
          console.error("❌ Error rejecting application:", error);
          res.status(500).send({ success: false, message: "Server error" });
        }
      }
    );

    //get the Assigned Applications by Agent Email
    app.get("/assigned-applications", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const assigned = await applicationsCollection
          .find({ agentEmail: email })
          .toArray();
        res.send(assigned);
      } catch (error) {
        console.error("Failed to fetch assigned applications:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Update Agent Status & Increment Purchase Count
    app.patch(
      "/assigned-applications/:id/update-status",
      verifyFBToken,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { agent_status, policyId } = req.body;

          const result = await applicationsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { agent_status } }
          );

          // If approved, increment purchasedCount in policies collection
          if (agent_status === "approved") {
            await policiesCollection.updateOne(
              { _id: new ObjectId(policyId) },
              { $inc: { purchasedCount: 1 } }
            );
          }

          res.send({ success: true, updated: result.modifiedCount > 0 });
        } catch (error) {
          console.error("Failed to update status:", error);
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    );

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

    // Fetch user by email
    app.get("/customers/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const user = await customersCollection.findOne({ email });
      res.send(user);
    });

    // PUT: Update profile
    app.put("/customers/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const { customerName, photoURL } = req.body;

      const result = await customersCollection.updateOne(
        { email },
        { $set: { customerName, photoURL } },
        { upsert: true }
      );

      res.send(result);
    });

    // customer update last login
    /* app.put("/customer/update-last-login", verifyFBToken, async (req, res) => {
      const { email, lastSignInTime } = req.body;

      if (!email || !lastSignInTime) {
        return res.status(400).json({ message: "Missing fields" });
      }

      const result = await customersCollection.updateOne(
        { email },
        { $set: { lastSignInTime } },
        { upsert: true }
      );

      res.send({ success: true, result });
    });
 */

    // api for get the role from the db for differentiate the dashboard home
    app.get("/customers/role/:email", verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
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

    // get all the users
    app.get("/customers", verifyFBToken, async (req, res) => {
      try {
        const users = await customersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // promote a customer to agent
    app.patch("/customers/:id/promote", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await customersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "agent" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to promote user" });
      }
    });

    // demote agent to customer
    app.patch("/customers/:id/demote", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await customersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "customer" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to demote user" });
      }
    });

    // delete a customer
    app.delete("/customers/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await customersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to delete user" });
      }
    });

    // POST: Create a new blog
    app.post("/blogs", verifyFBToken, async (req, res) => {
      const blog = req.body;
      blog.publishDate = new Date(); // Auto timestamp
      const result = await blogsCollection.insertOne(blog);
      res.send(result);
    });

    // GET blogs (for admin or specific user)
    app.get("/blogs", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const customer = await customersCollection.findOne({ email });

      const query = customer?.role === "admin" ? {} : { authorEmail: email };
      const blogs = await blogsCollection
        .find(query)
        .sort({ publishDate: -1 })
        .toArray();
      res.send(blogs);
    });

    // Get All Blogs
    app.get("/all-blogs", async (req, res) => {
      try {
        const blogs = await blogsCollection.find().toArray();
        res.send(blogs);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch blogs." });
      }
    });

    // get the latest blog by publishDate
    app.get("/blog-latest", async (req, res) => {
      try {
        const latestBlogs = await blogsCollection
          .find({})
          .sort({ publishDate: -1 }) // newest first
          .limit(4)
          .toArray();

        res.status(200).json(latestBlogs);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch latest blogs" });
      }
    });

    // Increment Visit Count by +1 by customer
    app.patch("/blogs/visit/:id", async (req, res) => {
      try {
        const blogId = req.params.id;
        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(blogId) },
          { $inc: { totalVisit: 1 } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to update visit count." });
      }
    });

    //blog details api for except customer /blogs/:id.
    app.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });

        if (blog) {
          res.send(blog);
        } else {
          res.status(404).send({ message: "Blog not found" });
        }
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch blog", error: err });
      }
    });

    // Update blog by ID
    app.put("/blogs/:id", verifyFBToken, async (req, res) => {
      try {
        const blogId = req.params.id;
        const updatedBlogData = req.body;

        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(blogId) },
          {
            $set: {
              title: updatedBlogData.title,
              content: updatedBlogData.content,
              imageUrl: updatedBlogData.imageUrl,
              publishDate: new Date().toISOString(),
            },
          }
        );

        if (result.modifiedCount === 1) {
          res.status(200).send({ message: "Blog updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "Blog not found or already up to date" });
        }
      } catch (error) {
        console.error("Error updating blog:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // DELETE blog
    app.delete("/blogs/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const result = await blogsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Get applications with agent_status: "approved" for specific customer email
    app.get("/claim-requests/claim", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await applicationsCollection
          .find({ email, agent_status: "approved" })
          .toArray();

        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ error: "Failed to fetch claimable applications" });
      }
    });

    // Update claim fields for a specific application
    app.patch(
      "/claim-request/:applicationId",
      verifyFBToken,
      async (req, res) => {
        try {
          const { applicationId } = req.params;
          const { claim_reason, claim_document, claim_status } = req.body;
          // console.log("claim doc", claim_document);

          const result = await applicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            {
              $set: {
                claim_reason,
                claim_document,
                claim_status,
              },
            }
          );

          res.send(result);
        } catch (err) {
          res.status(500).send({ error: "Failed to submit claim" });
        }
      }
    );

    // GET - agent Get applications claimed by customer
    app.get("/claim-requests", verifyFBToken, async (req, res) => {
      try {
        const agentEmail = req.decoded.email;

        const result = await applicationsCollection
          .aggregate([
            {
              $match: {
                agentEmail,
                claim_status: "claimed",
              },
            },
            // Join with paymentsCollection
            {
              $lookup: {
                from: "paymentsCollection",
                let: { appIdStr: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$applicationId", "$$appIdStr"] },
                    },
                  },
                  {
                    $project: {
                      amount: 1,
                    },
                  },
                ],
                as: "paymentInfo",
              },
            },
            // Join with policiesCollection
            {
              $lookup: {
                from: "policiesCollection",
                let: { policyIdObj: { $toObjectId: "$policyId" } },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$_id", "$$policyIdObj"] },
                    },
                  },
                  {
                    $project: {
                      title: 1,
                      description: 1,
                      coverage: 1,
                      duration: 1,
                    },
                  },
                ],
                as: "policyInfo",
              },
            },
            {
              $unwind: {
                path: "$paymentInfo",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unwind: {
                path: "$policyInfo",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                name: 1,
                email: 1,
                policyTitle: 1,
                policyId: 1,
                claim_status: 1,
                claim_reason: 1,
                claim_document: 1,
                amount: "$paymentInfo.amount",
                policyInfo: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch claim requests" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amount, paymentDuration } = req.body;
      // const paymentDuration = req.body.paymentDuration;
      // console.log(paymentDuration);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // creating payment history
    app.post("/payments", verifyFBToken, async (req, res) => {
      try {
        const {
          policyTitle,
          policyId,
          applicationId,
          email,
          amount,
          transactionId,
          paymentMethod,
          paymentDuration,
          status,
        } = req.body;

        // console.log(req.body);

        const paymentTime = new Date().toISOString();

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        // Update application payment status
        const applicationUpdateResult = await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          { $set: { status: "paid" } }
        );

        const updatedApplication = await applicationsCollection.findOne({
          _id: new ObjectId(applicationId),
        });

        // Save payment history
        const paymentData = {
          policyTitle,
          policyId,
          applicationId,
          email,
          amount,
          paymentMethod,
          status: updatedApplication?.status || "paid",
          paymentTime,
          transactionId,
          paymentDuration,
        };

        // console.log(paymentData);

        const paymentSaveResult = await paymentsCollection.insertOne(
          paymentData
        );

        res.send(paymentSaveResult);
      } catch (error) {
        console.error("❌ Payment processing error:", error);
        res.status(500).send({ error: "Payment failed" });
      }
    });

    app.get("/transactions", verifyFBToken, async (req, res) => {
      try {
        const payments = await paymentsCollection.find().toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).send({ error: "Failed to fetch payments" });
      }
    });

    app.post("/reviews", verifyFBToken, async (req, res) => {
      const reviewData = req.body;
      // console.log(reviewData);
      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });

    // get all reviews by customer
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // POST: Save Newsletter Subscription
    app.post("/newsletter-subscription", async (req, res) => {
      const { name, email } = req.body;

      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required." });
      }

      try {
        const result = await newslettersCollection.insertOne({
          name,
          email,
          subscribedAt: new Date(),
        });

        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Newsletter subscription failed:", error);
        res.status(500).send({ success: false, message: "Server Error" });
      }
    });

    // Optional: Test ping
    // await db.command({ ping: 1 });
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
